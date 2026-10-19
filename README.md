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

**출처 고르기**: 챗봇은 먼저 Last.fm으로 찾고, 거기서 답할 수 없으면 지어내지 않고 "찾지 못했어요"라고 말한 뒤 `Wikipedia에서 찾기` · `MusicBrainz에서 찾기` 버튼을 보여 줍니다. 누르면 같은 질문을 그 출처까지 써서 다시 찾습니다. 모두 키 없이 무료입니다.

**내 취향**: `좋아요한 곡 N곡 공유` 버튼을 켜면 최근 좋아요한 곡(최대 30곡)이 챗봇에게 보여서 "내 취향에 맞는 곡 추천해줘"에 답합니다(좋아요한 곡은 추천에서 빠집니다). 곡 정보가 모델(Gemini)로 전달되는 것이라 기본은 꺼져 있습니다.

**내 태그 다듬기**: TAGS 패널에서 만든 내 태그를 선택하면 `대화로 다듬기` 버튼이 나옵니다(챗봇을 연 뒤
"내 태그 다듬기"에서 골라도 됩니다). 그 태그에 넣고 싶은 곡을 말하면 챗봇이 기준을 영어 한 문장으로 정리하고,
실제 곡 20개에 적용해 몇 곡이 통과하는지 미리 보여 줍니다. `적용`을 눌러야 태그의 정의가 바뀌고, 바뀐 정의는
다음 재생 목록을 만들 때부터 쓰입니다. (이름만 있는 태그는 판정기가 기준을 알 수 없어서, 기준을 말로 적어 주는 것이
예시를 모으는 것보다 훨씬 정확합니다 — `agent/experiments/personal_tag_exp.py`)

`LASTFM_API_KEY`는 위 `.env.local` 값을 그대로 씁니다. 에이전트를 켜지 않으면 챗봇 패널에 안내 문구가 나오고
나머지 기능은 그대로 동작합니다. 구조와 실험 스크립트는 [agent/README.md](./agent/README.md) 참고.

## 공유 DB (선택)

좋아요와 재생 기록은 기본적으로 브라우저에만 저장됩니다. `.env.local`에 `DATABASE_URL`(Neon 같은 Postgres)을
넣으면 로그인한 Spotify 계정별로 DB에도 저장되고, 다른 기기에서도 같은 좋아요가 보입니다. 처음 한 번 테이블을
만듭니다.

```bash
npm run db:migrate        # lib/db/schema.sql 적용 (여러 번 실행해도 안전)
```

`OWNER_SPOTIFY_ID`(개발자 계정의 Spotify 사용자 ID, 로그인한 채로 `/api/spotify/me`에서 확인)를 넣으면 홈의
**Editor's Pick**이 그 계정이 가장 최근에 좋아요한 곡의 앨범을 보여 줍니다. 앨범 정보와 표지에서 뽑은 색은 개발자가
로그인해 있을 때 DB에 저장되고, 로그인하지 않은 방문자는 저장된 내용을 봅니다. DB가 없으면 이 기능만 꺼지고
나머지는 그대로 동작합니다.

## 주간 매거진 메일 (선택)

홈 오른쪽 STAY CONNECTED의 신청을 받아 매주 메일을 보냅니다. 공유 DB가 먼저 필요하고, 발송은 Gmail SMTP(앱 비밀번호)를 씁니다.

1. `.env.local`에 `GMAIL_USER`, `GMAIL_APP_PASSWORD`(앱 비밀번호 16자, 공백 없이), `SITE_URL`을 넣고 `npm run db:migrate`
2. 구독 신청 → 확인 메일의 링크에서 버튼을 눌러야 구독이 시작됩니다(더블 옵트인). 모든 메일에 해지 링크가 있습니다.
3. 발송은 사람이 확인한 뒤에만 합니다.
   - `npm run issue:draft` 이번 주 초안(개발자가 가장 많이 들은 곡 최대 25곡) 만들기, 미리보기 파일 경로를 출력
   - `npm run issue:send -- --to 내주소@gmail.com` 나에게만 시험 발송 (발송 처리 안 됨)
   - `npm run issue:send` 받을 사람 목록만 확인
   - `npm run issue:send -- --confirm` 구독자 전체에게 발송하고 발송 완료로 표시

Gmail 개인 계정은 하루 500통 안팎이라 400명을 넘으면 발송하지 않습니다.

## 기술 구성

Next.js 16 · React 19 · Tailwind CSS 4 · Spotify Web API / Web Playback SDK ·
Last.fm · LRCLIB
