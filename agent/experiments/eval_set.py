"""판정기 평가 세트: 손으로 라벨링한 40곡.

정답은 만든 사람의 판단이라 틀릴 수 있다. 사람마다 갈릴 곡은 해당 조건에서 None으로 두고
채점하지 않는다. 라벨을 고치고 싶으면 이 파일만 고치면 된다.

곡마다: (제목, 가수, 한국곡 여부, 분위기)
분위기: sad · upbeat · rhythmic · upbeat+rhythmic(둘 다 해당) · calm
"""

from __future__ import annotations

TRACKS: list[tuple[str, str, bool, str]] = [
    # 한국 곡 (14)
    ("스토커", "10CM", True, "sad"),
    ("곰인형", "린", True, "sad"),
    ("비도 오고 그래서", "헤이즈", True, "sad"),
    ("눈의 꽃", "박효신", True, "sad"),
    ("거리에서", "성시경", True, "sad"),
    ("봄날", "BTS", True, "sad"),
    ("밤편지", "IU", True, "calm"),
    ("좋은 날", "IU", True, "upbeat"),
    ("Hype Boy", "NewJeans", True, "upbeat+rhythmic"),
    ("Super Shy", "NewJeans", True, "upbeat+rhythmic"),
    ("Dynamite", "BTS", True, "upbeat+rhythmic"),
    ("Butter", "BTS", True, "upbeat+rhythmic"),
    ("Gangnam Style", "PSY", True, "upbeat+rhythmic"),
    ("Vancouver", "BIG Naughty", True, "upbeat"),
    # 그 밖의 곡 (26)
    ("Fake Plastic Trees", "Radiohead", False, "sad"),
    ("WILDFLOWER", "Billie Eilish", False, "sad"),
    ("Someone Like You", "Adele", False, "sad"),
    ("Hurt", "Johnny Cash", False, "sad"),
    ("Mad World", "Gary Jules", False, "sad"),
    ("The Night We Met", "Lord Huron", False, "sad"),
    ("Skinny Love", "Bon Iver", False, "sad"),
    ("Creep", "Radiohead", False, "sad"),
    ("Nothing Compares 2 U", "Sinéad O'Connor", False, "sad"),
    ("Happy", "Pharrell Williams", False, "upbeat"),
    ("Cruel Summer", "Taylor Swift", False, "upbeat"),
    ("Walking on Sunshine", "Katrina and the Waves", False, "upbeat"),
    ("Good as Hell", "Lizzo", False, "upbeat"),
    ("Can't Stop the Feeling!", "Justin Timberlake", False, "upbeat"),
    ("Uptown Funk", "Mark Ronson", False, "upbeat+rhythmic"),
    ("Blinding Lights", "The Weeknd", False, "upbeat+rhythmic"),
    ("September", "Earth, Wind & Fire", False, "upbeat+rhythmic"),
    ("Rush", "Troye Sivan", False, "rhythmic"),
    ("Victory Lap", "Fred again..", False, "rhythmic"),
    ("UNDERWATER BOI", "Turnstile", False, "rhythmic"),
    ("Billie Jean", "Michael Jackson", False, "rhythmic"),
    ("Get Lucky", "Daft Punk", False, "rhythmic"),
    ("Holocene", "Bon Iver", False, "calm"),
    ("Rainy Days and Mondays", "Carpenters", False, "calm"),
    ("Gymnopédie No.1", "Erik Satie", False, "calm"),
    ("Riders on the Storm", "The Doors", False, "calm"),
]

# "한국 곡이고 잔잔하며 비 오는 날에 어울리는가" — 정답이 분명한 곡만 1, 사람마다 갈리는 곡은 None
RAINY_KOREAN_CALM: dict[str, bool | None] = {
    "비도 오고 그래서": True,
    "눈의 꽃": True,
    "거리에서": True,
    "밤편지": True,
    "스토커": None,
    "곰인형": None,
    "봄날": None,
}

DEF_SAD = (
    "sad or gloomy — heartbreak, parting, longing or loss carried openly, or a sunk, dark, "
    "heavy and inward mood; often slow or a ballad"
)
DEF_UPBEAT = "bright, light and feel-good; easy and pleasant"
DEF_RHYTHMIC = "driven by beat and groove; energy that moves the body"
DEF_KOREAN = "a Korean song (by a Korean artist, or sung in Korean)"
DEF_RAINY = "a calm, gentle Korean song that suits a rainy day"


def _mood_truth(mood: str, want: str) -> bool | None:
    """분위기 라벨 → 조건 하나에 대한 정답. 겹치는 분위기는 채점하지 않는다."""
    has = want in mood.split("+")
    if has:
        return True
    if mood == "calm":
        # 잔잔한 곡이 슬픈 곡인지는 사람마다 갈린다
        return None if want == "sad" else False
    if want in ("upbeat", "rhythmic") and mood in ("upbeat", "rhythmic"):
        return None  # 밝은 곡이 리듬감 있는 곡일 수 있고 그 반대도 그렇다
    return False


def conditions() -> dict[str, tuple[str, dict[str, bool | None]]]:
    """조건 이름 → (판정기에 줄 문장, {곡 제목: 정답})."""
    out: dict[str, tuple[str, dict[str, bool | None]]] = {}
    for name, definition, want in (
        ("sad", DEF_SAD, "sad"),
        ("upbeat", DEF_UPBEAT, "upbeat"),
        ("rhythmic", DEF_RHYTHMIC, "rhythmic"),
    ):
        out[name] = (definition, {t: _mood_truth(m, want) for t, _a, _k, m in TRACKS})
    out["korean"] = (DEF_KOREAN, {t: k for t, _a, k, _m in TRACKS})
    out["rainy_korean"] = (
        DEF_RAINY,
        {t: RAINY_KOREAN_CALM.get(t, False) for t, _a, _k, _m in TRACKS},
    )
    return out
