"""Gemini 호출. 대화(도구 호출 포함)와 판정(JSON 스키마) 두 가지만 한다.

대화는 Ollama의 /api/chat 조각과 같은 모양({"message": {"content", "tool_calls"}})으로 바꿔서
내보낸다. 그래야 에이전트 루프(loop.py)가 어느 모델이든 같은 코드로 돈다.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator

import requests

from agent import config

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# 한도 초과(429)나 일시적인 서버 오류는 잠깐 쉬고 다시 시도한다
_RETRY_STATUS = {429, 500, 502, 503, 504}
_RETRIES = 3


class GeminiError(RuntimeError):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def _headers() -> dict:
    if not config.GEMINI_API_KEY:
        raise GeminiError("GEMINI_API_KEY가 없습니다. .env.local에 넣어 주세요.")
    return {"x-goog-api-key": config.GEMINI_API_KEY, "Content-Type": "application/json"}


def _post(method: str, payload: dict, stream: bool = False) -> requests.Response:
    url = f"{_BASE}/{config.GEMINI_MODEL}:{method}" + ("?alt=sse" if stream else "")
    for attempt in range(_RETRIES + 1):
        response = requests.post(url, headers=_headers(), json=payload, stream=stream, timeout=120)
        if response.status_code not in _RETRY_STATUS or attempt == _RETRIES:
            break
        response.close()
        time.sleep(1.5 * (attempt + 1))
    if not response.ok:
        raise GeminiError(f"Gemini {response.status_code}: {response.text[:300]}", response.status_code)
    return response


def generate_json(system: str, question: str, schema: dict) -> str:
    """스키마에 맞는 JSON 문자열 하나. 온도 0."""
    response = _post(
        "generateContent",
        {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": question}]}],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
                "responseSchema": schema,
            },
        },
    )
    parts = response.json()["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts if not p.get("thought"))


def _declaration(schema: dict) -> dict:
    fn = schema["function"]
    return {"name": fn["name"], "description": fn["description"], "parameters": fn["parameters"]}


def _contents(messages: list[dict]) -> tuple[str, list[dict]]:
    """Ollama 모양의 대화를 Gemini의 systemInstruction과 contents로 바꾼다."""
    system = ""
    contents: list[dict] = []

    def add(role: str, parts: list[dict]) -> None:
        # 같은 역할이 이어지면 한 턴으로 합친다 (도구 결과 여러 개가 한 턴이어야 한다)
        if contents and contents[-1]["role"] == role:
            contents[-1]["parts"] += parts
        else:
            contents.append({"role": role, "parts": parts})

    for m in messages:
        role = m["role"]
        if role == "system":
            system += m["content"]
        elif role == "user":
            add("user", [{"text": m["content"]}])
        elif role == "assistant":
            parts: list[dict] = []
            if m.get("content"):
                parts.append({"text": m["content"]})
            for call in m.get("tool_calls") or []:
                # 모델이 준 조각(생각 서명 포함)을 그대로 돌려줘야 다음 호출이 받아들여진다
                parts.append(
                    call.get("_part")
                    or {"functionCall": {"name": call["function"]["name"], "args": call["function"].get("arguments") or {}}}
                )
            if parts:
                add("model", parts)
        elif role == "tool":
            try:
                body = json.loads(m["content"])
            except json.JSONDecodeError:
                body = m["content"]
            # functionResponse.response는 객체여야 한다
            response = body if isinstance(body, dict) else {"result": body}
            add("user", [{"functionResponse": {"name": m["tool_name"], "response": response}}])
    return system, contents


def chat_stream(messages: list[dict], tools: list[dict]) -> Iterator[dict]:
    """Gemini 한 번 호출. Ollama와 같은 모양의 조각을 내보낸다."""
    system, contents = _contents(messages)
    response = _post(
        "streamGenerateContent",
        {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": contents,
            "tools": [{"functionDeclarations": [_declaration(t) for t in tools]}],
            "generationConfig": {"temperature": config.GENERATION_TEMPERATURE},
        },
        stream=True,
    )
    with response:
        for raw in response.iter_lines():
            if not raw.startswith(b"data:"):
                continue
            data = json.loads(raw[5:].decode("utf-8"))
            candidates = data.get("candidates") or []
            parts = (candidates[0].get("content", {}).get("parts") or []) if candidates else []
            for part in parts:
                if part.get("thought"):
                    continue
                if part.get("text"):
                    yield {"message": {"content": part["text"]}}
                elif part.get("functionCall"):
                    fc = part["functionCall"]
                    call = {"function": {"name": fc["name"], "arguments": fc.get("args") or {}}, "_part": part}
                    yield {"message": {"tool_calls": [call]}}
