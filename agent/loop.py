"""도구를 부르는 에이전트 루프.

모델에게 질문과 도구 목록을 주면, 모델은 답하거나 도구를 부르겠다고 한다. 도구를
부르면 실행해서 결과를 대화에 붙이고 다시 모델에게 넘긴다. 도구 호출 없이 답이
나오면 끝이다. 같은 일을 끝없이 반복하지 않도록 MAX_STEPS에서 멈춘다.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator

import requests

from agent import config
from agent.tools import TOOLS, Session, call_tool

MAX_STEPS = 4

SYSTEM_PROMPT = (
    "너는 음악 이야기를 나누는 친절한 AI 어시스턴트다. 자연스러운 대화체로 답한다.\n\n"
    "곡을 추천할 때는 먼저 top_tracks로 실제 곡을 가져온다. tag에는 장르나 나라를 영어로 쓰고 "
    "(한국 노래면 k-indie, korean ballad 등), 사용자가 분위기나 상황까지 말했다면 condition에 "
    "그 전부를 영어 한 문장으로 적는다. 돌려받은 곡이 3곡 미만이면 tag를 바꿔 다시 부른다.\n"
    "추천은 돌려받은 곡 중 최대 5곡을 '곡명 - 가수' 목록으로만 보여주고, 곡마다 설명을 "
    "붙이지 않는다 (곡을 듣지 못했으니 내용을 알 수 없다). 마지막에 왜 이 곡들을 골랐는지 "
    "한두 문장으로 말한다. 돌려받은 곡이 1~2곡뿐이어도 그 곡을 추천하고, 부족하다고 "
    "미리 포기하지 않는다. 돌려받지 않은 곡은 말하지 않는다.\n\n"
    "날씨, 시간, 뉴스처럼 네가 알 수 없는 것은 모른다고 짧게 말하고, 음악 이야기로 돌아오도록 "
    "이끈다."
)


def _mentions_any(text: str, titles: list[str]) -> bool:
    flat = text.lower()
    return any(t.lower() in flat for t in titles if len(t) >= 2)


def _chat_stream(messages: list[dict], model: str) -> Iterator[dict]:
    """Ollama /api/chat 한 번. 줄마다 오는 조각을 그대로 내보낸다."""
    payload = {
        "model": model,
        "messages": messages,
        "tools": [t["schema"] for t in TOOLS.values()],
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


def run_agent(history: list[dict], question: str, model: str | None = None) -> Iterator[dict]:
    """이벤트를 하나씩 내보낸다.

    {"type": "tool_call", "name", "arguments"} — 모델이 도구를 부르기로 했다
    {"type": "tool_result", "name", "result"}  — 도구가 돌려준 값
    {"type": "retry", "reason"}                  — 곡을 못 골라서 다시 시킨다 (앞서 나간 글자는 버려도 된다)
    {"type": "token", "data"}                   — 답변 글자 조각
    {"type": "done", "steps"}                   — 끝. steps는 모델을 부른 횟수
    """
    model = model or os.environ.get("AGENT_MODEL") or config.LOCAL_GENERATION_MODEL
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": question},
    ]

    # 도구가 돌려준 곡 제목들. 답변이 이 중 하나도 말하지 않으면 추천을 못 한 것이다.
    seen_titles: list[str] = []
    session = Session()

    for step in range(1, MAX_STEPS + 1):
        content = ""
        calls: list[dict] = []
        for chunk in _chat_stream(messages, model):
            message = chunk.get("message", {})
            if message.get("content"):
                content += message["content"]
                yield {"type": "token", "data": message["content"]}
            calls.extend(message.get("tool_calls") or [])

        if not calls:
            # 곡 목록을 받아 놓고 곡 하나 고르지 않은 채 끝내려는 경우: "다시 찾아볼게요"만
            # 말하고 멈추는 작은 모델의 버릇이라, 한 번 더 시킨다.
            if seen_titles and step < MAX_STEPS and not _mentions_any(content, seen_titles):
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
            result = call_tool(fn["name"], args, session)
            yield {"type": "tool_result", "name": fn["name"], "result": result}
            if isinstance(result, dict) and isinstance(result.get("tracks"), list):
                seen_titles += [t["title"] for t in result["tracks"] if "title" in t]
            messages.append(
                {"role": "tool", "tool_name": fn["name"], "content": json.dumps(result, ensure_ascii=False)}
            )

    # 단계를 다 썼는데도 도구만 부르고 있다 — 지금까지 모은 걸로 마무리하라고 요청한다
    messages.append({"role": "user", "content": "지금까지 확인한 곡으로 바로 답해줘."})
    for chunk in _chat_stream(messages, model):
        text = chunk.get("message", {}).get("content")
        if text:
            yield {"type": "token", "data": text}
    yield {"type": "done", "steps": MAX_STEPS + 1}
