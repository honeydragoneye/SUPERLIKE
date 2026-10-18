"""에이전트 설정. 값은 모두 환경변수로 바꿀 수 있고, 없으면 아래 기본값을 쓴다.

LASTFM_API_KEY는 Superlike가 이미 쓰는 .env.local의 값을 그대로 읽어서 같은 키를 두 번
적지 않게 한다. 환경변수로 따로 주면 그쪽이 우선한다.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 로컬 Ollama. 생성(대화·판정)에 모두 이 서버를 쓴다.
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
LOCAL_GENERATION_BASE_URL = OLLAMA_BASE_URL
# ollama list에 보이는 모델 이름
LOCAL_GENERATION_MODEL = os.environ.get("AGENT_MODEL", "qwen3-8b-local")
# 낮을수록 같은 질문에 같은 답이 나온다
GENERATION_TEMPERATURE = 0.2


def _from_env_local(name: str) -> str:
    """Superlike의 .env.local에서 NAME=값 한 줄을 읽는다. 없으면 빈 문자열."""
    path = ROOT / ".env.local"
    if not path.exists():
        return ""
    for line in path.read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() == name:
            return value.strip().strip('"').strip("'")
    return ""


LASTFM_API_KEY = os.environ.get("LASTFM_API_KEY") or _from_env_local("LASTFM_API_KEY")

# 대화와 판정을 맡길 모델. GEMINI_API_KEY가 있으면 Gemini, 없으면 로컬 Ollama.
# AGENT_PROVIDER=ollama 로 키가 있어도 로컬 모델을 고를 수 있다.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or _from_env_local("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("AGENT_GEMINI_MODEL", "gemini-flash-lite-latest")
PROVIDER = os.environ.get("AGENT_PROVIDER") or ("gemini" if GEMINI_API_KEY else "ollama")
DEFAULT_MODEL = GEMINI_MODEL if PROVIDER == "gemini" else LOCAL_GENERATION_MODEL


def uses_gemini(model: str | None) -> bool:
    """모델 이름을 직접 준 실험 스크립트는 그 이름의 Ollama 모델을 쓴다."""
    return model is None and PROVIDER == "gemini"
