"""개인 태그 실험: python -m agent.experiments.personal_tag_exp [--definitions]

--definitions: 예시 대신 기준을 말로 준 경우만 빠르게 비교한다 (약 20초).

사용자가 만든 태그는 이름만으로는 기준을 알 수 없다 ("퇴근길에 듣는 곡"이 어떤 곡인지는 만든 사람만
안다). 이런 태그에서는 모델이 이미 아는 일반 개념(우울, 경쾌)과 달리 예시가 유일한 정보다.
그래서 예시(사용자가 "이건 맞아/아니야"라고 알려 준 곡)를 0~8개 넣어 가며 판정이 좋아지는지 잰다.

태그 셋은 숨은 기준이 다르다.
  A 내 최애 가수 곡     특정 가수 4명의 곡 → 예시에서 가수를 알아내야 한다
  B 퇴근길에 듣는 곡    해외곡 중 슬픈 곡 → 이름과 기준이 무관하다
  C 플레이리스트 3번    무작위 10곡 → 대조군. 규칙이 없으니 예시가 일반화에 도움이 되면 안 된다

판정기에게는 태그 이름만 준다 (설명을 쓰지 않은 사용자 태그와 같다). 맞는 곡이 적어서 "전부 아니라고
해도" 정확도가 높게 나오므로, 재현율·정밀도·F1을 함께 본다.
"""

from __future__ import annotations

import json
import random
import time
from pathlib import Path

from agent import judge as J
from agent.experiments.eval_set import TRACKS

SEEDS = (1, 2, 3, 4, 5)
PER_CLASS = (0, 1, 2, 4)            # 맞음·아님 각각의 예시 수 (전체 0, 2, 4, 8개)
OUT = Path(__file__).with_name("personal_results.json")

TRACK = {t: {"title": t, "artist": a} for t, a, _k, _m in TRACKS}
FAVOURITES = {"BTS", "Radiohead", "IU", "Bon Iver"}


def tags() -> dict[str, tuple[str, set[str]]]:
    """태그 이름 → (판정기에게 주는 이름, 맞는 곡 제목들)."""
    a = {t for t, art, _k, _m in TRACKS if art in FAVOURITES}
    b = {t for t, _art, k, m in TRACKS if not k and m == "sad"}
    c = set(random.Random(7).sample([t for t, *_ in TRACKS], 10))
    return {
        "A": ("내 최애 가수 곡", a),
        "B": ("퇴근길에 듣는 곡", b),
        "C": ("플레이리스트 3번", c),
    }


def metrics(tp: int, fp: int, fn: int, tn: int) -> dict:
    rec = tp / (tp + fn) if tp + fn else 0.0
    prec = tp / (tp + fp) if tp + fp else 0.0
    spec = tn / (tn + fp) if tn + fp else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    return {
        "accuracy": (tp + tn) / (tp + fp + fn + tn),
        "balanced": (rec + spec) / 2,
        "recall": rec, "precision": prec, "f1": f1,
    }


# 숨은 기준을 만든 사람이 말로 풀어 쓴다면: 대화로 기준을 물어서 정의를 만드는 경우의 위쪽 한계
STATED = {
    "A": "내 최애 가수 곡 — songs by BTS, Radiohead, IU or Bon Iver",
    "B": "퇴근길에 듣는 곡 — a sad song that is not Korean",
}


def stated_definitions() -> None:
    """예시 없이, 이름만 줄 때와 기준을 말로 줄 때를 40곡 전체에서 비교한다 (A, B만. C는 규칙이 없다)."""
    titles = [t for t, *_ in TRACKS]
    print(f"{'태그':4s}{'정의':14s}{'F1':>6s}{'재현율':>8s}{'정밀도':>8s}{'균형정확도':>10s}   (40곡 전체, 예시 없음)")
    for key, (label, positives) in tags().items():
        if key not in STATED:
            continue
        for name, definition in (("이름만", label), ("기준을 말로", STATED[key])):
            J._cache.clear()
            verdicts = J.judge(definition, [TRACK[t] for t in titles])
            tp = fp = fn = tn = 0
            for t, v in zip(titles, verdicts):
                got, want = v is True, t in positives
                tp += got and want; fp += got and not want
                fn += (not got) and want; tn += (not got) and not want
            r = metrics(tp, fp, fn, tn)
            print(f"{key:4s}{name:14s}{r['f1']:6.2f}{r['recall']:8.2f}{r['precision']:8.2f}{r['balanced']:10.2f}")


