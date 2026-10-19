"""에이전트를 HTTP로 노출한다. Superlike(Next.js)의 /api/agent가 이 서버를 부른다.

    python -m agent.server          (또는 npm run agent)

표준 라이브러리만 쓰고, 이 컴퓨터 안에서만 열린다 (127.0.0.1). 인증이 없으므로 밖으로 열지 않는다.

POST /chat  {"question": str, "history": [{"role": "user"|"assistant", "content": str}, ...],
             "refine": {"label": str, "definition": str}}   ← 선택. 있으면 그 태그의 기준을 정하는 대화
  → text/event-stream. 줄마다 `data: {이벤트 JSON}` — loop.run_agent의 이벤트에
    {"type": "error", "code", "message"}가 더해진다.
GET /health → {"status": "ok", "model": ...}
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests

from agent import config
from agent.gemini import GeminiError
from agent.loop import run_agent
from agent.tools import SOURCES

HOST = os.environ.get("AGENT_HOST", "127.0.0.1")
PORT = int(os.environ.get("AGENT_PORT", "8765"))

MAX_QUESTION = 2000
MAX_HISTORY = 10          # 모델에게 보여 줄 이전 메시지 수 (사용자+어시스턴트 합산)
MAX_CONTENT = 4000


def _clean_history(raw: object) -> list[dict]:
    """밖에서 온 대화 기록을 모델에게 넘겨도 되는 모양으로만 남긴다."""
    if not isinstance(raw, list):
        return []
    out = []
    for m in raw[-MAX_HISTORY:]:
        if not isinstance(m, dict):
            continue
        role, content = m.get("role"), m.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            out.append({"role": role, "content": content[:MAX_CONTENT]})
    return out


def _clean_refine(raw: object) -> dict | None:
    """태그 이름과 지금 정의. 모델의 지시문에 들어가므로 길이를 자르고 한 줄로 만든다."""
    if not isinstance(raw, dict):
        return None
    label, definition = raw.get("label"), raw.get("definition")
    if not isinstance(label, str) or not isinstance(definition, str):
        return None
    label, definition = " ".join(label.split())[:24], " ".join(definition.split())[:200]
    return {"label": label, "definition": definition} if label and definition else None


def _clean_sources(raw: object) -> list[str] | None:
    """사용자가 켠 출처. 모르는 이름은 버린다. 목록이 아니면 None(전부 켬), 빈 목록은 전부 끔."""
    if not isinstance(raw, list):
        return None
    return [x for x in dict.fromkeys(raw) if isinstance(x, str) and x in SOURCES]


MAX_TASTE = 30


def _clean_taste(raw: object) -> list[dict] | None:
    """좋아요한 곡 목록. 모델의 지시문에 들어가므로 개수와 길이를 자르고 한 줄로 만든다."""
    if not isinstance(raw, list):
        return None
    out = []
    for t in raw[:MAX_TASTE]:
        if isinstance(t, dict) and isinstance(t.get("title"), str) and isinstance(t.get("artist"), str):
            title, artist = " ".join(t["title"].split())[:80], " ".join(t["artist"].split())[:80]
            if title and artist:
                out.append({"title": title, "artist": artist})
    return out or None


class Handler(BaseHTTPRequestHandler):
    server_version = "SuperlikeAgent"

    def log_message(self, fmt: str, *args) -> None:  # 요청마다 한 줄
        print(f"[agent] {self.address_string()} {fmt % args}", flush=True)

    def _json(self, status: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"status": "ok", "model": config.DEFAULT_MODEL, "provider": config.PROVIDER})
        else:
            self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/chat":
            return self._json(404, {"error": "not_found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "bad_request"})

        question = body.get("question")
        if not isinstance(question, str) or not question.strip():
            return self._json(400, {"error": "missing_question"})
        question = question.strip()[:MAX_QUESTION]
        history = _clean_history(body.get("history"))
        refine = _clean_refine(body.get("refine"))
        sources = _clean_sources(body.get("sources"))
        taste = _clean_taste(body.get("taste"))

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self.end_headers()

        def send(event: dict) -> None:
            self.wfile.write(b"data: " + json.dumps(event, ensure_ascii=False).encode() + b"\n\n")
            self.wfile.flush()

        try:
            for event in run_agent(history, question, cards=True, refine=refine, sources=sources, taste=taste):
                send(event)
        except (BrokenPipeError, ConnectionResetError):
            pass  # 브라우저가 창을 닫거나 대화를 끊었다
        except requests.exceptions.ConnectionError:
            self._try_send_error(
                "llm_offline",
                "Gemini에 연결할 수 없습니다. 네트워크를 확인해 주세요."
                if config.PROVIDER == "gemini"
                else "로컬 모델(Ollama)에 연결할 수 없습니다. Ollama를 켜 주세요.",
            )
        except GeminiError as e:
            print(f"[agent] gemini: {e}", flush=True)
            if e.status == 429:
                self._try_send_error("rate_limited", "Gemini 사용 한도를 넘었어요. 잠시 뒤에 다시 시도해 주세요.")
            else:
                self._try_send_error("agent_error", "Gemini가 응답하지 못했습니다.")
        except Exception as e:  # 에이전트 안의 예기치 못한 오류도 화면에 이유가 보이게 한다
            print(f"[agent] error: {e!r}", flush=True)
            self._try_send_error("agent_error", "에이전트가 응답하지 못했습니다.")

    def _try_send_error(self, code: str, message: str) -> None:
        try:
            self.wfile.write(
                b"data: " + json.dumps({"type": "error", "code": code, "message": message}, ensure_ascii=False).encode() + b"\n\n"
            )
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[agent] http://{HOST}:{PORT}  model={config.DEFAULT_MODEL} ({config.PROVIDER})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
