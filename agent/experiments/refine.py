"""사용자 교정을 바탕으로 태그 정의를 다시 쓴다.

판정기가 읽는 것은 정의 문장 하나라서, 틀린 곡들을 보고 정의를 고치면 그 기준이 모든
판정에 들어간다. 예시를 프롬프트에 붙이는 것(judge.py의 examples)과 달리 곡 이름을
정의에 넣지 않고 기준만 말로 바꾼다.
"""

from __future__ import annotations

import os

import requests

from agent import config

SYSTEM_PROMPT = (
    "You maintain the definitions of song tags for a music player. A judge model reads a "
    "definition and decides, from the title and artist only, whether a song fits the tag.\n"
    "The listener corrected the judge on some songs. Rewrite the definition as ONE English "
    "sentence of at most 40 words so the judge gets these right and similar songs too. "
    "State the criterion in words; do not name the songs. Answer with the sentence only."
)


def rewrite_condition(
    condition: str, fixes: dict, model: str | None = None
) -> str:
    """fixes = {"fits": [track], "not": [track]} — 판정기가 틀렸고 사용자가 고친 곡들."""
    model = model or os.environ.get("JUDGE_MODEL") or config.LOCAL_GENERATION_MODEL

    def lines(items: list[dict]) -> str:
        return "\n".join(f"- {t['title']} — {t['artist']}" for t in items) or "- (none)"

    question = (
        f"Current definition: {condition}\n\n"
        f"The listener says these DO fit (the judge said no):\n{lines(fixes.get('fits', []))}\n\n"
        f"The listener says these do NOT fit (the judge said yes):\n{lines(fixes.get('not', []))}"
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
            "options": {"temperature": 0.2, "num_predict": 120},
        },
        timeout=120,
    )
    response.raise_for_status()
    text = " ".join(response.json()["message"]["content"].split())
    # 비었거나 장황하면 원래 정의를 그대로 쓴다 — 엉터리 정의로 판정이 무너지는 것보다 낫다
    return text if 10 <= len(text) <= 400 else condition