def main() -> None:
    started = time.time()
    all_titles = [t for t, *_ in TRACKS]
    # (tag, m) → [tp, fp, fn, tn];  (tag, m, seed) → f1 for the spread
    agg: dict[tuple[str, int], list[int]] = {}
    per_seed: dict[tuple[str, int], list[float]] = {}
    sizes: dict[str, tuple[int, int]] = {}

    for key, (label, positives) in tags().items():
        pos = [t for t in all_titles if t in positives]
        neg = [t for t in all_titles if t not in positives]
        cap = min(max(PER_CLASS), len(pos) // 2, len(neg) // 2)
        for seed in SEEDS:
            rng = random.Random(seed)
            pool_pos, pool_neg = rng.sample(pos, cap), rng.sample(neg, cap)
            held = [t for t in all_titles if t not in pool_pos and t not in pool_neg]
            sizes[key] = (sum(t in positives for t in held), sum(t not in positives for t in held))
            for m in PER_CLASS:
                ex = {"fits": [TRACK[t] for t in pool_pos[:m]], "not": [TRACK[t] for t in pool_neg[:m]]} if m else None
                J._cache.clear()
                verdicts = J.judge(label, [TRACK[t] for t in held], None, ex)
                tp = fp = fn = tn = 0
                for t, v in zip(held, verdicts):
                    got, want = v is True, t in positives
                    tp += got and want; fp += got and not want
                    fn += (not got) and want; tn += (not got) and not want
                row = agg.setdefault((key, m), [0, 0, 0, 0])
                for i, x in enumerate((tp, fp, fn, tn)):
                    row[i] += x
                per_seed.setdefault((key, m), []).append(metrics(tp, fp, fn, tn)["f1"])
        print(f"태그 {key} 완료 ({time.time() - started:.0f}초)", flush=True)

    summary: dict = {"per_class": list(PER_CLASS), "seeds": list(SEEDS), "held_out": sizes, "tags": {}, "overall": {}}
    print("\n보지 않은 곡 기준 (분할 5번 합산). 숫자: F1 / 재현율 / 정밀도")
    print(f"{'태그':6s}" + "".join(f"{f'예시 {2 * m}개':>24s}" for m in PER_CLASS) + "   (정답 수/전체)")
    for key in tags():
        cells, rows = [], []
        for m in PER_CLASS:
            r = metrics(*agg[(key, m)])
            rows.append({k: round(v, 3) for k, v in r.items()})
            cells.append(f"{r['f1']:.2f}/{r['recall']:.2f}/{r['precision']:.2f}".rjust(24))
        summary["tags"][key] = rows
        p, n = sizes[key]
        print(f"{key:6s}" + "".join(cells) + f"   ({p}/{p + n})")

    print("\n균형 정확도 (재현율과 특이도의 평균. 0.5가 찍기)")
    for key in tags():
        print(f"{key:6s}" + "".join(f"{summary['tags'][key][i]['balanced']:>24.2f}" for i in range(len(PER_CLASS))))

    print("\n분할마다 F1이 얼마나 흔들렸나 (표준편차)")
    for key in tags():
        cells = []
        for m in PER_CLASS:
            xs = per_seed[(key, m)]
            mean = sum(xs) / len(xs)
            sd = (sum((x - mean) ** 2 for x in xs) / len(xs)) ** 0.5
            cells.append(f"±{sd:.2f}".rjust(24))
        print(f"{key:6s}" + "".join(cells))

    # A와 B만 합쳐서 (규칙이 있는 태그)
    for m in PER_CLASS:
        tot = [sum(agg[(k, m)][i] for k in ("A", "B")) for i in range(4)]
        summary["overall"][m] = {k: round(v, 3) for k, v in metrics(*tot).items()}
    print("\n규칙이 있는 태그(A+B) 합산 F1:", "  ".join(f"{2 * m}개 {summary['overall'][m]['f1']:.2f}" for m in PER_CLASS))
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\n총 {time.time() - started:.0f}초")


if __name__ == "__main__":
    import sys

    stated_definitions() if "--definitions" in sys.argv else main()
