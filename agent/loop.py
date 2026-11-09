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
from agent.tools import ACTION_TOOLS, DEFAULT_SOURCES, SOURCES, TOOLS, TOOLS_CHAT, TOOLS_REFINE, Session, call_tool, tools_for

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
    "셔플·반복(player_mode), 재생 위치 옮기기(seek), 음량(volume), 곡 하나만 들려 달라는 말(play_one), "
    "곡 하나, 또는 방금 보여 준 곡들(source=\"shown\")을 기존 플레이리스트에 담기(add_to_playlist), 다음에 나올 곡 목록(up_next), 가사 화면 열기(lyrics), 스테이션 끝내기(stop_station), 스테이션 시작(start_station), 새 플레이리스트 만들기(make_playlist), 다른 페이지로 옮기기(open_page: 홈·최근 재생 기록·마이페이지·지난 호·금주의 아티스트·에디터스 픽·스테이션·검색 결과·가수·앨범 페이지), 가수 팔로우(follow_artist: ‘팔로우해줘’는 가수 이름만 있으면 곧바로 이 도구를 부른다. 도구를 부르지 않고 ‘팔로우할게요’라고만 답하지 않는다). 도구는 제안만 하고 실행은 화면이 하며, "
    "결과(좋아요에 담았는지, 만들었는지)는 화면에 카드로 따로 보인다. 그래서 글은 한두 문장으로 짧게 "
    "\"~할게요\"처럼 알리고, 이미 됐다고 단정하지 않으며 곡 목록을 되풀이하지 않는다. 플레이리스트는 사용자가 "
    "만들기를 눌러야 만들어지니 \"만들어 볼까요?\"처럼 말한다. 곡 이름을 말하며 틀어 달라거나 좋아요를 "
    "누르라고 하면 이름은 사용자가 쓴 그대로 넣는다. 곡 삭제, 플레이리스트에서 곡 빼기·지우기처럼 "
    "이 도구들로 못 하는 일은 할 수 없다고 한 문장으로 말한다. 동작을 했다거나 하겠다고 말하는 것은 그 도구를 부른 뒤에만 한다: "
    "도구를 부르지 않았으면 '했어요', '이동할게요', '재생할게요'라고 말하지 않는다. 대화 기록에 '(해 준 동작: …)'이 없는 동작은 하지 않은 것이라, "
    "'했어?'라고 물으면 기록을 보고 사실대로 말하고 안 했으면 안 했다고 한다. 곡의 후렴, 간주, 클라이맥스 같은 구간이 어디인지는 알 수 없다: "
    "그런 부탁에는 위치를 짐작해 seek를 부르지 말고, 위치를 알 수 없다고 말한 뒤 원하는 시각(예: 1분 30초)을 말해 달라고 한다.\n"
)
# 사용자가 공유를 켠 좋아요·최근 재생: 목록은 화면에서 오니 먼저 도구로 확인하고, 그 목록에 있는 것만 말한다
_LIKES = (
    "'내가 좋아요한 곡', '좋아요 목록'처럼 사용자의 좋아요를 가리키는 말에는 먼저 my_likes를 불러 목록을 확인하고, 돌려받은 곡만 말한다. "
    "목록은 최근 일부만이라 전체 개수는 모른다고 말한다. 곡을 틀어 달라면 목록의 제목·가수로 playback이나 start_station을 부른다.\n"
)
_RECENT = (
    "'방금 뭐 들었지', '어제 들은 노래', '최근에 들은 곡'처럼 들은 기록을 가리키는 말에는 먼저 recent_plays를 불러 기록을 확인하고, "
    "돌려받은 곡과 시각(playedAt)으로만 답한다. 횟수나 총 시간을 세어 말하지 않는다.\n"
)
# 좋아요·최근 재생을 공유하지 않았다: 도구가 없으니, 지어내지 않고 켜는 방법을 알려 준다
_NO_SHARE = (
    "\n\n사용자의 좋아요 목록이나 최근 재생 기록이 이번 질문에 오지 않았다면(보이는 도구에 my_likes·recent_plays가 없다면) 알 수 없다. "
    "그런 질문에는 채팅 창 위쪽 '내 취향' 줄에서 좋아요 목록이면 '좋아요', 들은 기록이면 '재생 기록' 공유를 켜면 볼 수 있다고 "
    "한 문장으로 말하고 지어내지 않는다. 마이페이지나 다른 설정 얘기는 하지 않는다. request_source는 부르지 않는다."
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
    r"(틀어|들려|재생|검색|찾아|추천|play|어떤 (밴드|가수|곡|노래)|누구|어느 나라|언제 (결성|데뷔|나왔)|앨범|대표곡|비슷한|같은 (노래|곡|가수|밴드)|설명|소개|에 대해|비교|이 (곡|노래|가수)|이거|지금 (듣|나오|재생)|방금|좋아요|스테이션|플레이리스트|다음 곡|이전 곡|멈춰|일시정지|셔플|반복|볼륨|음량|소리|음소거|처음부터|한 곡만|담아|다음에|가사|업\s*넥스트|up\s*next)",
    re.IGNORECASE,
)


