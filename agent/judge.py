"""곡이 조건에 맞는지 판정하는 별도 모델 호출.

에이전트 본체와 일부러 나눴다. 대화 맥락 없이 "이 제목과 가수가 이 조건에 맞는가"만 묻고,
JSON 스키마로 답의 모양을 강제하고, 온도는 0이다. 같은 곡은 같은 답을 받는다.
Superlike의 Gemini 분위기 판정(lib/gemini/moods.ts)과 같은 질문 형식이라 두 모델을
같은 곡으로 비교할 수 있다.
"""

from __future__ import annotations

import json
import os

import requests

from agent import config

BATCH = 20

SYSTEM_PROMPT = (
    "You judge whether songs fit a condition, from the title and artist only.\n"
    "For every track in order, answer true only when it clearly fits the whole condition, "
    "false when it does not or you do not know the song.\n"
    'Answer with JSON only: {"fits": [true, false, ...]} — exactly one boolean per track, in the order given.'
)


def _schema(n: int) -> dict:
    # 곡마다 id까지 쓰게 하면 20곡에 12초가 걸렸다. 순서대로 불리언만 받되, 길이는 곡 수로 고정한다.
    return {
        "type": "object",
        "properties": {
            "fits": {"type": "array", "items": {"type": "boolean"}, "minItems": n, "maxItems": n}
        },
        "required": ["fits"],
    }


# 같은 조건·같은 곡은 다시 묻지 않는다. 판정이 실패한 곡은 넣지 않는다 (실패는 답이 아니다).
_cache: dict[tuple[str, str], bool] = {}


def _key(track: dict) -> str:
    return f"{track['title']}|{track['artist']}".lower()


def _examples_block(examples: dict | None) -> str:
    """사용자가 알려 준 정답. 판정할 곡 앞에 붙여서 이 사람의 기준을 보여 준다."""
    if not examples:
        return ""
    def lines(items: list[dict]) -> str:
        return "\n".join(f"- {t['title']} — {t['artist']}" for t in items)
    out = ""
    if examples.get("fits"):
        out += f"Examples the listener confirmed DO fit:\n{lines(examples['fits'])}\n"
    if examples.get("not"):
        out += f"Examples the listener confirmed do NOT fit:\n{lines(examples['not'])}\n"
    return out


def _ask(
    condition: str, tracks: list[dict], model: str, examples: dict | None = None
) -> list[bool | None]:
    question = f"Condition: {condition}\n{_examples_block(examples)}Tracks:\n" + "\n".join(
        f"{i + 1}. {t['title']} — {t['artist']}" for i, t in enumerate(tracks)
    )
    response = requests.post(
        f"{config.LOCAL_GENERATION_BASE_URL}/api/chat",
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": question},
            ],
            "stream": False,
            "think": False,
            "format": _schema(len(tracks)),
            "options": {"temperature": 0},
        },
        timeout=180,
    )
    response.raise_for_status()
    fits = json.loads(response.json()["message"]["content"]).get("fits")
    if not isinstance(fits, list) or len(fits) != len(tracks):
        return [None] * len(tracks)
    return [f if isinstance(f, bool) else None for f in fits]


def judge(
    condition: str, tracks: list[dict], model: str | None = None, examples: dict | None = None
) -> list[bool | None]:
    """곡마다 True/False. None은 모델이 답하지 않은 곡이고, 조건에 맞는다고 보지 않는다."""
    model = model or os.environ.get("JUDGE_MODEL") or config.LOCAL_GENERATION_MODEL
    # 예시가 다르면 같은 곡도 다른 답을 받을 수 있으니 캐시 키에 예시를 포함한다
    scope = condition + "\u0000" + _examples_block(examples)
    results: list[bool | None] = [_cache.get((scope, _key(t))) for t in tracks]
    todo = [i for i, r in enumerate(results) if r is None]
    for start in range(0, len(todo), BATCH):
        idx = todo[start : start + BATCH]
        answers = _ask(condition, [tracks[i] for i in idx], model, examples)
        for i, answer in zip(idx, answers):
            if answer is not None:
                _cache[(scope, _key(tracks[i]))] = answer
            results[i] = answer
    return results
