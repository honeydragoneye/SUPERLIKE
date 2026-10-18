"""교정 기반 개선 실험: python -m agent.experiments.correction_exp

곡의 절반을 "사용자가 본 곡"(train)으로 둔다. 판정기가 train에서 틀린 곡을 사용자가 고친 것으로
보고, 그 교정을 반영한 판정기가 보지 못한 곡(held)을 얼마나 맞히는지 재다.

A 교정 없음 · B 교정을 예시로 · C 교정으로 정의 다시 쓰기 · D 둘 다
"""

from __future__ import annotations

import json
import random
import time
from pathlib import Path

from agent import judge as J
from agent.experiments.eval_set import TRACKS, conditions
from agent.experiments.refine import rewrite_condition

SEEDS = (1, 2, 3, 4)
VARIANTS = ("A", "B", "C", "D")
OUT = Path(__file__).with_name("correction_results.json")
TRACK = {t: {"title": t, "artist": a} for t, a, _k, _m in TRACKS}


def judge_all(condition: str, titles: list[str], examples: dict | None) -> list[bool]:
    J._cache.clear()
    return [v is True for v in J.judge(condition, [TRACK[t] for t in titles], None, examples)]


def main() -> None:
    started = time.time()
    right = {v: 0 for v in VARIANTS}
    count = {v: 0 for v in VARIANTS}
    per: dict[str, dict[str, list[int]]] = {}
    fixes_total = cases = no_error_cases = 0
    rewrites: list[tuple[str, str, str]] = []

    for name, (condition, truth) in conditions().items():
        labelled = [t for t, w in truth.items() if w is not None]
        per[name] = {v: [0, 0] for v in VARIANTS}

        for seed in SEEDS:
            rng = random.Random(seed)
            shuffled = labelled[:]
            rng.shuffle(shuffled)
            half = len(shuffled) // 2
            train, held = shuffled[:half], shuffled[half:]

            # 사용자가 본 곡에서 판정기가 틀린 것만 고친다
            got = judge_all(condition, train, None)
            fixes = {"fits": [], "not": []}
            for t, g in zip(train, got):
                if g != truth[t]:
                    fixes["fits" if truth[t] else "not"].append(TRACK[t])
            n_fix = len(fixes["fits"]) + len(fixes["not"])
            cases += 1
            fixes_total += n_fix
            no_error_cases += n_fix == 0

            new_condition = rewrite_condition(condition, fixes) if n_fix else condition
            if n_fix and seed == SEEDS[0]:
                rewrites.append((name, condition, new_condition))

            runs = {
                "A": judge_all(condition, held, None),
                "B": judge_all(condition, held, fixes if n_fix else None),
                "C": judge_all(new_condition, held, None),
                "D": judge_all(new_condition, held, fixes if n_fix else None),
            }
            for v, verdicts in runs.items():
                ok = sum(g == truth[t] for t, g in zip(held, verdicts))
                right[v] += ok
                count[v] += len(held)
                per[name][v][0] += ok
                per[name][v][1] += len(held)
        print(f"{name} 완료 ({time.time() - started:.0f}초)", flush=True)

    print(f"\n교정 {fixes_total}건 / {cases}회 (평균 {fixes_total / cases:.1f}건, 교정이 없던 경우 {no_error_cases}회)")
    print("\n보지 못한 곡의 정확도")
    print(f"{'조건':13s}" + "".join(f"{v:>9s}" for v in VARIANTS))
    summary: dict = {"fixes": fixes_total, "cases": cases, "by_condition": {}, "overall": {}}
    for name in per:
        row = {v: per[name][v][0] / per[name][v][1] for v in VARIANTS}
        summary["by_condition"][name] = {v: round(a, 3) for v, a in row.items()}
        print(f"{name:13s}" + "".join(f"{row[v]:>9.1%}" for v in VARIANTS))
    print(f"{'전체':13s}" + "".join(f"{right[v] / count[v]:>9.1%}" for v in VARIANTS))
    summary["overall"] = {v: round(right[v] / count[v], 3) for v in VARIANTS}

    print("\n다시 쓴 정의 (첫 분할)")
    for name, old, new in rewrites:
        print(f"[{name}]\n  전: {old}\n  후: {new}")
    summary["rewrites"] = rewrites
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
