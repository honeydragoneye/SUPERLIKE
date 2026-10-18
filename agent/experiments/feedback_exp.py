"""예시(사용자 피드백) 개수별 판정 정확도: python -m agent.experiments.feedback_exp

평가 세트에서 곡 몇 개를 "사용자가 알려 준 예시"로 떼어 판정 프롬프트에 넣고, 예시로 쓰지
않은 곡들의 정확도를 잰다. 예시 개수는 조건마다 맞음·아님 각각 0, 1, 2, 4개.
어떤 곡이 예시로 뽑히느냐의 운을 줄이려고 무작위 분할을 SEEDS번 평균한다.
"""

from __future__ import annotations

import json
import random
import time
from pathlib import Path

from agent import judge as J
from agent.experiments.eval_set import TRACKS, conditions

SEEDS = (1, 2, 3)
PER_CLASS = (0, 1, 2, 4)
OUT = Path(__file__).with_name("feedback_results.json")

TRACK = {t: {"title": t, "artist": a} for t, a, _k, _m in TRACKS}


def run() -> dict:
    started = time.time()
    # (조건, 예시 수) → [맞은 수, 센 수, 진짜 맞음 중 맞힌 수, 진짜 맞음 수, 맞다고 한 수]
    agg: dict[tuple[str, int], list[int]] = {}

    for name, (condition, truth) in conditions().items():
        labelled = [t for t, w in truth.items() if w is not None]
        pos = [t for t in labelled if truth[t]]
        neg = [t for t in labelled if not truth[t]]
        # 맞는 곡이 적은 조건은 예시로 다 써 버리면 평가할 정답이 남지 않는다
        cap_pos = min(max(PER_CLASS), len(pos) // 2)
        cap_neg = min(max(PER_CLASS), len(neg) // 2)

        for seed in SEEDS:
            rng = random.Random(seed)
            pool_pos = rng.sample(pos, cap_pos)
            pool_neg = rng.sample(neg, cap_neg)
            held = [t for t in labelled if t not in pool_pos and t not in pool_neg]

            for m in PER_CLASS:
                ex = {
                    "fits": [TRACK[t] for t in pool_pos[:m]],
                    "not": [TRACK[t] for t in pool_neg[:m]],
                }
                J._cache.clear()
                verdicts = J.judge(condition, [TRACK[t] for t in held], None, ex if m else None)
                row = agg.setdefault((name, m), [0, 0, 0, 0, 0])
                for t, v in zip(held, verdicts):
                    got = v is True
                    row[0] += got == truth[t]
                    row[1] += 1
                    row[3] += truth[t]
                    row[2] += truth[t] and got
                    row[4] += got
        print(f"{name} 완료 ({time.time() - started:.0f}초)", flush=True)

    return agg


def main() -> None:
    agg = run()
    names = list(conditions())
    summary: dict = {"per_class": list(PER_CLASS), "seeds": list(SEEDS), "by_condition": {}, "overall": {}}

    print("\n정확도 (예시로 쓰지 않은 곡 기준, 분할 평균)")
    print(f"{'조건':13s}" + "".join(f"{f'예시 {2 * m}개':>10s}" for m in PER_CLASS))
    for name in names:
        accs = [agg[(name, m)][0] / agg[(name, m)][1] for m in PER_CLASS]
        summary["by_condition"][name] = [round(a, 3) for a in accs]
        print(f"{name:13s}" + "".join(f"{a:>10.1%}" for a in accs))

    print(f"{'전체':13s}", end="")
    for m in PER_CLASS:
        right = sum(agg[(n, m)][0] for n in names)
        total = sum(agg[(n, m)][1] for n in names)
        summary["overall"][m] = round(right / total, 3)
        print(f"{right / total:>10.1%}", end="")
    print()

    print("\n재현율 / 정밀도 (전체 합산)")
    for m in PER_CLASS:
        tp = sum(agg[(n, m)][2] for n in names)
        pos = sum(agg[(n, m)][3] for n in names)
        said = sum(agg[(n, m)][4] for n in names)
        print(f"  예시 {2 * m}개  재현율 {tp / pos:.0%}  정밀도 {tp / said:.0%}" if said else f"  예시 {2 * m}개")
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
