# 음악 에이전트

Gemini(키가 없으면 로컬 Ollama의 Qwen)로 음악 대화를 하고, 도구를 불러 실제 곡을 찾아 추천하는 Python 에이전트입니다.
Superlike(Next.js)와는 별도 프로세스로 돌고, 이후 SSE 엔드포인트로 연결합니다.

## 준비

- `.env.local`에 `GEMINI_API_KEY`가 있으면 Gemini(`AGENT_GEMINI_MODEL`, 기본 `gemini-flash-lite-latest`)를 씁니다. 없거나 `AGENT_PROVIDER=ollama`이면 [Ollama](https://ollama.com)가 켜져 있고 `ollama list`에 `qwen3-8b-local`(없으면 `AGENT_MODEL`로 지정)이 있어야 합니다.
- `LASTFM_API_KEY`는 레포 루트의 `.env.local` 값을 그대로 읽습니다 (환경변수로 주면 그쪽이 우선).

```bash
python3 -m venv agent/.venv
agent/.venv/bin/pip install -r agent/requirements.txt
agent/.venv/bin/python -m agent        # 터미널에서 대화 (빈 줄이면 종료)
```

## 구조

| 파일 | 역할 |
| --- | --- |
| `loop.py` | 도구를 부르는 에이전트 루프. 이벤트(`tool_call`, `tool_result`, `token`, `done`)를 하나씩 내보냅니다. |
| `tools.py` | 도구. `top_tracks`(Last.fm 태그의 실제 곡을 모으고 조건에 맞는 곡만 남김), `find_track`(곡 존재 확인), `artist_info`·`track_info`·`artist_top_tracks`(가수·곡 질문에 Last.fm 정보로 답함), `wiki_summary`(Wikipedia 소개), `albums`(MusicBrainz 앨범 목록) |
| `SOURCES` (tools.py) | 출처(lastfm·wikipedia·musicbrainz)와 도구의 묶음. 챗봇 위쪽의 출처 버튼으로 켠 것만 모델에게 보입니다 |
| `judge.py` | "제목과 가수만 보고 이 조건에 맞는가"를 판정하는 별도 모델 호출 |
| `gemini.py` | Gemini 호출(도구 호출 대화, JSON 판정). Ollama와 같은 조각 모양으로 바꿔 내보냅니다 |
| `config.py` | 모델 선택(Gemini/Ollama), 온도, Last.fm·Gemini 키 |
| `experiments/` | 판정 정확도·속도를 재는 스크립트와 40곡 평가 세트. 제품 코드가 아닙니다. |

모델이 곡을 기억에서 떠올리면 지어내므로, 곡은 항상 도구가 실제 목록에서 주고 모델은 그중에서 고릅니다.

## 실험 스크립트

```bash
agent/.venv/bin/python -m agent.experiments.judge_eval --label 이름   # 판정기 정확도 (40곡 × 조건 5개)
agent/.venv/bin/python -m agent.experiments.bench qwen3-8b-local     # 질문 6개로 에이전트 전체 속도·근거
```

결과는 `agent/experiments/*_results.json`에 쌓이며 git에는 올리지 않습니다.
