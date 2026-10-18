"""에이전트가 부를 수 있는 도구.

도구는 (스키마, 실행 함수) 한 쌍이다. 스키마는 모델에게 "이런 도구가 있다"고 알리는
용도이고, 실행 함수는 모델이 고른 인자로 실제 일을 한다. 결과는 항상 JSON으로
직렬화되는 값이라야 모델이 읽을 수 있다.
"""

from __future__ import annotations

import html
import random
import re
import threading
import time
from difflib import SequenceMatcher

import requests

from agent.judge import judge

from agent import config

_LASTFM_URL = "https://ws.audioscrobbler.com/2.0/"

# 이 비율 아래면 요청한 곡이 아니라 같은 가수의 다른 곡이다 (Last.fm은 가수만 맞아도 돌려준다)
_TITLE_MATCH = 0.75


def _norm(text: str) -> str:
    return re.sub(r"[\W_]+", "", text.lower())


def _same_title(a: str, b: str) -> bool:
    a, b = _norm(a), _norm(b)
    return bool(a) and (a in b or b in a or SequenceMatcher(None, a, b).ratio() >= _TITLE_MATCH)


class Session:
    """한 질문 동안 에이전트가 이미 본 곡. 같은 태그를 다시 불러도 같은 곡을 또 주지 않는다."""

    def __init__(self) -> None:
        self.seen: set[str] = set()


# 한 번에 판정하는 후보 수. 판정기가 한 번에 처리하는 양(judge.BATCH)과 같게 둔다.
_CANDIDATES = 20


# 조건에 맞는 곡이 이만큼 모일 때까지, 최대 _MAX_ROUNDS번 후보를 더 가져와 판정한다.
# 모델에게 "다음 페이지를 다시 불러라"를 맡기면 작은 모델은 사용자에게 되묻고 멈춘다.
_ENOUGH = 3
# 모델에게 돌려줄 곡 수 상한은 _ENOUGH + 2 (= 5곡)
_MAX_ROUNDS = 3
# 한 번에 판정할 후보 중 한 가수의 곡 수 상한
_PER_ARTIST = 2


def _fetch_fresh(session: Session, tag: str, page: int) -> list[dict]:
    response = requests.get(
        _LASTFM_URL,
        params={
            "method": "tag.gettoptracks",
            "tag": tag.strip().lower(),
            "limit": 50,
            "page": max(1, page),
            "api_key": config.LASTFM_API_KEY,
            "format": "json",
        },
        timeout=10,
    )
    response.raise_for_status()
    found = response.json().get("tracks", {}).get("track", [])
    fresh = [
        {"title": t["name"], "artist": t["artist"]["name"]}
        for t in found
        if f"{t['name']}|{t['artist']['name']}".lower() not in session.seen
    ]
    # 상위 곡에서 무작위로 뽑아, 같은 질문에도 매번 같은 곡만 나오지 않게 한다
    random.shuffle(fresh)
    # 한 가수가 후보를 채우면 판정 곡 수만 늘고 추천은 단조로워진다
    per_artist: dict[str, int] = {}
    picked: list[dict] = []
    for t in fresh:
        if per_artist.get(t["artist"], 0) >= _PER_ARTIST:
            continue
        per_artist[t["artist"]] = per_artist.get(t["artist"], 0) + 1
        picked.append(t)
        if len(picked) >= _CANDIDATES:
            break
    session.seen.update(f"{t['title']}|{t['artist']}".lower() for t in picked)
    return picked


