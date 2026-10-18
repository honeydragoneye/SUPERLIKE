"""에이전트가 부를 수 있는 도구.

도구는 (스키마, 실행 함수) 한 쌍이다. 스키마는 모델에게 "이런 도구가 있다"고 알리는
용도이고, 실행 함수는 모델이 고른 인자로 실제 일을 한다. 결과는 항상 JSON으로
직렬화되는 값이라야 모델이 읽을 수 있다.
"""

from __future__ import annotations

import random
import re
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


def find_track(title: str, artist: str) -> dict:
    """Last.fm에서 이 제목·가수의 곡이 실제로 있는지 확인한다.

    분위기 설명 하나만 받는 검색 도구로 두면 작은 모델이 "비 오는 날 노래" 같은
    문장을 그대로 검색어로 넘겨서, 제목에 그 단어가 든 엉뚱한 곡만 나온다. 제목과
    가수를 따로 받으면 구체적인 곡을 먼저 떠올리지 않고서는 부를 수 없다.
    """
    if not config.LASTFM_API_KEY:
        raise RuntimeError("LASTFM_API_KEY가 설정되지 않았습니다")
    response = requests.get(
        _LASTFM_URL,
        params={
            "method": "track.search",
            "track": title,
            "artist": artist,
            "limit": 1,
            "api_key": config.LASTFM_API_KEY,
            "format": "json",
        },
        timeout=10,
    )
    response.raise_for_status()
    found = response.json().get("results", {}).get("trackmatches", {}).get("track", [])
    if not found:
        return {"found": False, "title": title, "artist": artist}
    top = found[0]
    if not _same_title(title, top["name"]):
        # 모델이 지어낸 제목일 가능성이 높다. 가수의 실제 곡을 알려줘서 다시 고르게 한다.
        return {
            "found": False,
            "title": title,
            "artist": artist,
            "note": f"그 제목의 곡은 없습니다. {top['artist']}의 다른 곡으로 '{top['name']}'이 있습니다.",
        }
    return {"found": True, "title": top["name"], "artist": top["artist"]}


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
                    "사용자가 말한 곡이나 가수가 실제로 있는지 제목과 가수로 확인한다. "
                    "추천할 곡을 찾는 용도는 아니다 (그건 top_tracks)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "곡 제목 (예: Dagger)"},
                        "artist": {"type": "string", "description": "가수 이름 (예: Slowdive)"},
                    },
                    "required": ["title", "artist"],
                },
            },
        },
        "run": find_track,
    }
}


def call_tool(name: str, arguments: dict, session: Session) -> object:
    """모델이 고른 도구를 실행한다. 없는 도구나 잘못된 인자는 예외 대신 오류 값으로 돌려줘서
    모델이 스스로 고쳐 다시 시도할 수 있게 한다."""
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": f"없는 도구: {name}"}
    try:
        run = tool["run"]
        return run(session, **arguments) if name == "top_tracks" else run(**arguments)
    except TypeError as e:
        return {"error": f"인자가 맞지 않습니다: {e}"}
    except Exception as e:  # 네트워크 실패 등 — 모델이 사용자에게 설명할 수 있도록 문구로 전달
        return {"error": str(e)}
