"""에이전트를 HTTP로 노출한다. Superlike(Next.js)의 /api/agent가 이 서버를 부른다.

    python -m agent.server          (또는 npm run agent)

표준 라이브러리만 쓰고, 기본은 이 컴퓨터 안에서만 열린다 (127.0.0.1). 밖으로 열 때(AGENT_HOST=0.0.0.0)는
AGENT_TOKEN을 꼭 정하고, 사이트(Vercel)에도 같은 값을 넣는다. 포트는 AGENT_PORT 또는 PORT.

POST /chat  {"question": str, "history": [{"role": "user"|"assistant", "content": str}, ...],
             "refine": {"label": str, "definition": str},   ← 선택. 있으면 그 태그의 기준을 정하는 대화
             "nowPlaying", "station", "canAct"}              ← 선택. 화면이 대신 알려 주는 지금 듣는 곡·스테이션, 동작 가능 여부
             "likes", "recent"}                              ← 선택. 사용자가 공유를 켰을 때만 오는 좋아요한 곡·최근 재생
  → text/event-stream. 줄마다 `data: {이벤트 JSON}` — loop.run_agent의 이벤트에
    {"type": "error", "code", "message"}가 더해진다.
GET /health → {"status": "ok", "model": ...}
"""

from __future__ import annotations

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests

from agent import config
from agent.gemini import GeminiError
from agent.loop import run_agent
from agent.tools import SOURCES

HOST = os.environ.get("AGENT_HOST", "127.0.0.1")
# 호스팅 서비스(Render 등)는 포트를 PORT로 알려 준다
PORT = int(os.environ.get("AGENT_PORT") or os.environ.get("PORT") or "8765")
# 인터넷에 열 때만 정한다: 있으면 /chat은 "Authorization: Bearer <값>"을 보낸 호출만 받는다 (없으면 인증 없음 — 내 컴퓨터 안에서만 쓸 때)
TOKEN = os.environ.get("AGENT_TOKEN", "")

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


def _clean_memory(raw: object) -> dict | None:
    """사용자에 대한 기억의 요약. 모델의 지시문에 들어가므로 길이를 자른다."""
    if not isinstance(raw, dict):
        return None
    text, count = raw.get("text"), raw.get("count")
    if not isinstance(text, str) or not text.strip():
        return None
    return {"text": text.strip()[:1500], "count": count if isinstance(count, int) and 0 < count < 100 else 1}


def _clean_avoid(raw: object) -> list[str]:
    """이미 보여 줬거나 반응이 있는 곡의 키("제목|가수", 소문자). 다시 추천하지 않는다."""
    if not isinstance(raw, list):
        return []
    return [k.strip()[:300].lower() for k in raw[:150] if isinstance(k, str) and k.strip()]


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


def _clean_now(raw: object) -> dict | None:
    """화면이 보낸 지금 듣는 곡. 없으면 None(기능을 끈 것), 재생 중이 아니면 {"playing": False}."""
    if not isinstance(raw, dict):
        return None
    if raw.get("playing") is not True:
        return {"playing": False}
    fields = {k: " ".join(str(raw.get(k, "")).split())[:120] for k in ("title", "artist", "album")}
    return {"playing": bool(fields["title"]), **fields}


MAX_STATION = 30


def _clean_station(raw: object) -> dict | None:
    """화면이 보낸 스테이션. 없으면 None. 모델에게 도구로 보이므로 개수와 길이를 자르고 한 줄로 만든다."""
    if not isinstance(raw, dict):
        return None

    def line(v: object) -> str:
        return " ".join(str(v or "").split())[:120]

    tracks = []
    for i, t in enumerate(raw.get("tracks") or []):
        if len(tracks) >= MAX_STATION:
            break
        if isinstance(t, dict) and line(t.get("title")):
            position = t.get("position") if t.get("position") in ("playing", "next") else "next"
            tracks.append({"title": line(t.get("title")), "artist": line(t.get("artist")), "position": position})
    seed = raw.get("seed")
    seed = {"title": line(seed.get("title")), "artist": line(seed.get("artist"))} if isinstance(seed, dict) and line(seed.get("title")) else None
    return {"active": raw.get("active") is True and bool(tracks), "seed": seed, "tracks": tracks}


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