def top_tracks(session: Session, tag: str, condition: str = "", page: int = 1) -> dict:
    """Last.fm 태그의 실제 인기곡을 모으고, 조건이 있으면 그 조건에 맞는 곡만 남긴다.

    작은 모델은 곡을 기억에서 떠올리면 지어내거나 같은 제목을 반복한다. 그래서 곡은
    이 도구가 실제 목록에서 주고, 조건(분위기·나라 등)은 모델이 아니라 판정기가 가른다.
    모델이 곡 목록을 도구 인자로 다시 옮겨 적지 않도록, 모은 곡과 판정은 이 안에서 끝낸다.
    """
    if not config.LASTFM_API_KEY:
        raise RuntimeError("LASTFM_API_KEY가 설정되지 않았습니다")
    condition = condition.strip()

    kept: list[dict] = []
    checked = 0
    for at in range(int(page), int(page) + _MAX_ROUNDS):
        candidates = _fetch_fresh(session, tag, at)
        if not candidates:
            break
        checked += len(candidates)
        if not condition:
            return {"tracks": candidates[:10], "checked": checked}
        kept += [t for t, ok in zip(candidates, judge(condition, candidates)) if ok]
        if len(kept) >= _ENOUGH:
            break

    # 모델은 받은 곡을 전부 나열한다. 추천 수는 프롬프트가 아니라 여기서 정한다.
    result: dict = {"tracks": kept[:_ENOUGH + 2], "checked": checked}
    if not checked:
        result["note"] = "이 태그에는 새로 확인할 곡이 없습니다. 다른 태그를 쓰세요."
    elif len(kept) < 3:
        result["note"] = f"{checked}곡을 확인했지만 조건에 맞는 곡이 {len(kept)}곡뿐입니다. 다른 태그를 쓰세요."
    return result


def _same_artist(a: str, b: str) -> bool:
    a, b = _norm(a), _norm(b)
    return bool(a) and bool(b) and (a in b or b in a or SequenceMatcher(None, a, b).ratio() >= 0.6)


def _search(title: str, artist: str, limit: int) -> list[dict]:
    params = {
        "method": "track.search",
        "track": title,
        "limit": limit,
        "api_key": config.LASTFM_API_KEY,
        "format": "json",
    }
    if artist:
        params["artist"] = artist
    response = requests.get(_LASTFM_URL, params=params, timeout=10)
    response.raise_for_status()
    return response.json().get("results", {}).get("trackmatches", {}).get("track", [])


def find_track(title: str, artist: str = "") -> dict:
    """사용자가 말한 곡이 실제로 있는지 Last.fm에서 확인한다.

    찾으면 `tracks`에 그 곡 하나를 담아 돌려준다 — 곡 목록을 주는 top_tracks와 같은 모양이라
    화면이 같은 방식으로 카드를 만든다. 못 찾으면 `tracks`는 빈 목록이다.

    가수 표기가 Last.fm과 달라서(한글/영문 등) 제목+가수 검색이 빈손일 수 있어, 그때는 제목만으로
    다시 찾고 가수가 비슷한지로 거른다.
    """
    if not config.LASTFM_API_KEY:
        raise RuntimeError("LASTFM_API_KEY가 설정되지 않았습니다")

    with_artist = _search(title, artist, 5) if artist else []
    for t in with_artist:
        if _same_title(title, t["name"]):
            return {"found": True, "title": t["name"], "artist": t["artist"], "tracks": [{"title": t["name"], "artist": t["artist"]}]}

    by_title = _search(title, "", 10)
    for t in by_title:
        if _same_title(title, t["name"]) and (not artist or _same_artist(artist, t["artist"])):
            return {"found": True, "title": t["name"], "artist": t["artist"], "tracks": [{"title": t["name"], "artist": t["artist"]}]}

    result: dict = {"found": False, "title": title, "artist": artist, "tracks": []}
    if with_artist:
        # 제목은 틀렸지만 가수는 맞을 수 있다: 가수의 실제 곡을 알려줘서 다시 고르게 한다
        top = with_artist[0]
        result["note"] = f"그 제목의 곡은 없습니다. {top['artist']}의 다른 곡으로 '{top['name']}'이 있습니다."
    return result


# 소개글을 모델에게 줄 때의 길이 상한. 더 길어도 앞부분(누구이고 언제 어디서 시작했는지)이 핵심이다.
_BIO_MAX = 1200