# 짧고 분명한 동작 명령은 모델에게 맡기지 않고 코드가 알아본다. 작은 모델은 "다음 곡 넘겨줘"에 도구를 부르지 않고
# "넘길게요"라고 말만 하거나 엉뚱한 동작을 말하는 일이 있다. 곡 이름을 말하는 명령은 이름을 읽어야 해서 모델에게 둔다.
_NOT_COMMAND = re.compile(r"(추천|뭐|누구|어떤|알려|설명|왜|어때|좋아요\s*한|좋아한|\?)")
def _seconds(m: re.Match[str]) -> int:
    """"1분 30초"에서 몇 초인지. 분이나 초 중 하나만 있어도 된다."""
    return int(m.group("m") or 0) * 60 + int(m.group("s") or 0)


_TIME = r"(?:(?P<m>\d+)\s*분)?\s*(?:(?P<s>\d+)\s*초)?"
_DIRECT: list[tuple[re.Pattern[str], object]] = [
    (re.compile(r"(음소거|뮤트|\bmute\b)\s*(해제|풀|끄|꺼)", re.IGNORECASE), ("volume", {"mute": "off"})),
    (re.compile(r"(소리|볼륨|음량)\s*(다시\s*)?(켜|켤)|음소거\s*(풀|해제)"), ("volume", {"mute": "off"})),
    (re.compile(r"(음소거|뮤트|\bmute\b)", re.IGNORECASE), ("volume", {"mute": "on"})),
    (re.compile(r"(소리|볼륨|음량).*(줄여|낮춰|작게|내려)"), ("volume", {"change": -20})),
    (re.compile(r"(소리|볼륨|음량).*(키워|높여|크게|올려)"), ("volume", {"change": 20})),
    (re.compile(r"(소리|볼륨|음량)\s*(?:을|를)?\s*(\d{1,3})\s*(?:%|퍼센트|으로|로)?"), lambda m: ("volume", {"level": int(m.group(2))})),
    (re.compile(r"(셔플|섞어).*(꺼|끄|해제|\boff\b)", re.IGNORECASE), ("player_mode", {"shuffle": "off"})),
    (re.compile(r"(셔플|섞어)"), ("player_mode", {"shuffle": "on"})),
    (re.compile(r"(반복).*(꺼|끄|해제|\boff\b)", re.IGNORECASE), ("player_mode", {"repeat": "off"})),
    (re.compile(r"(전체|모두|플레이리스트)\s*반복"), ("player_mode", {"repeat": "all"})),
    (re.compile(r"(한\s*곡|이\s*(곡|노래)\s*(만)?)\s*(계속\s*)?(반복|리핏|repeat)", re.IGNORECASE), ("player_mode", {"repeat": "one"})),
    (re.compile(r"(처음부터|처음으로|맨\s*앞)"), ("seek", {"seconds": 0, "relative": False})),
    (re.compile(r"(?:맨\s*뒤|끝)\s*(?:에서)?\s*"+_TIME+r"\s*전"), lambda m: ("seek", {"seconds": -_seconds(m), "relative": False}) if _seconds(m) else None),
    (re.compile(_TIME + r"\s*(뒤로|되감|전으로)"), lambda m: ("seek", {"seconds": -_seconds(m), "relative": True}) if _seconds(m) else None),
    (re.compile(_TIME + r"\s*(앞으로|건너뛰|뒤\s*로\s*건너)"), lambda m: ("seek", {"seconds": _seconds(m), "relative": True}) if _seconds(m) else None),
    (re.compile(_TIME + r"\s*(으로|로)\s*(이동|가|넘어|옮겨|점프)"), lambda m: ("seek", {"seconds": _seconds(m), "relative": False}) if _seconds(m) else None),
    (re.compile(r"(지금|이)\s*(듣는|나오는|재생\s*중인)?\s*(곡|노래|음악)\S*\s*(내\s*)?플레이리스트.*담"), ("add_to_playlist", {})),
    (re.compile(r"스테이션\s*(꺼|끄|종료|끝|그만|중지|멈춰)"), ("stop_station", {})),
    (re.compile(r"가사\s*(보여|열어|띄워|틀어|켜)"), ("lyrics", {})),
    (re.compile(r"(다음\s*곡들|다음\s*(에)?\s*나올|업\s*넥스트|up\s*next)", re.IGNORECASE), ("up_next", {})),
    (re.compile(r"(일시\s*정지|멈춰|정지|잠깐\s*스톱|\bstop\b|\bpause\b)", re.IGNORECASE), ("playback", {"command": "pause"})),
    (re.compile(r"(다음\s*(곡|노래)|넘겨|스킵|\bskip\b|\bnext\b)", re.IGNORECASE), ("playback", {"command": "next"})),
    (re.compile(r"(이전\s*(곡|노래)|앞\s*(곡|노래)|\bprevious\b)", re.IGNORECASE), ("playback", {"command": "previous"})),
    (re.compile(r"^(다시|계속)\s*(재생|틀어)"), ("playback", {"command": "resume"})),
    (re.compile(r"^(지금\s*)?(듣는\s*|나오는\s*)?(곡|노래)?\s*(스테이션|라디오)\s*(만들|시작|틀)"), ("start_station", {})),
    (re.compile(r"(지금|이)\s*(듣는|나오는|재생\s*중인)?\s*(곡|노래|음악).*스테이션"), ("start_station", {})),
    (re.compile(r"(지금|이)\s*(듣는|나오는|재생\s*중인)?\s*(곡|노래|음악)?.*좋아요"), ("like_track", {})),
    (re.compile(r"^좋아요\s*(눌러|해|담아|누르)"), ("like_track", {})),
]


