"""판정기 정확도: python -m agent.experiments.judge_eval [--label 이름] [--model 모델]

eval_set.py의 40곡을 조건 5개로 판정시켜 맞은 비율, 놓친 곡(재현율), 잘못 넣은 곡(정밀도)을
낸다. 결과는 eval_results.json에 라벨과 함께 쌓아서 수정 전후를 비교할 수 있다.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from agent import judge as judge_module
from agent.experiments.eval_set import TRACKS, conditions

RESULTS = Path(__file__).with_name("eval_results.json")


def pct(x: float | None) -> str:
    return "-" if x is None else f"{x:.0%}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="unlabeled")
    ap.add_argument("--model", default=None)
    args = ap.parse_args()

    tracks = [{"title": t, "artist": a} for t, a, _k, _m in TRACKS]
    per: dict[str, dict] = {}
    total_right = total = 0
    started = time.time()

    for name, (condition, truth) in conditions().items():
        t0 = time.time()
        # 같은 조건을 다시 묻는 캐시가 측정을 가리지 않도록 매번 비운다
        judge_module._cache.clear()
        verdicts = judge_module.judge(condition, tracks, args.model)
        tp = fp = fn = tn = 0
        wrong: list[str] = []
        for track, v in zip(tracks, verdicts):
            want = truth[track["title"]]
            if want is None:
                continue
            got = v is True
            if want and got:
                tp += 1
            elif want and not got:
                fn += 1
                wrong.append(f"{track['title']}(놓침)")
            elif not want and got:
                fp += 1
                wrong.append(f"{track['title']}(오판)")
            else:
                tn += 1
        n = tp + fp + fn + tn
        total_right += tp + tn
        total += n
        per[name] = {
            "accuracy": round((tp + tn) / n, 3),
            "recall": round(tp / (tp + fn), 3) if tp + fn else None,
            "precision": round(tp / (tp + fp), 3) if tp + fp else None,
            "sec": round(time.time() - t0, 1),
            "wrong": wrong,
        }
        p = per[name]
        print(
            f"{name:13s} 정확도 {p['accuracy']:.0%}  재현율 {pct(p['recall'])}  "
            f"정밀도 {pct(p['precision'])}  {p['sec']}초  틀린 곡: {', '.join(wrong) or '없음'}"
        )

    summary = {
        "label": args.label,
        "model": args.model or "default",
        "accuracy": round(total_right / total, 3),
        "total_sec": round(time.time() - started, 1),
        "per_condition": per,
    }
    print(f"\n전체 {total_right}/{total} = {summary['accuracy']:.1%}  ({summary['total_sec']}초)")

    history = json.loads(RESULTS.read_text()) if RESULTS.exists() else []
    history.append(summary)
    RESULTS.write_text(json.dumps(history, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