def _clean_wiki(text: str) -> str:
    """Last.fm 위키 글에서 태그·"Read more" 꼬리·라이선스 문구를 걷어 낸다."""
    text = re.sub(r"<[^>]+>", "", text or "")
    text = re.sub(r"\s*Read more on Last\.fm.*$", "", text, flags=re.S)
    text = re.sub(r"\s*User-contributed text is available.*$", "", text, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def _lastfm_info(method: str, **params) -> dict | None:
    """artist.getinfo / track.getinfo. Last.fm이 모르는 대상이면 None."""
    if not config.LASTFM_API_KEY:
        raise RuntimeError("LASTFM_API_KEY가 설정되지 않았습니다")
    response = requests.get(
        _LASTFM_URL,
        params={"method": method, "autocorrect": 1, "lang": "en", "api_key": config.LASTFM_API_KEY, "format": "json", **params},
        timeout=10,
    )
    data = response.json()
    if data.get("error") == 6 or response.status_code == 404:
        return None
    response.raise_for_status()
    return data


def artist_info(artist: str) -> dict:
    """가수에 대해 Last.fm이 아는 것: 소개글(영어), 태그, 비슷한 가수, 청취자 수.

    소개글은 사용자들이 쓴 글이라 없거나 짧을 수 있다. 그럴 때는 `bio`가 비어 있고, 모델이 있는
    것만으로 답하거나 모른다고 말하게 한다.
    """
    data = _lastfm_info("artist.getinfo", artist=artist)
    if not data or "artist" not in data:
        return {"found": False, "artist": artist}
    a = data["artist"]
    return {
        "found": True,
        "artist": a["name"],
        "listeners": int(a.get("stats", {}).get("listeners") or 0),
        "tags": [t["name"] for t in (a.get("tags") or {}).get("tag", [])][:6],
        "similar_artists": [x["name"] for x in (a.get("similar") or {}).get("artist", [])][:6],
        "bio": _clean_wiki((a.get("bio") or {}).get("content", ""))[:_BIO_MAX],
    }


def artist_top_tracks(artist: str) -> dict:
    """가수의 대표곡(Last.fm 인기순 5곡). `tracks`에 담아 돌려줘서 화면이 카드로 보여 준다."""
    if not config.LASTFM_API_KEY:
        raise RuntimeError("LASTFM_API_KEY가 설정되지 않았습니다")
    response = requests.get(
        _LASTFM_URL,
        params={"method": "artist.gettoptracks", "artist": artist, "autocorrect": 1, "limit": 5, "api_key": config.LASTFM_API_KEY, "format": "json"},
        timeout=10,
    )
    data = response.json()
    found = (data.get("toptracks") or {}).get("track", [])
    if not found:
        return {"found": False, "artist": artist, "tracks": []}
    name = (data["toptracks"].get("@attr") or {}).get("artist", artist)
    return {"found": True, "artist": name, "tracks": [{"title": t["name"], "artist": t["artist"]["name"]} for t in found]}


def track_info(title: str, artist: str = "") -> dict:
    """곡에 대해 Last.fm이 아는 것: 앨범, 길이, 태그, 소개글(있으면).

    가수를 모르면 먼저 find_track과 같은 검색으로 가수를 찾는다.
    """
    if not artist:
        hit = find_track(title)
        if not hit["found"]:
            return {"found": False, "title": title}
        title, artist = hit["title"], hit["artist"]
    data = _lastfm_info("track.getinfo", track=title, artist=artist)
    if not data or "track" not in data:
        return {"found": False, "title": title, "artist": artist}
    t = data["track"]
    seconds = int(t.get("duration") or 0) // 1000
    return {
        "found": True,
        "title": t["name"],
        "artist": (t.get("artist") or {}).get("name", artist),
        "album": (t.get("album") or {}).get("title"),
        "length": f"{seconds // 60}:{seconds % 60:02d}" if seconds else None,
        "listeners": int(t.get("listeners") or 0),
        "tags": [x["name"] for x in (t.get("toptags") or {}).get("tag", [])][:6],
        "about": _clean_wiki((t.get("wiki") or {}).get("content", ""))[:_BIO_MAX],
    }


# 사용자가 출처를 끄고 켤 수 있다. 출처 하나가 도구 여러 개를 거느리고, 꺼진 출처의 도구는 모델에게 보이지 않는다.
SOURCES: dict[str, tuple[str, ...]] = {
    "lastfm": ("top_tracks", "find_track", "artist_info", "artist_top_tracks", "track_info"),
    "wikipedia": ("wiki_summary",),
    "musicbrainz": ("albums",),
}

_WIKI_UA = "Superlike/0.1 (https://github.com/honeydragoneye/SUPERLIKE)"
# 동명이인·동음이의 문서를 거르는 말: 소개 첫머리에 음악 이야기가 있어야 그 가수의 문서다
_MUSICAL = re.compile(
    r"band|singer|musician|rapper|group|composer|songwriter|duo|album|song|"
    r"밴드|가수|음악|그룹|래퍼|작곡|앨범|노래|싱어송라이터",
    re.IGNORECASE,
)
_HANGUL = re.compile(r"[가-힣]")


def wiki_summary(name: str) -> dict:
    """Wikipedia에서 가수·밴드의 소개(앞부분 요약)를 가져온다. 한글 이름이면 한국어판부터 본다.

    검색 결과 중 제목이 이름과 비슷하고 소개에 음악 이야기가 있는 문서만 받아들인다 — 이름이 같은
    다른 문서를 그 가수로 착각하지 않도록.
    """
    langs = ("ko", "en") if _HANGUL.search(name) else ("en", "ko")
    for lang in langs:
        response = requests.get(
            f"https://{lang}.wikipedia.org/w/api.php",
            params={
                "action": "query", "format": "json", "generator": "search", "gsrsearch": name,
                "gsrlimit": 4, "prop": "extracts", "exintro": 1, "explaintext": 1, "exlimit": 4,
            },
            headers={"User-Agent": _WIKI_UA},
            timeout=10,
        )
        if not response.ok:
            continue
        pages = sorted((response.json().get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
        for page in pages:
            extract = (page.get("extract") or "").strip()
            title = re.sub(r"\s*\(.*?\)\s*$", "", page["title"])  # "Lucy (band)" → "Lucy"
            # 제목이 이름과 같아야 한다: "Lucy"로 "Lucy Liu"를 받으면 안 된다
            if _norm(title) == _norm(name) and _MUSICAL.search(extract[:400]):
                return {
                    "found": True,
                    "title": page["title"],
                    "language": lang,
                    "summary": re.sub(r"\s+", " ", extract)[:_BIO_MAX],
                    "url": f"https://{lang}.wikipedia.org/wiki/{page['title'].replace(' ', '_')}",
                }
    return {"found": False, "name": name}


_MB_URL = "https://musicbrainz.org/ws/2"
_MB_UA = "Superlike/0.1 (https://github.com/honeydragoneye/SUPERLIKE)"
# MusicBrainz는 IP당 초당 1회. 호출 사이를 이만큼 띄우고, 거절(503)되면 쉬었다가 다시 부른다.
_MB_GAP = 1.1
_mb_lock = threading.Lock()
_mb_last = 0.0
_mb_cache: dict[str, dict] = {}


def _mb_get(path: str, **params) -> dict | None:
    global _mb_last
    for attempt in range(3):
        with _mb_lock:
            wait = _MB_GAP - (time.monotonic() - _mb_last)
            if wait > 0:
                time.sleep(wait)
            response = requests.get(
                f"{_MB_URL}/{path}", params={**params, "fmt": "json"}, headers={"User-Agent": _MB_UA}, timeout=15
            )
            _mb_last = time.monotonic()
        if response.ok:
            return response.json()
        if response.status_code != 503:
            return None
        time.sleep(2 * (attempt + 1))
    return None


def albums(artist: str) -> dict:
    """MusicBrainz에 있는 가수의 앨범·EP를 발매일 순으로 (최신이 먼저, 최대 8장).

    이름이 같은 가수가 둘 이상이라 하나로 정할 수 없으면 찾지 못한 것으로 돌려준다 — 엉뚱한
    가수의 앨범을 알려주는 것보다 낫다.
    """
    key = artist.strip().lower()
    if key in _mb_cache:
        return _mb_cache[key]
    result: dict = {"found": False, "artist": artist}
    found = _mb_get("artist/", query=f'artist:"{artist}"', limit=5)
    if found:
        hits = [
            a for a in found.get("artists", [])
            if a.get("score", 0) >= 90
            and (a["name"].lower() == key or any(x.get("name", "").lower() == key for x in a.get("aliases", [])))
        ]
        # 가장 높은 점수가 하나일 때만 그 가수로 정한다
        top = [a for a in hits if a["score"] == max((h["score"] for h in hits), default=0)]
        if len(top) == 1:
            groups = _mb_get("release-group", artist=top[0]["id"], type="album|ep", limit=100)
            if groups:
                rows = sorted(
                    (g for g in groups.get("release-groups", []) if not g.get("secondary-types") and g.get("first-release-date")),
                    key=lambda g: g["first-release-date"],
                    reverse=True,
                )[:8]
                result = {
                    "found": bool(rows),
                    "artist": top[0]["name"],
                    "albums": [
                        {"title": g["title"], "released": g["first-release-date"], "type": g.get("primary-type", "")}
                        for g in rows
                    ],
                }
        elif len(top) > 1:
            result["note"] = "이름이 같은 가수가 여럿이라 하나로 정할 수 없습니다."
    # 서버 오류로 못 찾은 것은 기억하지 않는다 (다음에 다시 시도)
    if result["found"] or "note" in result:
        _mb_cache[key] = result
    return result


# 태그 정의의 길이 상한. Superlike(lib/station/moods.ts의 CUSTOM_DEFINITION_MAX)와 같아야 한다.
DEFINITION_MAX = 80
# 미리보기에서 판정해 보는 곡 수와, 화면에 보여 줄 통과·탈락 곡 수
_PREVIEW_SAMPLE = 20
_PREVIEW_SHOWN = 6


def _sample_pool(sample_tag: str) -> list[dict]:
    """미리보기에 쓸 곡들: 태그가 있으면 그 태그의 인기곡, 없으면 전 세계 차트."""
    params: dict = {"limit": 50, "api_key": config.LASTFM_API_KEY, "format": "json"}
    if sample_tag.strip():
        params.update(method="tag.gettoptracks", tag=sample_tag.strip().lower())
    else:
        params.update(method="chart.gettoptracks")
    response = requests.get(_LASTFM_URL, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()
    found = (data.get("tracks") or {}).get("track", [])
    pool = []
    for t in found:
        artist = t["artist"]["name"] if isinstance(t.get("artist"), dict) else str(t.get("artist", ""))
        pool.append({"title": t["name"], "artist": artist})
    return pool


# 판정기는 곡 제목과 가수 이름만 본다. 이런 말이 든 기준은 그것만으로는 정확히 가릴 수 없다.
_NOT_JUDGEABLE = re.compile(
    r"lyric|melody|beat|tempo|bpm|vocal|voice|guitar|piano|instrument|sound|rhythm|chorus|가사|멜로디|박자|목소리|악기|소리",
    re.IGNORECASE,
)


def propose_definition(definition: str, reason: str = "", sample_tag: str = "") -> dict:
    """사용자의 태그에 새 기준(정의)을 제안하고, 그 기준이 곡들에 어떻게 적용되는지 미리 보여 준다.

    예시를 주면서 규칙을 짐작하게 하는 것보다, 사용자에게 기준을 물어 말로 적은 정의가 훨씬 정확하다
    (experiments/personal_tag_exp.py). 그래서 에이전트의 일은 기준을 묻고, 한 문장으로 정리하고,
    그 기준이 어떤 곡을 통과시키는지 보여 주는 것이다. 정의를 실제로 바꾸는 건 화면이고, 사용자가
    "적용"을 눌렀을 때만 일어난다.
    """
    if not config.LASTFM_API_KEY:
        raise RuntimeError("LASTFM_API_KEY가 설정되지 않았습니다")
    d = " ".join(str(definition).split())
    if not d:
        return {"error": "정의가 비어 있습니다. 영어 한 문장으로 기준을 적어 다시 불러 주세요."}
    if len(d) > DEFINITION_MAX:
        return {"error": f"정의가 {len(d)}자입니다. {DEFINITION_MAX}자 이내의 영어 한 문장으로 줄여 다시 불러 주세요."}

    try:
        pool = _sample_pool(sample_tag)
    except requests.RequestException:
        pool = []
    if not pool and sample_tag.strip():
        # 모델이 지어낸 태그("sad, non-korean")면 Last.fm에 곡이 없다. 실패로 돌려주면 모델이 그 오류를
        # 사용자에게 읊고 멈추니, 차트로 바꿔서 미리보기는 반드시 보여 준다.
        pool = _sample_pool("")
    random.shuffle(pool)
    pool = pool[:_PREVIEW_SAMPLE]
    if not pool:
        return {"error": "미리보기에 쓸 곡을 가져오지 못했습니다. sample_tag를 바꾸거나 비워서 다시 불러 주세요."}
    verdicts = judge(d, pool)
    proposal = {"definition": d, "reason": " ".join(str(reason).split())[:200]}
    if _NOT_JUDGEABLE.search(d):
        proposal["warning"] = "가사나 소리 같은 기준은 곡 제목과 가수만 보는 판정에서는 정확히 가려내기 어려워요."
    passed = [t for t, ok in zip(pool, verdicts) if ok]
    failed = [t for t, ok in zip(pool, verdicts) if ok is False]
    return {
        "proposal": proposal,
        "preview": {
            "checked": len(pool),
            # 보여 주는 곡은 일부지만, 몇 곡이 통과했는지는 전체로 알려 준다
            "passed_count": len(passed),
            "passed": passed[:_PREVIEW_SHOWN],
            "failed": failed[:_PREVIEW_SHOWN],
        },
    }


TOOLS: dict[str, dict] = {
    "top_tracks": {
        "schema": {
            "type": "function",
            "function": {
                "name": "top_tracks",
                "description": (
                    "태그(장르·나라·분위기)로 실제 존재하는 곡을 모으고, condition이 있으면 그 "
                    "조건에 맞는 곡만 골라 돌려준다. 곡을 추천할 때 가장 먼저 부르고, "
                    "결과 안에서만 곡을 고른다. 곡이 3곡 미만이면 다른 tag나 page로 다시 부른다. "
                    "tag는 영어 소문자 한 단어 또는 짧은 구. "
                    "예: sad, chill, rainy, upbeat, dance, indie, shoegaze, jazz, "
                    "korean, k-pop, k-indie, korean ballad"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tag": {"type": "string", "description": "영어 태그 하나 (예: k-indie)"},
                        "condition": {
                            "type": "string",
                            "description": (
                                "사용자가 원하는 조건을 영어 한 문장으로. 분위기와 나라를 모두 담는다. "
                                "예: 'a calm, gentle Korean song that suits a rainy day'. "
                                "조건이 태그만으로 충분하면 생략"
                            ),
                        },
                        "page": {"type": "integer", "description": "다음 후보를 보려면 2, 3… (기본 1)"},
                    },
                    "required": ["tag"],
                },
            },
        },
        "run": top_tracks,
    },
    "find_track": {
        "schema": {
            "type": "function",
            "function": {
                "name": "find_track",
                "description": (
                    "사용자가 곡 이름을 말했을 때 그 곡이 실제로 있는지 확인한다 "
                    "(예: 'wave to earth의 hyang'). 가수를 모르면 artist는 비운다. "
                    "분위기로 곡을 추천하는 용도는 아니다 (그건 top_tracks)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "곡 제목 (예: Dagger)"},
                        "artist": {"type": "string", "description": "가수 이름 (예: Slowdive). 모르면 빈 문자열"},
                    },
                    "required": ["title"],
                },
            },
        },
        "run": find_track,
    },
    "artist_info": {
        "schema": {
            "type": "function",
            "function": {
                "name": "artist_info",
                "description": (
                    "가수나 밴드에 대한 질문(어떤 가수인지, 어느 나라인지, 언제 데뷔했는지, 어떤 스타일인지, "
                    "비슷한 가수)에 답하기 위해 Last.fm의 소개글·태그·비슷한 가수를 가져온다. "
                    "가수에 대해 설명하기 전에 반드시 부른다."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"artist": {"type": "string", "description": "가수 이름 (예: Slowdive)"}},
                    "required": ["artist"],
                },
            },
        },
        "run": artist_info,
    },
    "track_info": {
        "schema": {
            "type": "function",
            "function": {
                "name": "track_info",
                "description": (
                    "곡 하나에 대한 질문(어떤 곡인지, 어느 앨범인지, 길이, 분위기 태그)에 답하기 위해 "
                    "Last.fm의 곡 정보를 가져온다. 곡을 설명하기 전에 반드시 부른다. 가수를 모르면 비운다."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "곡 제목"},
                        "artist": {"type": "string", "description": "가수 이름. 모르면 빈 문자열"},
                    },
                    "required": ["title"],
                },
            },
        },
        "run": track_info,
    },
    "artist_top_tracks": {
        "schema": {
            "type": "function",
            "function": {
                "name": "artist_top_tracks",
                "description": (
                    "특정 가수의 대표곡·인기곡을 알려 달라고 할 때 그 가수의 실제 인기곡 5곡을 가져온다 "
                    "(예: '10CM 대표곡'). 분위기로 곡을 추천하는 용도는 아니다 (그건 top_tracks)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"artist": {"type": "string", "description": "가수 이름 (예: 10CM)"}},
                    "required": ["artist"],
                },
            },
        },
        "run": artist_top_tracks,
    },
    "wiki_summary": {
        "schema": {
            "type": "function",
            "function": {
                "name": "wiki_summary",
                "description": (
                    "Wikipedia에서 가수·밴드의 소개를 가져온다. artist_info의 소개글이 비어 있거나 짧을 때, "
                    "또는 활동 이력·멤버·배경을 더 알고 싶을 때 부른다."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"name": {"type": "string", "description": "가수·밴드 이름 (예: 웨이브 투 어스)"}},
                    "required": ["name"],
                },
            },
        },
        "run": wiki_summary,
    },
    "albums": {
        "schema": {
            "type": "function",
            "function": {
                "name": "albums",
                "description": (
                    "가수의 앨범·EP를 발매일 순(최신이 먼저)으로 가져온다. '최근 앨범', '데뷔 앨범', "
                    "'앨범이 몇 장' 같은 질문에 부른다. 곡 목록이 아니라 앨범 목록이다."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"artist": {"type": "string", "description": "가수 이름 (예: Radiohead)"}},
                    "required": ["artist"],
                },
            },
        },
        "run": albums,
    },
    "propose_definition": {
        "schema": {
            "type": "function",
            "function": {
                "name": "propose_definition",
                "description": (
                    "사용자가 말한 기준을 영어 한 문장으로 정리해 태그의 새 정의로 제안하고, 그 기준이 "
                    "실제 곡들에 어떻게 적용되는지 미리 본다. 정의는 곡 제목과 가수만 보고 판정할 수 있는 "
                    "기준(가수, 나라, 언어, 분위기, 장르)이어야 하고 70자 이내다."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "definition": {
                            "type": "string",
                            "description": "영어 한 문장의 기준 (예: 'a sad song that is not Korean')",
                        },
                        "reason": {"type": "string", "description": "사용자의 말을 어떻게 정리했는지 한국어 한 문장"},
                        "sample_tag": {
                            "type": "string",
                            "description": "미리보기 곡을 가져올 영어 태그 (예: korean, k-pop). 모르면 비운다",
                        },
                    },
                    "required": ["definition"],
                },
            },
        },
        "run": propose_definition,
    },
}