def _direct_action(question: str) -> tuple[str, dict] | None:
    """명령 한 마디면 (도구 이름, 인자). 길거나 묻는 말, 곡 이름이 낀 말은 None."""
    q = " ".join(question.split())
    if len(q) > 28 or _NOT_COMMAND.search(q):
        return None
    for pattern, target in _DIRECT:
        m = pattern.search(q)
        if not m:
            continue
        found = target(m) if callable(target) else target
        if found is None:
            continue
        name, args = found
        return name, dict(args)
    return None


# 새 태그 만들기: 곡을 추천하는 대신 태그를 제안한다. 만드는 건 화면이고 사용자가 카드에서 눌러야 한다
_TAG_CREATE = (
    "\n\n사용자가 새 태그를 만들자고 한다. 곡을 추천하지 말고 propose_tag 도구로 태그를 제안한다. "
    "label(태그 이름)은 사용자가 말했으면 그대로, 아니면 곡들의 공통점을 담은 12자 이내의 짧은 한국어 이름을 직접 붙인다. "
    "definition은 곡 제목과 가수 이름만 보고 판정할 수 있는 영어 한 문장(80자 이내: 가수, 나라, 언어, 분위기, 장르)이다. "
    "소리나 박자, 가사를 말하는 표현(beat, rhythm, lyrics 등)은 정의에 넣지 않는다. 시간을 말하는 표현(recently, new, debuted, 최근, 신인 등)도 "
    "넣지 않는다: 판정기는 날짜를 모른다. 대신 사용자가 예로 든 가수가 있으면 그 가수들과 비슷하다고 쓰고(예: 'hip hop-leaning songs by "
    "K-pop boy groups similar to Stray Kids and CORTIS'), 그 가수들을 sample_artists에 영어 표기로 넣는다. "
    "sample_tag는 Last.fm에 실제 있는 한두 단어 장르 태그(kpop, korean hip hop, indie rock, city pop 등)만 쓴다. "
    "가사나 소리처럼 판정할 수 없는 기준이면 그렇다고 말하고 판정할 수 있는 말로 바꿔 보자고 한다. "
    "무슨 곡을 모으고 싶은지 아직 모르면(예: '태그 만들고 싶어') 도구를 부르기 전에 한 가지만 구체적으로 묻는다. "
    "도구가 돌려준 미리보기는 화면에 카드로 따로 보인다. 글은 어떻게 정리했는지 한두 문장만 쓰고, 곡 목록을 나열하지 "
    "않으며, 이미 만들었다고 말하지 않는다(만드는 건 사용자가 카드의 '태그 만들기'를 눌렀을 때뿐이다). 마크다운 기호는 쓰지 않는다. "
    "사용자가 이름이나 기준을 고치고 싶다고 하면 propose_tag를 다시 불러 새 제안을 만든다."
)
_MAKES_TAG = re.compile(r"태그.*(만들|만드|생성|새로\s*추가)|(만들|만드|생성).*태그")
_NOT_TAG_JOB = re.compile(r"삭제|지워|없애|플레이리스트")
_TAG_FILLER = re.compile(r"이런|곡만|모으는|모을|내|새로|새|하나|좀|를|을|은|는|이|가|만들어|만들고|만들|만드는|만들래|만들어줘|줘|주세요|싶어요|싶어|해줘|해 줘|태그|요|\s")


