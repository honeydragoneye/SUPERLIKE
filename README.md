# Superlike

Spotify 계정으로 음악을 듣는 서드파티 웹 플레이어입니다. 한 곡을 고르면 비슷한 곡으로
이어지는 **스테이션**을 만들고, 태그로 다음 곡 목록을 걸러 들을 수 있습니다.

## 주요 기능

- **재생**: 브라우저에서 바로 재생 (Spotify Premium 계정 필요)
- **스테이션**: 곡 하나를 기준으로 비슷한 곡 대기열을 자동 구성
- **태그 필터**: 가사 없음 / 가사 있음 / CLEAN(19금 제외) / 장르
- **검색**: 곡 · 앨범 · 아티스트 · 플레이리스트
- **가사**: 재생 위치에 맞춰 따라가는 가사 패널
- **마이페이지**: 좋아요한 곡, 내 플레이리스트, 재생 횟수

## 준비물

- Node.js 20 이상
- [Spotify 개발자 대시보드](https://developer.spotify.com/dashboard)에서 만든 앱의 Client ID
- [Last.fm API 키](https://www.last.fm/api/account/create) (스테이션 추천과 장르 태그에 사용)

Spotify 앱의 Redirect URI에 아래 주소를 그대로 등록해야 합니다.

```
http://127.0.0.1:3000/api/spotify/callback
```

## 실행 방법

```bash
npm install
cp .env.example .env.local   # 복사한 뒤 아래 값을 채웁니다
npm run dev
```

`.env.local`에 넣을 값:

| 이름 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` | Spotify 앱의 Client ID |
| `SPOTIFY_REDIRECT_URI` | 위에 등록한 Redirect URI |
| `LASTFM_API_KEY` | Last.fm API 키 |

브라우저에서 **http://127.0.0.1:3000** 을 열고 오른쪽 위 `CONNECT`를 눌러
Spotify에 연결합니다. `localhost`가 아니라 `127.0.0.1`로 접속해야 로그인이 됩니다.

## 챗봇 (선택)

헤더의 눈 버튼을 누르면 오른쪽에 챗봇이 열립니다. 듣고 싶은 분위기를 말하면 실제로 있는 곡만 골라 카드로
보여 주고, 카드에서 바로 재생하거나 스테이션을 시작할 수 있습니다. 챗봇과 가운데 화면 사이의 선을
끌면 폭이 바뀌고(창 너비의 절반까지), 더블클릭하면 처음 폭으로 돌아갑니다.

챗봇은 Next.js와 별개의 프로세스(`agent/`)가 답합니다. `.env.local`에 `GEMINI_API_KEY`가 있으면 Gemini를 쓰고
(대화와 곡 판정 모두), 없으면 로컬 Ollama의 Qwen을 씁니다. `AGENT_PROVIDER=ollama`로 키가 있어도 로컬 모델을
고를 수 있습니다. 쓰려면 터미널을 하나 더 열어 아래를 한 번 준비하고 실행합니다.

```bash
# 로컬 모델을 쓸 때만: ollama list 에 qwen3-8b-local 이 보여야 합니다
python3 -m venv agent/.venv
agent/.venv/bin/pip install -r agent/requirements.txt
npm run agent                                 # http://127.0.0.1:8765 에서 대기
```

**출처 선택**: 챗봇 위쪽의 `Last.fm` · `Wikipedia` · `MusicBrainz` 버튼으로 에이전트가 참고할 곳을 켜고 끕니다(기본 전부 켬, 브라우저에 저장). 가수·곡을 물으면 켜진 출처에서 찾아 답하고, 어디서 가져왔는지 말풍선에 표시합니다. 모두 키 없이 무료입니다.

**내 태그 다듬기**: TAGS 패널에서 만든 내 태그를 선택하면 `대화로 다듬기` 버튼이 나옵니다(챗봇을 연 뒤
"내 태그 다듬기"에서 골라도 됩니다). 그 태그에 넣고 싶은 곡을 말하면 챗봇이 기준을 영어 한 문장으로 정리하고,
실제 곡 20개에 적용해 몇 곡이 통과하는지 미리 보여 줍니다. `적용`을 눌러야 태그의 정의가 바뀌고, 바뀐 정의는
다음 재생 목록을 만들 때부터 쓰입니다. (이름만 있는 태그는 판정기가 기준을 알 수 없어서, 기준을 말로 적어 주는 것이
예시를 모으는 것보다 훨씬 정확합니다 — `agent/experiments/personal_tag_exp.py`)

`LASTFM_API_KEY`는 위 `.env.local` 값을 그대로 씁니다. 에이전트를 켜지 않으면 챗봇 패널에 안내 문구가 나오고
나머지 기능은 그대로 동작합니다. 구조와 실험 스크립트는 [agent/README.md](./agent/README.md) 참고.

## 기술 구성

Next.js 16 · React 19 · Tailwind CSS 4 · Spotify Web API / Web Playback SDK ·
Last.fm · LRCLIB
