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
from agent.tools import TOOLS, TOOLS_CHAT, TOOLS_REFINE, Session, call_tool

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
    "곡을 직접 재생할 수는 없다. 찾은 곡은 화면에 카드로 나오니, 카드의 재생 버튼을 누르면 들을 수 "
    "있다고 안내한다.\n"
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
    "날씨, 시간, 뉴스처럼 네가 알 수 없는 것은 모른다고 짧게 말하고, 음악 이야기로 돌아오도록 "
    "이끈다."
)
SYSTEM_PROMPT = _HEAD + _NAMED + _RULE_LIST + _TAIL
SYSTEM_PROMPT_CARDS = _HEAD + _NAMED + _NAMED_CARDS + _RULE_CARDS + _TAIL


# 곡을 틀거나 찾아 달라는 말, 추천해 달라는 말: 이런 요청은 도구로 확인해야 답할 수 있다
_NEEDS_TOOL = re.compile(r"(틀어|들려|재생|검색|찾아|추천|play)", re.IGNORECASE)


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


def _mentions_any(text: str, titles: list[str]) -> bool:
    flat = text.lower()
    return any(t.lower() in flat for t in titles if len(t) >= 2)


def _chat_stream(messages: list[dict], model: str | None, tools: tuple[str, ...] = TOOLS_CHAT) -> Iterator[dict]:
    """모델 한 번 호출. 조각은 Ollama /api/chat 모양이고, Gemini도 같은 모양으로 맞춰 내보낸다."""
    if config.uses_gemini(model):
        yield from gemini.chat_stream(messages, [TOOLS[n]["schema"] for n in tools])
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
) -> Iterator[dict]:
    """이벤트를 하나씩 내보낸다.

    {"type": "tool_call", "name", "arguments"} — 모델이 도구를 부르기로 했다
    {"type": "tool_result", "name", "result"}  — 도구가 돌려준 값
    {"type": "retry", "reason"}                  — 곡을 못 골라서 다시 시킨다 (앞서 나간 글자는 버려도 된다)
    {"type": "token", "data"}                   — 답변 글자 조각
    {"type": "done", "steps"}                   — 끝. steps는 모델을 부른 횟수

    refine={"label", "definition"}이면 곡 추천이 아니라 그 태그의 기준을 정하는 대화다: 도구는
    propose_definition 하나이고, 곡 이름·추천에 대한 되돌림 검사는 하지 않는다.

    cards=True는 곡을 화면이 카드로 보여 주는 경우다. 글이 곡 이름을 말하지 않으니 "곡을
    말했는가"로 하는 재시도 검사는 끄고, 글은 기준 설명만 쓰게 한다.
    """
    # model이 None이면 설정된 기본 모델(Gemini 또는 로컬). 이름을 주면 그 이름의 Ollama 모델이다.
    if model is None and config.PROVIDER == "ollama":
        model = config.LOCAL_GENERATION_MODEL
    tools = TOOLS_REFINE if refine else TOOLS_CHAT
    system = (
        refine_prompt(refine["label"], refine["definition"])
        if refine
        else (SYSTEM_PROMPT_CARDS if cards else SYSTEM_PROMPT)
    )
    messages = [
        {"role": "system", "content": system},
        *history,
        {"role": "user", "content": question},
    ]

    # 도구가 돌려준 곡 제목들. 답변이 이 중 하나도 말하지 않으면 추천을 못 한 것이다.
    seen_titles: list[str] = []
    session = Session()
    nudged = False
    # 마지막 top_tracks가 돌려준 곡 수. 0곡이면 답하기 전에 다른 태그로 한 번 더 찾아 본다.
    last_found: int | None = None
    retried_empty = False

    for step in range(1, MAX_STEPS + 1):
        content = ""
        calls: list[dict] = []
        for chunk in _chat_stream(messages, model, tools):
            message = chunk.get("message", {})
            if message.get("content"):
                content += message["content"]
                yield {"type": "token", "data": message["content"]}
            calls.extend(message.get("tool_calls") or [])

        if not calls:
            # 곡 이름을 말했는데 도구를 부르지 않고 "그런 곡은 없다"거나 아는 척 답하는 경우: 작은 모델이
            # 확인 없이 단정하는 버릇이라, 도구를 먼저 쓰도록 한 번 되돌린다.
            if not refine and step == 1 and not nudged and _NEEDS_TOOL.search(question):
                nudged = True
                yield {"type": "retry", "reason": "도구로 확인하지 않아 다시 시도"}
                messages.append({"role": "assistant", "content": content})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "도구를 먼저 불러서 확인한 뒤에 답해줘. 곡 이름을 말한 거면 find_track, "
                            "분위기나 장르를 말한 거면 top_tracks를 불러."
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
            yield {"type": "done", "steps": step}
            return

        # 모델의 도구 호출 요청을 대화에 남겨야 다음 턴에서 "내가 이걸 불렀다"를 안다
        messages.append({"role": "assistant", "content": content, "tool_calls": calls})
        for call in calls:
            fn = call["function"]
            args = fn.get("arguments") or {}
            yield {"type": "tool_call", "name": fn["name"], "arguments": args}
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
    yield {"type": "done", "steps": MAX_STEPS + 1}