# 모드마다 모델에게 보여 주는 도구가 다르다. 작은 모델은 도구가 많을수록 고르기 어려워한다.
TOOLS_CHAT = ("top_tracks", "find_track", "artist_info", "artist_top_tracks", "track_info", "wiki_summary", "albums")
TOOLS_REFINE = ("propose_definition",)


def tools_for(sources: list[str] | None) -> tuple[str, ...]:
    """켜진 출처의 도구만. sources가 None이면 전부 켠 것으로 본다."""
    if sources is None:
        return TOOLS_CHAT
    on = {tool for name in sources for tool in SOURCES.get(name, ())}
    return tuple(t for t in TOOLS_CHAT if t in on)


def call_tool(name: str, arguments: dict, session: Session, allowed: tuple[str, ...] | None = None) -> object:
    """모델이 고른 도구를 실행한다. 없는 도구나 잘못된 인자는 예외 대신 오류 값으로 돌려줘서
    모델이 스스로 고쳐 다시 시도할 수 있게 한다."""
    tool = TOOLS.get(name)
    if tool is None or (allowed is not None and name not in allowed):
        return {"error": f"없는 도구: {name}"}
    try:
        run = tool["run"]
        return run(session, **arguments) if name == "top_tracks" else run(**arguments)
    except TypeError as e:
        return {"error": f"인자가 맞지 않습니다: {e}"}
    except Exception as e:  # 네트워크 실패 등 — 모델이 사용자에게 설명할 수 있도록 문구로 전달
        return {"error": str(e)}