# 동작을 했다/하겠다고 말하는 글: 이런 말을 하면서 동작 도구를 부르지 않았으면 거짓말이 된다
_CLAIMS_ACTION = re.compile(
    r"(이동(?:할게|할께|했|해 드릴|하겠)|건너뛸|건너뛰었|옮길|옮겼|틀게|틀어 드릴|틀었|재생할게|재생해 드릴|재생했|멈출게|멈췄|일시정지했|좋아요를 (?:눌렀|누를게)|담았|담을게|켤게|켰|껐|끌게|올렸|낮췄|시작할게|시작했|만들게|바꿨|바꿀게)"
)
# '했어?'처럼 이미 한 일을 확인하는 말에는 다시 하지 않는다(대화 기록을 보고 사실대로 답하게 한다)
_ASKS_DONE = re.compile(r"했어\?|됐어\?|한 거야|된 거야|했나요|됐나요|했니|됐니|했어요\?|됐어요\?")

# 태그 제안에 답하는 중에도 다른 일을 시키는 말: 이런 말은 제안을 고치는 말로 보지 않는다
_OTHER_JOB = re.compile(r"틀어|재생|좋아요|다음 곡|이전 곡|멈춰|일시정지|볼륨|음량|스테이션|페이지|이동|팔로우|가사 보여|취소|아니|고마워|됐어")
# 방금 제안한 새 태그에 사용자가 아직 답하지 않았다(화면이 대화 기록에 이렇게 적어 보낸다)
_TAG_PENDING = (
    "\n\n방금 새 태그를 제안했고 사용자는 아직 답하지 않았다. 사용자의 말이 그 제안을 고치려는 말이면(더 밝게, 가사가 있어도 좋다, "
    "어떤 가수 느낌이 부족하다, 이름을 바꾸자 등) 곡을 추천하지 말고 propose_tag를 다시 불러 고친 새 제안을 만든다. "
    "곡 추천처럼 답하지 않는다. 사용자가 샘플 곡을 바꿔 다시 보여 달라고 하면 이름과 기준은 그대로 두고 "
    "sample_tag만 다른 흔한 장르 태그로 바꿔 propose_tag를 다시 부른다."
)