def _clean_stats(raw: object) -> dict | None:
    """서버가 계정 기록으로 센 최근 취향 요약. 없으면 None. 모델이 도구로 읽으니 개수와 길이를 자른다."""
    if not isinstance(raw, dict):
        return None

    def rows(v: object, keys: tuple[str, ...]) -> list[dict]:
        out = []
        for r in (v if isinstance(v, list) else [])[:8]:
            if not isinstance(r, dict):
                continue
            row = {k: " ".join(str(r.get(k) or "").split())[:80] for k in keys if k != "plays"}
            if "plays" in keys:
                row["plays"] = int(r["plays"]) if isinstance(r.get("plays"), (int, float)) else 0
            if row.get(keys[0]):
                out.append(row)
        return out

    artists = rows(raw.get("artists"), ("name", "plays"))
    if not artists:
        return None
    total = raw.get("totalPlays")
    days = raw.get("days")
    return {
        "artists": artists,
        "tracks": rows(raw.get("tracks"), ("title", "artist")),
        "totalPlays": int(total) if isinstance(total, (int, float)) else 0,
        "days": int(days) if isinstance(days, (int, float)) else 28,
    }


MAX_LISTED = 30


def _clean_listed(raw: object, with_time: bool = False) -> list[dict] | None:
    """화면이 보낸 곡 목록(좋아요·최근 재생). 없으면 None(공유를 끈 것), 빈 목록은 켰지만 기록이 없는 것.
    모델에게 도구로 보이므로 개수와 길이를 자르고 한 줄로 만든다."""
    if not isinstance(raw, list):
        return None
    out = []
    for t in raw[:MAX_LISTED]:
        if not isinstance(t, dict):
            continue
        title, artist = " ".join(str(t.get("title") or "").split())[:80], " ".join(str(t.get("artist") or "").split())[:80]
        if not title:
            continue
        row = {"title": title, "artist": artist}
        if with_time:
            played = str(t.get("playedAt") or "")[:32]
            if played:
                row["playedAt"] = played
        out.append(row)
    return out


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

    def _authorized(self) -> bool:
        if not TOKEN:
            return True
        sent = self.headers.get("Authorization", "")
        return hmac.compare_digest(sent.encode(), f"Bearer {TOKEN}".encode())

    def do_POST(self) -> None:
        if self.path != "/chat":
            return self._json(404, {"error": "not_found"})
        if not self._authorized():
            return self._json(401, {"error": "unauthorized"})
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
        now_playing = _clean_now(body.get("nowPlaying"))
        station = _clean_station(body.get("station"))
        can_act = body.get("canAct") is True
        likes = _clean_listed(body.get("likes"))
        recent = _clean_listed(body.get("recent"), with_time=True)
        stats = _clean_stats(body.get("stats"))
        memory = _clean_memory(body.get("memory"))
        avoid = _clean_avoid(body.get("avoid"))

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self.end_headers()

        def send(event: dict) -> None:
            self.wfile.write(b"data: " + json.dumps(event, ensure_ascii=False).encode() + b"\n\n")
            self.wfile.flush()

        try:
            for event in run_agent(history, question, cards=True, refine=refine, sources=sources, taste=taste, now_playing=now_playing, station=station, can_act=can_act, likes=likes, recent=recent, memory=memory, avoid=avoid, stats=stats):
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
            if e.status == 429 and e.daily:
                # 기다려서 풀리는 한도가 아니다. 구글의 하루는 태평양 시간 자정에 바뀐다(한국 시간 오후 4~5시쯤)
                self._try_send_error(
                    "rate_limited", "Gemini 하루 사용 한도를 다 썼어요. 한국 시간 오후 4~5시쯤 새로 시작돼요."
                )
            elif e.status == 429:
                wait = f" {round(e.retry_after)}초쯤 뒤에" if e.retry_after else " 잠시 뒤에"
                self._try_send_error("rate_limited", f"요청이 몰려서 지금은 답하지 못해요.{wait} 다시 시도해 주세요.")
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
