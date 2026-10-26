"""도구를 부르는 에이전트 루프.

모델에게 질문과 도구 목록을 주면, 모델은 답하거나 도구를 부르겠다고 한다. 도구를
부르면 실행해서 결과를 대화에 붙이고 다시 모델에게 넘긴다. 도구 호출 없이 답이
나오면 끝이다. 같은 일을 끝없이 반복하지 않도록 MAX_STEPS에서 멈춘다.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator

import requests

from agent import config, gemini
from agent.tools import DEFAULT_SOURCES, SOURCES, TOOLS, TOOLS_CHAT, TOOLS_REFINE, Session, call_tool, tools_for

MAX_STEPS = 4

_HEAD = (
    "너는 음악 이야기를 나누는 친절한 AI 어시스턴트다. 자연스러운 대화체로 답한다.\n\n"
    "곡을 추천할 때는 먼저 top_tracks로 실제 곡을 가져온다. tag에는 장르나 나라를 영어로 쓰고 "
    "(한국 노래면 k-indie, korean ballad 등), 사용자가 분위기나 상황까지 말했다면 condition에 "
    "그 전부를 영어 한 문장으로 적는다. 돌려받은 곡이 3곡 미만이면 tag를 바꿔 다시 부른다.\n"
)
# 곡 이름을 말한 경우: 찾아서 알려 줄 뿐, 곡의 내용을 아는 척하지 않는다
_NAMED = (
    "사용자가 곡 이름을 말하면(예: 'wave to earth의 hyang 틀어줘', '…검색해줘') 먼저 find_track으로 "
    "그 곡이 있는지 확인한다. 제목은 사용자가 쓴 그대로 넣고 줄이거나 고치지 않는다. 찾았으면 찾았다고만 알리고, 못 찾았으면 못 찾았다고 말한다. "
    "곡을 듣지 못했으니 분위기나 내용을 꾸며 쓰지 않는다.\n"
)
_NAMED_CARDS = (
    "찾은 곡은 화면에 카드로 나오니, 카드의 재생 버튼을 누르면 들을 수 있다고 안내한다.\n"
)
# 가수·곡에 대한 질문: 글이 곧 답이다. 모델의 기억 대신 Last.fm이 돌려준 내용으로만 답하게 한다
_INFO = (
    "가수나 곡에 대해 묻는 말(어떤 가수·곡인지, 어느 나라인지, 언제 데뷔했는지, 어느 앨범인지, 비슷한 "
    "가수)에는 artist_info나 track_info를 먼저 불러서, 돌려받은 내용으로만 답한다. 가수의 대표곡을 "
    "묻거나 곡 제목 없이 가수만 말하면('유재하 노래 있어?', '아이유 노래 들려줘') find_track이 아니라 "
    "artist_top_tracks를 부른다. 사용자가 말하지 않은 곡 제목을 짐작해서 find_track에 넣지 않는다. '~ 같은 가수/노래', '비슷한 곡'을 물으면 similar_to를 부른다. "
    "돌려받은 내용에 없는 것(활동 시기, 멤버, 사생활, 앨범, 곡의 분위기, 가사)은 기억으로 지어내거나 "
    "아는 척하지 않는다. 지금 보이는 도구로 답할 수 없으면 request_source를 불러 사용자가 다른 출처"
    "(Wikipedia, MusicBrainz)를 고르게 하고, 찾지 못했다고 한 문장으로만 말한다. 답이 없다고 같은 "
    "도구를 같은 이름으로 다시 부르지 않는다. 소개글은 영어라서 한국어로 옮겨 짧게 답한다. "
    "묻지 않은 소개를 되풀이하지 않는다.\n"
)
# 지금 듣는 곡을 가리키는 질문: 곡 이름을 모르니 먼저 now_playing으로 확인하고, 그 곡의 정보를 이어서 찾는다
_NOW = (
    "'이 곡', '지금 나오는 노래', '지금 듣는 곡', '이거 누구 노래야', '이 가수'처럼 지금 재생 중인 곡을 가리키는 "
    "말에는 먼저 now_playing을 불러 어떤 곡인지 확인한 뒤, 그 곡으로 track_info나 artist_info, similar_to를 "
    "이어서 부른다. 재생 중인 곡이 없다고 나오면 그렇게 말한다. 곡 이름을 직접 말했거나 분위기로 추천을 "
    "묻는 말에는 now_playing을 부르지 않는다.\n"
)
# 화면이 지금 듣는 곡을 보내지 않았다: 도구가 없으니, 아는 척하지도 다른 출처를 권하지도 않는다
_NO_NOW = (
    "\n\n지금 사용자가 듣는 곡은 알 수 없다('이 곡', '지금 듣는 곡'을 묻는 말). 그런 질문에는 지금 듣는 곡을 알 수 "
    "없다고 한 문장으로 말한다. request_source는 부르지 않는다."
)
# 사용자의 화면이 대신 해 주는 동작(좋아요·재생·스테이션·플레이리스트): 도구는 제안만 하고 실행은 화면이 한다
_ACTIONS = (
    "사용자가 동작을 시키면 맞는 도구를 한 번 부른다: 좋아요(like_track), 재생·멈춤·다음 곡(playback), "
    "스테이션 시작(start_station), 플레이리스트 만들기(make_playlist). 도구는 제안만 하고 실행은 화면이 하며, "
    "결과(좋아요에 담았는지, 만들었는지)는 화면에 카드로 따로 보인다. 그래서 글은 한두 문장으로 짧게 "
    "\"~할게요\"처럼 알리고, 이미 됐다고 단정하지 않으며 곡 목록을 되풀이하지 않는다. 플레이리스트는 사용자가 "
    "만들기를 눌러야 만들어지니 \"만들어 볼까요?\"처럼 말한다. 곡 이름을 말하며 틀어 달라거나 좋아요를 "
    "누르라고 하면 이름은 사용자가 쓴 그대로 넣는다. 곡 삭제, 플레이리스트에서 곡 빼기·지우기, 가사 보기처럼 "
    "이 도구들로 못 하는 일은 할 수 없다고 한 문장으로 말한다.\n"
)
# 사용자가 Spotify에 연결하지 않았다: 동작 도구가 없다
_NO_ACT = (
    "\n\n지금은 좋아요, 재생, 스테이션, 플레이리스트 같은 동작을 할 수 없다(사용자가 Spotify에 연결하지 않았다). "
    "그런 부탁에는 Spotify를 연결하면 할 수 있다고 한 문장으로 말한다. request_source는 부르지 않는다."
)
# 스테이션의 곡에 대한 질문: 곡 목록은 화면에서 오니 먼저 station_info로 확인하고, 곡 하나의 내용은 정보 도구로 찾는다
_STATION = (
    "'스테이션', '스테이션에 있는 곡', '다음에 나오는 곡'처럼 사용자의 스테이션을 가리키는 질문에는 먼저 station_info를 "
    "불러 어떤 곡이 있는지 확인한다. 그 곡 중 하나의 가수·앨범·분위기를 물으면 돌려받은 제목과 가수로 track_info, "
    "artist_info, similar_to를 이어서 불러 그 내용으로만 답한다. 스테이션이 없다고 나오면 그렇게 말한다. "
    "목록에 없는 곡을 있다고 하지 않는다.\n"
)
# 화면에서는 가수·앨범 페이지로 가는 링크가 카드로 따로 붙는다: 글이 주소를 쓰거나 링크를 약속하지 않게 한다
_LINK_CARDS = (
    "두 가수를 견주어 달라는 말에는 가수마다 artist_info를 불러서 둘 다 확인한다. 가수나 곡에 대해 답하면 "
    "그 가수의 페이지, 곡이 든 앨범의 페이지로 가는 링크가 화면에 카드로 따로 붙으니, 글에 주소나 링크를 "
    "쓰지 않는다. 링크 카드는 도구가 찾은 이름에만 붙는다.\n"
)
# 터미널에서는 글이 곡을 보여 주는 유일한 곳이라 목록을 쓰게 한다
_RULE_LIST = (
    "추천은 돌려받은 곡 중 최대 5곡을 '곡명 - 가수' 목록으로만 보여주고, 곡마다 설명을 "
    "붙이지 않는다 (곡을 듣지 못했으니 내용을 알 수 없다). 마지막에 왜 이 곡들을 골랐는지 "
    "한두 문장으로 말한다. "
)
# 화면에서는 도구가 돌려준 곡이 카드로 따로 나오므로, 글이 같은 목록을 되풀이하지 않게 한다
_RULE_CARDS = (
    "도구가 돌려준 곡은 화면에 카드로 따로 표시된다. 그래서 답변 글에 곡 목록을 나열하지 않고, "
    "어떤 기준으로 골랐는지를 한두 문장으로만 말한다. 곡을 듣지 못했으니 곡의 내용을 꾸며 "
    "쓰지 않는다. 굵게(**)나 제목(#) 같은 마크다운 기호는 쓰지 않는다. "
)
_TAIL = (
    "돌려받은 곡이 1~2곡뿐이어도 그 곡을 추천하고, 부족하다고 미리 포기하지 않는다. "
    "돌려받지 않은 곡은 말하지 않는다.\n\n"
    "너는 청취자의 재생 횟수 통계를 볼 수 없다. 그런 걸 물으면 \"재생 횟수는 알 수 없어요\"라고 "
    "말한다 (좋아요한 곡이나 최근 많이 들은 곡의 목록은 '내 취향' 버튼을 켰을 때만 보인다).\n\n"
    "날씨, 시간, 뉴스처럼 네가 알 수 없는 것은 모른다고 짧게 말하고, 음악 이야기로 돌아오도록 "
    "이끈다."
)
SYSTEM_PROMPT = _HEAD + _NAMED + _INFO + _RULE_LIST + _TAIL
SYSTEM_PROMPT_CARDS = _HEAD + _NAMED + _NAMED_CARDS + _INFO + _LINK_CARDS + _RULE_CARDS + _TAIL


# 곡을 틀거나 찾아 달라는 말, 추천해 달라는 말: 이런 요청은 도구로 확인해야 답할 수 있다
_NEEDS_TOOL = re.compile(
    r"(틀어|들려|재생|검색|찾아|추천|play|어떤 (밴드|가수|곡|노래)|누구|어느 나라|언제 (결성|데뷔|나왔)|앨범|대표곡|비슷한|같은 (노래|곡|가수|밴드)|설명|소개|에 대해|비교|이 (곡|노래|가수)|이거|지금 (듣|나오|재생)|방금|좋아요|스테이션|플레이리스트|다음 곡|이전 곡|멈춰|일시정지)",
    re.IGNORECASE,
)


# 짧고 분명한 동작 명령은 모델에게 맡기지 않고 코드가 알아본다. 작은 모델은 "다음 곡 넘겨줘"에 도구를 부르지 않고
# "넘길게요"라고 말만 하거나 엉뚱한 동작을 말하는 일이 있다. 곡 이름을 말하는 명령은 이름을 읽어야 해서 모델에게 둔다.
_NOT_COMMAND = re.compile(r"(추천|뭐|누구|어떤|알려|설명|왜|어때|좋아요\s*한|좋아한|\?)")
_DIRECT: list[tuple[re.Pattern[str], str, dict]] = [
    (re.compile(r"(일시\s*정지|멈춰|정지|잠깐\s*스톱|\bstop\b|\bpause\b)", re.IGNORECASE), "playback", {"command": "pause"}),
    (re.compile(r"(다음\s*(곡|노래)|넘겨|스킵|\bskip\b|\bnext\b)", re.IGNORECASE), "playback", {"command": "next"}),
    (re.compile(r"(이전\s*(곡|노래)|앞\s*(곡|노래)|\bprevious\b)", re.IGNORECASE), "playback", {"command": "previous"}),
    (re.compile(r"^(다시|계속)\s*(재생|틀어)"), "playback", {"command": "resume"}),
    (re.compile(r"^(지금\s*)?(듣는\s*|나오는\s*)?(곡|노래)?\s*(스테이션|라디오)\s*(만들|시작|틀)"), "start_station", {}),
    (re.compile(r"(지금|이)\s*(듣는|나오는|재생\s*중인)?\s*(곡|노래|음악).*스테이션"), "start_station", {}),
    (re.compile(r"(지금|이)\s*(듣는|나오는|재생\s*중인)?\s*(곡|노래|음악)?.*좋아요"), "like_track", {}),
    (re.compile(r"^좋아요\s*(눌러|해|담아|누르)"), "like_track", {}),
]


def _direct_action(question: str) -> tuple[str, dict] | None:
    """명령 한 마디면 (도구 이름, 인자). 길거나 묻는 말, 곡 이름이 낀 말은 None."""
    q = " ".join(question.split())
    if len(q) > 28 or _NOT_COMMAND.search(q):
        return None
    for pattern, name, args in _DIRECT:
        if pattern.search(q):
            return name, dict(args)
    return None


# 취향을 묻는 말. 취향 정보가 없을 때는 도구를 부르게 되돌리지 않고, 켜는 법을 안내한 답을 그대로 둔다
_ASKS_TASTE = re.compile(r"내 취향|내가 좋아(할|하는)")


def refine_prompt(label: str, definition: str) -> str:
    """태그의 기준을 정하는 대화용 프롬프트. 곡을 추천하는 대화와는 하는 일이 다르다."""
    return (
        "너는 사용자가 만든 음악 태그의 기준을 정하는 걸 돕는다.\n"
        f"태그 이름: \"{label}\". 지금 기준(정의): \"{definition}\".\n\n"
        "1. 사용자가 이 태그에 어떤 곡을 넣고 싶은지 말하면, 그 기준을 영어 한 문장(70자 이내)으로 "
        "정리해 propose_definition 도구로 제안한다.\n"
        "2. 기준은 곡 제목과 가수 이름만 보고 판정할 수 있어야 한다 (가수, 나라, 언어, 분위기, 장르). "
        "가사나 소리처럼 판정할 수 없는 기준이면 그렇다고 말하고, 판정할 수 있는 말로 바꿔 보자고 한다.\n"
        "3. 기준이 너무 모호하면(예: '그냥 좋은 노래') 도구를 부르기 전에 한 가지만 구체적으로 되묻는다.\n"
        "4. 도구가 돌려준 미리보기는 화면에 따로 보여 준다. 글에서는 어떻게 정리했는지 한두 문장만 "
        "말하고, 곡 목록을 나열하지 않는다. 마크다운 기호는 쓰지 않는다.\n"
        "5. 사용자가 고치고 싶다고 하면 기준을 고쳐 propose_definition을 다시 부른다. 정의를 실제로 "
        "바꾸는 건 사용자가 화면에서 적용을 눌렀을 때뿐이다."
    )


# 취향 정보 없이 "내 취향"을 묻는 경우: 아무 곡이나 고르지 않고, 켜는 법을 알려 준다
_NO_TASTE = (
    "\n\n사용자의 취향 정보는 없다. 사용자가 '내 취향', '내가 좋아할 만한' 곡을 물으면 곡을 고르지 말고, "
    "챗봇 위쪽의 '내 취향' 버튼을 켜면 좋아요한 곡이나 최근 재생 기록을 보고 골라 줄 수 있다고 안내한다. "
    "또는 어떤 가수나 곡을 좋아하는지 물어본다."
)


def _taste_prompt(taste: list[dict]) -> str:
    """사용자의 좋아요를 모델에게 보여 주는 대목. 가수별로 세어 자주 나오는 가수를 앞에 둔다."""
    counts: dict[str, int] = {}
    for t in taste:
        counts[t["artist"]] = counts.get(t["artist"], 0) + 1
    favorites = ", ".join(a for a, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:8])
    recent = "; ".join(f"{t['title']} - {t['artist']}" for t in taste[:15])
    return (
        "\n\n사용자가 좋아요한 곡이나 최근 많이 들은 곡을 알려 주었다 (사용자가 공유를 켰을 때만 보인다).\n"
        f"자주 나오는 가수: {favorites}\n곡: {recent}\n"
        "사용자가 '내 취향', '내가 좋아할 만한', '내가 좋아하는 것 같은' 곡을 물으면 위 가수 중 하나나 둘을 "
        "골라 similar_to로 비슷한 곡을 가져온다 (여러 가수를 한꺼번에 묻지 말고 가장 어울리는 하나로 시작). "
        "이미 들었거나 좋아요한 곡은 도구가 빼 준다. 어떤 취향을 보고 골랐는지 한 문장으로 말한다. "
        "취향을 묻지 않은 질문에는 이 목록을 꺼내지 않는다."
    )


def _mentions_any(text: str, titles: list[str]) -> bool:
    flat = text.lower()
    return any(t.lower() in flat for t in titles if len(t) >= 2)


def _chat_stream(
    messages: list[dict], model: str | None, tools: tuple[str, ...] = TOOLS_CHAT, force: list[str] | None = None
) -> Iterator[dict]:
    """모델 한 번 호출. 조각은 Ollama /api/chat 모양이고, Gemini도 같은 모양으로 맞춰 내보낸다."""
    if config.uses_gemini(model):
        yield from gemini.chat_stream(messages, [TOOLS[n]["schema"] for n in tools], force)
        return
    payload = {
        "model": model,
        "messages": messages,
        "tools": [TOOLS[n]["schema"] for n in tools],
        "stream": True,
        # 생각 단계를 끄면 도구 선택이 훨씬 빠르다
        "think": False,
        "options": {"temperature": config.GENERATION_TEMPERATURE},
    }
    with requests.post(
        f"{config.LOCAL_GENERATION_BASE_URL}/api/chat", json=payload, stream=True, timeout=180
    ) as response:
        response.raise_for_status()
        for raw in response.iter_lines():
            if raw:
                yield json.loads(raw.decode("utf-8"))


def run_agent(
    history: list[dict],
    question: str,
    model: str | None = None,
    cards: bool = False,
    refine: dict | None = None,
    sources: list[str] | None = None,
    taste: list[dict] | None = None,
    now_playing: dict | None = None,
    station: dict | None = None,
    can_act: bool = False,
) -> Iterator[dict]:
    """이벤트를 하나씩 내보낸다.

    {"type": "tool_call", "name", "arguments"} — 모델이 도구를 부르기로 했다
    {"type": "tool_result", "name", "result"}  — 도구가 돌려준 값
    {"type": "retry", "reason"}                  — 곡을 못 골라서 다시 시킨다 (앞서 나간 글자는 버려도 된다)
    {"type": "token", "data"}                   — 답변 글자 조각
    {"type": "done", "steps"}                   — 끝. steps는 모델을 부른 횟수

    refine={"label", "definition"}이면 곡 추천이 아니라 그 태그의 기준을 정하는 대화다: 도구는
    propose_definition 하나이고, 곡 이름·추천에 대한 되돌림 검사는 하지 않는다.

    sources는 이번 질문에 쓸 수 있는 출처다(없으면 Last.fm만). 그걸로 답을 못 찾은 모델이 request_source를
    부르면, 안 쓴 출처 중 알맞은 것을 {"type": "offer", "tried", "options"}로 알려 사용자가 고르게 한다.

    taste는 사용자가 좋아요한 곡들([{"title", "artist"}], 최근순)이다. 사용자가 공유를 켰을 때만 오고,
    "내 취향에 맞는 곡"을 물으면 이걸 근거로 고르게 하며 이미 좋아요한 곡은 추천에서 뺀다.

    now_playing은 화면이 보내 준 지금 듣는 곡({"playing", "title", "artist", "album"})이다. 사용자가 그 기능을 켰을
    때만 오고, 모델에게는 처음부터 보여 주지 않는다: "이 곡"을 가리키는 질문에서 모델이 now_playing 도구를
    부를 때에야 알려 준다(상관없는 질문이 지금 곡에 끌려가지 않고, 곡 정보가 필요할 때만 모델로 간다).

    station은 화면이 보내 준 스테이션({"active", "seed", "tracks"})이다. 모델에게는 처음부터 보여 주지 않고, 스테이션을
    가리키는 질문에서 station_info 도구를 부를 때 알려 준다. can_act는 사용자가 Spotify에 연결해 화면이 좋아요·재생·
    스테이션·플레이리스트 같은 동작을 대신 할 수 있다는 뜻이다: 그때만 동작 도구가 모델에게 보인다. 동작 도구의
    {"type": "tool_result"}에는 result["action"]이 있고, 실제 실행은 화면이 한다.

    cards=True는 곡을 화면이 카드로 보여 주는 경우다. 글이 곡 이름을 말하지 않으니 "곡을
    말했는가"로 하는 재시도 검사는 끄고, 글은 기준 설명만 쓰게 한다.
    """
    # model이 None이면 설정된 기본 모델(Gemini 또는 로컬). 이름을 주면 그 이름의 Ollama 모델이다.
    if model is None and config.PROVIDER == "ollama":
        model = config.LOCAL_GENERATION_MODEL
    # sources: 사용자가 켜 둔 출처(lastfm·wikipedia·musicbrainz). None이면 전부. 다듬기 대화는 출처와 무관하다.
    tools = TOOLS_REFINE if refine else tools_for(sources, now_playing is not None, can_act, station is not None)
    system = (
        refine_prompt(refine["label"], refine["definition"])
        if refine
        else (SYSTEM_PROMPT_CARDS if cards else SYSTEM_PROMPT)
    )
    if not tools:
        # 사용자가 출처를 모두 껐다: 곡을 찾거나 확인할 수 없으니, 그렇다고 말하고 지어내지 않게 한다
        system += (
            "\n\n지금은 조회 도구를 쓸 수 없다(사용자가 출처를 모두 껐다). 곡을 찾거나 추천하거나 "
            "실제로 있는 곡인지 확인할 수 없다고 짧게 말하고, 챗봇 위쪽의 출처 버튼을 켜면 할 수 있다고 안내한다. "
            "곡 이름을 지어내 추천하지 않는다."
        )
    used = DEFAULT_SOURCES if sources is None else sources
    # request_source가 불린 경우, 사용자에게 고르게 할 출처
    offer: list[str] | None = None

    def tail(step: int) -> list[dict]:
        events = [{"type": "offer", "tried": used, "options": offer}] if offer else []
        return events + [{"type": "done", "steps": step}]

    if tools and not refine and "request_source" not in tools:
        system += "\n\n더 찾아볼 출처가 남아 있지 않다. 답할 수 없으면 찾지 못했다고만 말하고 지어내지 않는다."
    picked = [name for name in used if name not in DEFAULT_SOURCES]
    if picked and not refine:
        system += (
            f"\n\n사용자가 {', '.join(picked)} 출처를 골라 같은 질문을 다시 찾아 달라고 했다. "
            "그 출처의 도구(wikipedia는 wiki_summary, musicbrainz는 albums)를 먼저 불러서 답한다. 이름은 사용자가 쓴 표기 그대로 넣는다."
        )
    # 사용자가 출처를 골라 다시 찾는 경우: 기억으로 답하지 못하게, 첫 호출에서 그 출처의 도구를 반드시 부르게 한다
    force_first = [t for name in picked for t in SOURCES[name] if t in tools] if not refine else []
    session = Session(now_playing, station)
    if not refine:
        system += ("\n\n" + _NOW) if now_playing is not None else _NO_NOW
        system += ("\n" + _ACTIONS) if can_act else _NO_ACT
        if station is not None:
            system += "\n" + _STATION
    if taste and not refine:
        system += _taste_prompt(taste)
        session.seen |= {f"{t['title']}|{t['artist']}".lower() for t in taste}
    elif not refine:
        system += _NO_TASTE
    messages = [
        {"role": "system", "content": system},
        *history,
        {"role": "user", "content": question},
    ]

    # 도구가 돌려준 곡 제목들. 답변이 이 중 하나도 말하지 않으면 추천을 못 한 것이다.
    seen_titles: list[str] = []
    nudged = False
    # 분명한 동작 명령: 모델이 고르기 전에 도구를 먼저 부르고, 모델은 그 결과를 보고 짧게 알린다
    direct = _direct_action(question) if can_act and not refine else None
    if direct and direct[0] in tools:
        name, args = direct
        # 모델이 고른 호출이 아니라서 생각 서명이 없다: Gemini는 서명 검증을 건너뛰라는 이 값을 받아 준다
        call = {
            "function": {"name": name, "arguments": args},
            "_part": {"functionCall": {"name": name, "args": args}, "thoughtSignature": "skip_thought_signature_validator"},
        }
        yield {"type": "tool_call", "name": name, "arguments": args}
        result = call_tool(name, args, session, tools)
        yield {"type": "tool_result", "name": name, "result": result}
        messages.append({"role": "assistant", "content": "", "tool_calls": [call]})
        messages.append({"role": "tool", "tool_name": name, "content": json.dumps(result, ensure_ascii=False)})
        nudged = True
    # 도구를 쓰라고 되돌린 직후의 호출: 도구를 부르면 그 답으로 바꾸고, 안 부르면 처음 답을 그대로 둔다
    after_nudge = False
    # 마지막 top_tracks가 돌려준 곡 수. 0곡이면 답하기 전에 다른 태그로 한 번 더 찾아 본다.
    last_found: int | None = None
    retried_empty = False

    for step in range(1, MAX_STEPS + 1):
        content = ""
        calls: list[dict] = []
        for chunk in _chat_stream(messages, model, tools, force_first if step == 1 else None):
            if "rate_wait" in chunk:
                # 모델이 한도에 걸려 기다리는 중: 멈춘 게 아니라는 걸 화면에 알린다
                yield {"type": "waiting", "seconds": chunk["rate_wait"]}
                continue
            message = chunk.get("message", {})
            if message.get("content"):
                content += message["content"]
                # 되돌린 직후의 글은 모아 두기만 한다: 모델이 지시문에 "알겠습니다"라고 답하는 일이 있어서,
                # 도구를 부른 경우가 아니면 보여 주지 않는다
                if not after_nudge:
                    yield {"type": "token", "data": message["content"]}
            calls.extend(message.get("tool_calls") or [])

        if after_nudge:
            after_nudge = False
            if not calls:
                # 도구를 안 쓰기로 했다: 처음 답이 화면에 그대로 남는다
                yield from tail(step)
                return
            # 도구를 쓴다: 처음 답은 버리고 도구 결과로 다시 답한다
            yield {"type": "retry", "reason": "도구로 확인하지 않아 다시 시도"}
            content = ""

        if not calls:
            # 곡 이름을 말했는데 도구를 부르지 않고 "그런 곡은 없다"거나 아는 척 답하는 경우: 작은 모델이
            # 확인 없이 단정하는 버릇이라, 도구를 먼저 쓰도록 한 번 되돌린다.
            if (
                tools
                and not refine
                and step == 1
                and not nudged
                and _NEEDS_TOOL.search(question)
                and not (not taste and _ASKS_TASTE.search(question))
            ):
                nudged = True
                after_nudge = True
                messages.append({"role": "assistant", "content": content})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "도구를 먼저 불러서 확인한 뒤에 답해줘. 곡 이름을 말한 거면 find_track, "
                            "분위기나 장르를 말한 거면 top_tracks, '~같은 곡'이면 similar_to, 좋아요·재생·스테이션·플레이리스트를 "
                            "시킨 거면 like_track, playback, start_station, make_playlist, 가수나 곡에 대한 질문이면 "
                            "artist_info, track_info, albums, wiki_summary 같은 정보 도구를 불러. "
                            "필요한 도구가 안 보이거나 도구로 찾고도 답이 없을 때만 request_source로 "
                            "사용자가 다른 출처를 고르게 해."
                        ),
                    }
                )
                continue
            # 조건에 맞는 곡을 하나도 못 찾고 끝내려는 경우: 후보가 매번 조금씩 달라서 한 번은 빈손일 수
            # 있다. 모델은 빈손인데도 "골라봤어요"라고 말하는 버릇이 있어, 태그를 바꿔 한 번 더 찾게 한다.
            if last_found == 0 and not retried_empty and step < MAX_STEPS:
                retried_empty = True
                yield {"type": "retry", "reason": "곡을 못 찾아 다른 태그로 다시 시도"}
                messages.append({"role": "assistant", "content": content})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "조건에 맞는 곡을 하나도 못 찾았어. 추천했다고 말하지 말고, 다른 tag(예: "
                            "indie, ballad, korean ballad, k-indie)로 top_tracks를 한 번 더 불러."
                        ),
                    }
                )
                continue
            # 곡 목록을 받아 놓고 곡 하나 고르지 않은 채 끝내려는 경우: "다시 찾아볼게요"만
            # 말하고 멈추는 작은 모델의 버릇이라, 한 번 더 시킨다.
            if not cards and seen_titles and step < MAX_STEPS and not _mentions_any(content, seen_titles):
                yield {"type": "retry", "reason": "추천한 곡이 없어 다시 시도"}
                messages.append({"role": "assistant", "content": content})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "아직 곡을 추천하지 않았어. 방금 받은 목록에서 어울리는 곡을 골라 "
                            "추천하거나, 목록이 조건에 안 맞으면 말하지 말고 다른 태그로 "
                            "top_tracks를 다시 불러."
                        ),
                    }
                )
                continue
            yield from tail(step)
            return

        # 모델의 도구 호출 요청을 대화에 남겨야 다음 턴에서 "내가 이걸 불렀다"를 안다
        messages.append({"role": "assistant", "content": content, "tool_calls": calls})
        for call in calls:
            fn = call["function"]
            args = fn.get("arguments") or {}
            yield {"type": "tool_call", "name": fn["name"], "arguments": args}
            if fn["name"] == "request_source" and "request_source" in tools:
                remaining = [name for name in SOURCES if name not in used]
                suggested = [x for x in (args.get("suggest") or []) if x in remaining]
                offer = suggested or remaining
                result = {"ok": True, "note": "사용자에게 출처를 고르는 버튼이 보인다. 찾지 못했다고 한 문장으로만 말한다."}
            else:
                result = call_tool(fn["name"], args, session, tools)
            yield {"type": "tool_result", "name": fn["name"], "result": result}
            if isinstance(result, dict) and isinstance(result.get("tracks"), list):
                seen_titles += [t["title"] for t in result["tracks"] if "title" in t]
                if fn["name"] == "top_tracks":
                    last_found = len(result["tracks"])
            messages.append(
                {"role": "tool", "tool_name": fn["name"], "content": json.dumps(result, ensure_ascii=False)}
            )

    # 단계를 다 썼는데도 도구만 부르고 있다 — 지금까지 모은 걸로 마무리하라고 요청한다
    messages.append({"role": "user", "content": "지금까지 확인한 곡으로 바로 답해줘."})
    for chunk in _chat_stream(messages, model, tools):
        text = chunk.get("message", {}).get("content")
        if text:
            yield {"type": "token", "data": text}
    yield from tail(MAX_STEPS + 1)