def _tag_creation(question: str, history: list[dict]) -> tuple[bool, bool, bool]:
    """(태그 만들기 도구를 줄지, 첫 호출에서 강제할지, 제안에 답하는 중인지).
    도구는 만들자는 말이나, 방금 제안한 태그를 고치자는 말에 준다. 강제는 어떤 곡을 모을지 말한 요청이나 제안을 고치는
    말에만 한다: '태그 만들고 싶어'만 있으면 먼저 물어야 한다."""
    q = " ".join(question.split())
    if _NOT_TAG_JOB.search(q):
        return False, False, False
    last = next((m for m in reversed(history) if m.get("role") == "assistant"), None)
    content = str(last.get("content", "")) if last else ""
    pending = "제안한 새 태그" in content and "아직 답 없음" in content
    if pending and not _OTHER_JOB.search(q):
        # 제안이 떠 있는 동안의 말은 그 제안을 고치는 말이다: '조금 더 밝았으면 좋겠어'에 '태그'나 '바꿔'가 없어도
        return True, True, True
    if _MAKES_TAG.search(q):
        specific = len(_TAG_FILLER.sub("", q)) >= 4
        return True, specific, pending
    if "태그" in content and re.search(r"바꿔|고쳐|수정|말고|대신|이름|으로 해|다시", q):
        return True, False, pending
    return False, False, False


# 사용자에 대한 기억(화면이 계정에서 읽어 보낸 짧은 줄들): 말투와 취향에 자연스럽게 반영한다
def _memory_prompt(text: str) -> str:
    return (
        "\n\n이 사용자에 대해 기억하는 것:\n" + text + "\n"
        "이 기억을 말투와 추천에 자연스럽게 반영한다: 말투 줄이 있으면 그 말투(존댓말/반말, 길이, 이모지)를 따르고, "
        "좋아해요 줄은 곡을 고를 때, 피해요 줄은 피할 때 참고한다. 지금 사용자가 하는 말이 기억과 다르면 지금 말을 따른다. "
        "기억하고 있다는 말을 하거나 기억을 그대로 읊지 않는다. 기억에 없는 것을 아는 것처럼 말하지 않는다."
    )


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
        "바꾸는 건 사용자가 화면에서 적용을 눌렀을 때뿐이다. 사용자가 샘플 곡을 바꿔 다시 보여 달라고 하면 기준은 그대로 두고 "
        "sample_tag나 sample_artists만 바꿔 다시 부른다.\n"
        "5-1. 기준에 시간을 말하는 표현(recently, new, debuted, 최근, 신인 등)이나 소리·가사를 말하는 표현은 넣지 않는다: 판정기는 제목과 "
        "가수 이름만 본다. 사용자가 예로 든 가수가 있으면 '그 가수들과 비슷한 가수의 곡'으로 쓰고, 그 가수들을 sample_artists에 "
        "영어 표기로 넣는다(예: Stray Kids, CORTIS). sample_tag는 Last.fm에 있는 한두 단어 장르 태그만 쓴다.\n"
        "6. '지금 듣는 노래', '이 곡'처럼 재생 중인 곡을 가리키며 그걸 기준으로 삼고 싶다고 하면 먼저 "
        "now_playing을 불러 곡 제목과 가수를 확인한다. 이 대화에서는 track_info나 artist_info를 쓸 수 "
        "없으니, 확인한 제목과 가수만으로 기준을 정리해 propose_definition을 부른다. 재생 중인 곡이 "
        "없다고 나오면 그렇게 말한다."
    )


