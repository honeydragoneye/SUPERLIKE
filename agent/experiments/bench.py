"""모델별 에이전트 비교: python -m agent.experiments.bench qwen3-8b-local qwen3:14b

같은 질문 세트를 모델마다 돌려서 속도, 도구 호출, 답변이 도구 결과에 근거했는지를 잰다.
"""

from __future__ import annotations

import re
import subprocess
import sys
import time

from agent.loop import run_agent

QUESTIONS = [
    "비 오는 날 들을 만한 잔잔한 한국 노래 추천해줘",
    "새벽에 드라이브하면서 들을 신나는 노래 알려줘",
    "요즘 우울한데 위로가 되는 인디 노래 추천해줘",
    "운동할 때 들을 비트 강한 노래 추천해줘",
    "Dagger 같은 슈게이즈 노래 추천해줘",
    "오늘 날씨 어때?",  # 음악과 무관: 도구를 부르지 않고 짧게 답해야 한다
]


def grounded(answer: str, titles: list[str]) -> tuple[int, int]:
    """답변의 번호·글머리 줄 중 도구가 준 곡 제목을 담은 것의 수 / 전체 수."""
    picks = re.findall(r"^\s*(?:\d+[.)]|[-*•])\s*(.+)$", answer, flags=re.M)
    ok = sum(any(t.lower() in p.lower() for t in titles if len(t) >= 2) for p in picks)
    return ok, len(picks)


def run(model: str) -> dict:
    rows = []
    for q in QUESTIONS:
        start = time.time()
        answer, titles, calls, bad_calls, retries, steps = "", [], 0, 0, 0, 0
        for e in run_agent([], q, model=model):
            if e["type"] == "tool_call":
                calls += 1
            elif e["type"] == "tool_result":
                r = e["result"]
                if isinstance(r, dict) and "error" in r:
                    bad_calls += 1
                if isinstance(r, dict) and isinstance(r.get("tracks"), list):
                    titles += [t["title"] for t in r["tracks"] if "title" in t]
            elif e["type"] == "retry":
                retries += 1
                answer = ""
            elif e["type"] == "token":
                answer += e["data"]
            elif e["type"] == "done":
                steps = e["steps"]
        ok, total = grounded(answer, titles)
        rows.append(
            {"q": q, "sec": time.time() - start, "calls": calls, "bad": bad_calls,
             "retries": retries, "steps": steps, "grounded": ok, "picks": total, "answer": answer}
        )
    return {"model": model, "rows": rows}


def loaded_size() -> str:
    out = subprocess.run(["ollama", "ps"], capture_output=True, text=True).stdout.strip().splitlines()
    return out[1] if len(out) > 1 else "(unloaded)"


if __name__ == "__main__":
    for model in sys.argv[1:]:
        result = run(model)
        print(f"\n=== {model} ===  메모리: {loaded_size()}")
        print(f"{'초':>6} {'도구':>4} {'오류':>4} {'재시도':>5} {'근거곡/추천곡':>12}  질문")
        for r in result["rows"]:
            print(f"{r['sec']:6.1f} {r['calls']:4d} {r['bad']:4d} {r['retries']:5d} {r['grounded']:>6}/{r['picks']:<5}  {r['q']}")
        avg = sum(r["sec"] for r in result["rows"]) / len(result["rows"])
        g = sum(r["grounded"] for r in result["rows"]); p = sum(r["picks"] for r in result["rows"])
        print(f"평균 {avg:.1f}초, 근거 있는 추천 {g}/{p}")
        for r in result["rows"][:2]:
            print(f"\n[{r['q']}]\n{r['answer'][:500]}")
        print("\n[무관 질문 답변]", result["rows"][-1]["answer"][:150].replace("\n", " "))