# 다듬기 대화에서 곡·플레이리스트 동작을 부탁받았을 때. 동작을 할 수 없는 사용자(Spotify 연결 없음)에게는 다른 문장을 쓴다
_REFINE_ACTIONS = (
    "\n7. 기준 정리 말고 다른 부탁(플레이리스트 만들기, 좋아요, 재생, 스테이션 등)이 오면 '할 수 없다'고 하기 전에 "
    "쓸 수 있는 도구 중 맞는 것이 있는지 먼저 본다. 방금 찾은(미리보기에서 통과한) 곡들을 플레이리스트에 담아 달라거나 "
    "만들어 달라는 말에는 make_playlist(name, source=\"shown\")를 부른다. name은 사용자가 말했으면 그대로, 아니면 "
    "태그 이름을 쓴다. 이미 있는 플레이리스트에 곡을 담으라면 add_to_playlist이고, 방금 찾은 여러 곡을 담으라는 말이면 source=\"shown\"과 사용자가 말한 플레이리스트 이름(name)을 넣는다. 좋아요는 like_track, 곡 하나만 "
    "틀어 달라면 play_one이다. 이 도구들은 제안만 하고 결과는 화면이 카드로 따로 보여 준다. 그래서 글은 "
    "\"~할게요\"처럼 한 문장으로 알리고 이미 됐다고 단정하지 않으며, 곡 목록을 되풀이하지 않는다. 플레이리스트는 "
    "사용자가 만들기를 눌러야 만들어진다. 도구에 없는 일은 할 수 없다고 한 문장으로 말한다."
)
_REFINE_NO_ACTIONS = (
    "\n7. 플레이리스트에 담기, 좋아요, 재생 같은 동작은 지금 할 수 없다(사용자가 Spotify에 연결하지 않았다). "
    "그런 부탁에는 Spotify를 연결하면 할 수 있다고 한 문장으로 말한다."
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


_PAGE_LABEL = {
    "home": "홈", "history": "최근 재생 기록", "mypage": "마이페이지", "issues": "지난 호",
    "weekly_artist": "금주의 아티스트 페이지", "editors_pick": "에디터스 픽 페이지", "station": "스테이션",
}


def _batchim(word: str) -> bool | None:
    """마지막 글자가 받침으로 끝나면 True, 아니면 False, 한글이 아니면 None."""
    ch = word.rstrip()[-1:]
    if not ch or not ("가" <= ch <= "힣"):
        return None
    return (ord(ch) - 0xAC00) % 28 != 0


def _canned(name: str, action: dict) -> str | None:
    """페이지 이동·팔로우는 화면이 바로 해 주므로, 말로 알리는 한 줄은 모델을 다시 부르지 않고 만든다."""
    if name == "open_page":
        page, title = action.get("page"), str(action.get("title") or "").strip()
        label = _PAGE_LABEL.get(page) or {
            "search": f"‘{title}’ 검색 결과", "artist": f"{title} 가수 페이지", "album": f"{title} 앨범 페이지",
        }.get(page)
        if not label:
            return None
        last = (ord(label[-1]) - 0xAC00) % 28 if _batchim(label) else 0
        return f"{label}{'으로' if last not in (0, 8) else '로'} 이동할게요."
    if name == "follow_artist":
        artist = str(action.get("artist") or "").strip()
        if not artist:
            return "지금 듣는 곡의 가수를 팔로우할게요."
        final = _batchim(artist)
        return f"{artist}{'을' if final else '를' if final is False else '을(를)'} 팔로우할게요."
    return None


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
    likes: list[dict] | None = None,
    recent: list[dict] | None = None,
    memory: dict | None = None,
    avoid: list[str] | None = None,
) -> Iterator[dict]:
    """이벤트를 하나씩 내보낸다.

    memory={"text", "count"}는 화면이 계정에서 읽어 보낸 이 사용자에 대한 기억(취향·말투)의 요약이고, 시작할 때
    {"type": "memory", "count"}로 몇 가지를 참고했는지 알린다. avoid는 이미 추천했거나 반응이 있는 곡의 키("제목|가수")로,
    다시 추천하지 않는다.

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
    스테이션·플레이리스트·페이지 이동·팔로우 같은 동작을 대신 할 수 있다는 뜻이다: 그때만 동작 도구가 모델에게 보인다. 동작 도구의
    {"type": "tool_result"}에는 result["action"]이 있고, 실제 실행은 화면이 한다.

    likes([{"title", "artist"}], 최근순)와 recent([{"title", "artist", "playedAt"}], 최근순)는 사용자가 공유를 켰을 때만
    오는 좋아요한 곡·최근 재생 기록이다. 모델에게는 처음부터 보여 주지 않고, my_likes·recent_plays 도구를 부를 때 알려 준다.

    cards=True는 곡을 화면이 카드로 보여 주는 경우다. 글이 곡 이름을 말하지 않으니 "곡을
    말했는가"로 하는 재시도 검사는 끄고, 글은 기준 설명만 쓰게 한다.
    """
    # model이 None이면 설정된 기본 모델(Gemini 또는 로컬). 이름을 주면 그 이름의 Ollama 모델이다.
    if model is None and config.PROVIDER == "ollama":
        model = config.LOCAL_GENERATION_MODEL
    # sources: 사용자가 켜 둔 출처(lastfm·wikipedia·musicbrainz). None이면 전부. 다듬기 대화는 출처와 무관하다.
    # 다듬기 대화에서도 화면이 지금 듣는 곡을 보내 줬다면 now_playing을 쓸 수 있다("지금 듣는 노래랑 비슷하게")
    tools = (
        TOOLS_REFINE
        # 다듬기에서도 화면이 하는 일(플레이리스트에 담기, 좋아요, 재생 등)과 화면이 보내 준 정보를 쓸 수 있다.
        # 곡 검색 도구는 뺀다: propose_definition이 이미 곡을 찾아 보여 주고, 많이 주면 작은 모델이 고르기 어려워한다
        + tuple(t for t in tools_for([], now_playing is not None, can_act, station is not None, likes is not None, recent is not None) if t != "request_source")
        if refine
        else tools_for(sources, now_playing is not None, can_act, station is not None, likes is not None, recent is not None)
    )
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
    # 작은 모델은 ‘팔로우해줘’에 도구를 부르지 않고 ‘팔로우할게요’라고만 답하곤 한다: 요청이 분명하면 첫 호출에서 도구를 강제한다
    if not refine and "follow_artist" in tools and re.search(r"팔로우\s*(해|할|하자|좀)", question) and not re.search(r"취소|해제|언팔", question):
        force_first = ["follow_artist"]
    elif (
        not refine and "open_page" in tools
        and re.search(r"이동|열어|가줘|가자|가볼", question)
        and re.search(r"홈|마이\s*페이지|최근\s*재생|기록|지난\s*호|이슈|금주|에디터|검색|페이지|앨범|가수", question)
        and not re.search(r"스테이션|가사|플레이리스트", question)
    ):
        force_first = ["open_page"]
    # 플레이리스트에 담아 달라는 분명한 부탁: 작은 모델이 '담아드릴게요'라고만 답하고 도구를 안 부르는 일이 있다. 만들기와 담기 중 어느 쪽인지는 모델이 고른다
    elif (
        can_act
        and re.search(r"플레이리스트", question)
        and re.search(r"담|넣|만들", question)
        and not re.search(r"\?|어떻게|방법|뭐|왜|추천", question)
    ):
        force_first = [t for t in ("make_playlist", "add_to_playlist") if t in tools]
    if not refine:
        wants_tag, force_tag, answering = _tag_creation(question, history)
        if wants_tag:
            tools = tuple(tools) + ("propose_tag",)
            system += _TAG_CREATE + (_TAG_PENDING if answering else "")
            if force_tag and not force_first:
                force_first = ["propose_tag"]
    session = Session(now_playing, station, likes, recent)
    # 사용자에 대한 기억은 말투와 취향에 반영한다(태그 다듬기에서는 말투만 의미가 있지만 같이 보낸다)
    if memory and memory.get("text"):
        system += _memory_prompt(str(memory["text"]))
    # 이미 보여 줬거나 반응이 있는 곡은 추천에서 뺀다(곡 찾는 도구가 session.seen을 걸러 낸다)
    if avoid and not refine:
        session.seen |= {str(k).lower() for k in avoid}
    if refine:
        system += _REFINE_ACTIONS if can_act else _REFINE_NO_ACTIONS
    if not refine:
        system += ("\n\n" + _NOW) if now_playing is not None else _NO_NOW
        system += ("\n" + _ACTIONS) if can_act else _NO_ACT
        if station is not None:
            system += "\n" + _STATION
        if likes is not None:
            system += "\n" + _LIKES
        if recent is not None:
            system += "\n" + _RECENT
        if likes is None or recent is None:
            system += _NO_SHARE
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
    # 이번 대화 차례에 동작 도구를 불렀는지(미리 실행한 동작 포함). 안 불렀는데 했다고 말하면 바로잡는다
    acted = bool(direct and direct[0] in tools)
    claim_guard = False
    claim_nudged = False
    # 도구를 쓰라고 되돌린 직후의 호출: 도구를 부르면 그 답으로 바꾸고, 안 부르면 처음 답을 그대로 둔다
    after_nudge = False
    # 마지막 top_tracks가 돌려준 곡 수. 0곡이면 답하기 전에 다른 태그로 한 번 더 찾아 본다.
    last_found: int | None = None
    retried_empty = False

    if memory and memory.get("text"):
        yield {"type": "memory", "count": int(memory.get("count") or 1)}

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
                if claim_guard:
                    # 하지도 않은 동작을 했다고 말했고 그래도 도구를 안 부른다: 처음 답을 지우고 바로잡은 말을 보여 준다
                    claim_guard = False
                    yield {"type": "retry", "reason": "하지 않은 동작을 했다고 말해 바로잡음"}
                    yield {"type": "token", "data": content.strip() or "그 동작은 하지 못했어요. 할 수 있는 동작이면 다시 말씀해 주세요."}
                # 도구를 안 쓰기로 했다: 처음 답이 화면에 그대로 남는다
                yield from tail(step)
                return
            claim_guard = False
            # 도구를 쓴다: 처음 답은 버리고 도구 결과로 다시 답한다
            yield {"type": "retry", "reason": "도구로 확인하지 않아 다시 시도"}
            content = ""

        if not calls:
            # 동작을 했다거나 하겠다고 말하면서 동작 도구는 안 불렀다: 한 것처럼 말하게 두지 않고 한 번 되돌린다
            if (
                can_act
                and not acted
                and not claim_nudged
                and not _ASKS_DONE.search(question)
                and _CLAIMS_ACTION.search(content)
            ):
                claim_nudged = True
                claim_guard = True
                after_nudge = True
                messages.append({"role": "assistant", "content": content})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "방금 동작을 했다거나 하겠다고 말했지만 동작 도구를 부르지 않았어. 할 수 있는 동작이면 지금 맞는 도구를 불러. "
                            "도구로 할 수 없는 일이면(예: 곡의 후렴이 어디인지 모를 때) 한 것처럼 말하지 말고 할 수 없다고 한 문장으로 말해."
                        ),
                    }
                )
                continue
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
                            "시킨 거면 like_track, playback, player_mode, seek, volume, play_one, add_to_playlist, up_next, lyrics, stop_station, start_station, make_playlist, 가수나 곡에 대한 질문이면 "
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
        canned: list[str] = []
        for call in calls:
            fn = call["function"]
            if fn["name"] in ACTION_TOOLS:
                acted = True
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
            if isinstance(result, dict) and isinstance(result.get("action"), dict):
                line = _canned(fn["name"], result["action"])
                if line:
                    canned.append(line)
            if isinstance(result, dict) and isinstance(result.get("tracks"), list):
                seen_titles += [t["title"] for t in result["tracks"] if "title" in t]
                if fn["name"] == "top_tracks":
                    last_found = len(result["tracks"])
            messages.append(
                {"role": "tool", "tool_name": fn["name"], "content": json.dumps(result, ensure_ascii=False)}
            )
        # 이동·팔로우만 시킨 턴: 한 줄은 이미 있으니 모델을 다시 부르지 않는다 (답이 늦거나 비는 일, 호출 한도 소모가 없다)
        if canned and len(canned) == len(calls):
            yield {"type": "token", "data": " ".join(canned)}
            yield from tail(step)
            return

    # 단계를 다 썼는데도 도구만 부르고 있다 — 지금까지 모은 걸로 마무리하라고 요청한다
    messages.append({"role": "user", "content": "지금까지 확인한 곡으로 바로 답해줘."})
    for chunk in _chat_stream(messages, model, tools):
        text = chunk.get("message", {}).get("content")
        if text:
            yield {"type": "token", "data": text}
    yield from tail(MAX_STEPS + 1)
