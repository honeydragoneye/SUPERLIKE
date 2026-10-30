// The monthly-themed magazine mail: make a draft, write your part, read it, then send it.
//   npm run issue:draft                    this week's issue, on the month's theme (lib/issue-seasons.json)
//                                          --theme <id or Last.fm tag> to choose the theme yourself (christmas, "city pop", …)
//   edit issue-drafts/<week>.json          the cover story and a line for each album: the parts only you write
//   npm run issue:send -- --to me@x.com    send the draft to one address only (a proof copy; nothing is marked sent)
//   npm run issue:send                     list who would receive it (nothing is sent)
//   npm run issue:send -- --confirm        send it to every active subscriber and mark the issue sent
//   npm run issue:draft -- --write         also let Gemini write the cover story and album lines (into the file, for you to edit)
//   node scripts/issue.mjs auto            what the Friday 18:00 KST job runs (.github/workflows/weekly-issue.yml):
//                                          draft with Gemini's words, then send to every subscriber; nothing happens if the week was already sent
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nodemailer from "nodemailer";
import pg from "pg";
import sharp from "sharp";

const [command, ...flags] = process.argv.slice(2);
const flag = (name) => flags.includes(`--${name}`) || (command === "auto" && name === "confirm");
const option = (name) => {
  const i = flags.indexOf(`--${name}`);
  return i >= 0 ? flags[i + 1] : undefined;
};

const { DATABASE_URL, OWNER_SPOTIFY_ID, GMAIL_USER, LASTFM_API_KEY } = process.env;
const SITE = (process.env.SITE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
if (!DATABASE_URL || !OWNER_SPOTIFY_ID) {
  console.error("DATABASE_URL and OWNER_SPOTIFY_ID are needed (put them in .env.local).");
  process.exit(1);
}
if (command !== "draft" && command !== "send" && command !== "auto") {
  console.error("usage: issue.mjs draft [--theme name] [--write] | send [--to address] [--confirm] | auto");
  process.exit(1);
}

const db = new pg.Client({ connectionString: DATABASE_URL.replace("sslmode=require", "sslmode=verify-full"), connectionTimeoutMillis: 20_000 });
/** Gmail's sending cap is about 500 a day; stay well under it */
const DAILY_LIMIT = 400;
const UA = { "User-Agent": "SuperlikeStudentProject/0.1 (weekly mail; contact via GMAIL_USER)" };
/** where the texts you write wait until the mail goes out */
const DRAFTS = new URL("../issue-drafts/", import.meta.url);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const getJson = (url, init = {}) => fetch(url, { ...init, headers: { ...UA, ...init.headers }, signal: AbortSignal.timeout(12_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

/** The month's subject: the calendar's entry for the month of the week, or whatever --theme names (a calendar id, else any Last.fm tag). */
function seasonFor(week) {
  const calendar = JSON.parse(readFileSync(new URL("../lib/issue-seasons.json", import.meta.url), "utf8"));
  const wanted = option("theme");
  if (!wanted) return calendar.find((s) => s.month === Number(week.slice(5, 7))) ?? calendar[0];
  const hit = calendar.find((s) => s.id === wanted.toLowerCase());
  return hit ?? { id: wanted, name: wanted, tag: wanted, radio: ["lounge"], word: wanted.toUpperCase(), line: `${wanted} 특집`, color: "#3d5afe", bg: "#12183f", card: "#1c2562", panel: "#26327f", sub: "#c4cdff" };
}

const norm = (v) => v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// ───────── gathering: Last.fm for what belongs to the theme, Apple for the album facts, Radio Browser for the stations

const lastfm = (method, params) =>
  LASTFM_API_KEY
    ? getJson(`https://ws.audioscrobbler.com/2.0/?${new URLSearchParams({ method, api_key: LASTFM_API_KEY, format: "json", ...params })}`)
    : null;

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Looks the album up on Apple (no key needed): cover, date, genre and tracks. */
async function appleAlbum(name, artist) {
  const found = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(`${name} ${artist}`)}&entity=album&limit=8`);
  const hit = (found?.results ?? []).find((r) => norm(r.artistName).includes(norm(artist)) && norm(r.collectionName).startsWith(norm(name).slice(0, 8)));
  if (!hit) return null;
  const list = await getJson(`https://itunes.apple.com/lookup?id=${hit.collectionId}&entity=song`);
  const tracks = (list?.results ?? []).filter((r) => r.wrapperType === "track").sort((a, b) => a.trackNumber - b.trackNumber);
  return {
    collectionId: hit.collectionId,
    name: hit.collectionName,
    artist: hit.artistName,
    releaseDate: hit.releaseDate?.slice(0, 10) ?? null,
    genre: hit.primaryGenreName ?? null,
    trackCount: hit.trackCount ?? tracks.length,
    artwork: hit.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
    tracks: tracks.map((t) => t.trackName),
  };
}

/** the app's own search, so a reader lands where the song can be played */
const searchLink = (q) => `${SITE}/search?q=${encodeURIComponent(q)}`;

/**
 * Three albums the tag's listeners return to, skipping any an earlier issue used
 * and any artist already chosen. Last.fm ranks the tag's albums; Apple has to
 * know the album for it to be used.
 */
async function pickAlbums(season, used) {
  const top = await lastfm("tag.gettopalbums", { tag: season.tag, limit: "50" });
  const picked = [];
  const artists = new Set();
  for (const row of asList(top?.albums?.album)) {
    const artist = row.artist?.name;
    if (!row.name || !artist || artists.has(norm(artist))) continue;
    const found = await appleAlbum(row.name, artist);
    if (!found || used.has(String(found.collectionId)) || picked.some((p) => p.collectionId === found.collectionId)) continue;
    artists.add(norm(artist));
    const baseName = found.name.replace(/\s*[-–(].*$/, "").trim();
    const wiki = await wikipedia(
      [`${baseName} ${found.artist} album`, `${baseName} ${found.artist} 앨범`],
      (title, text) => norm(title).includes(norm(baseName)) && norm(text).includes(norm(found.artist)),
    );
    const intro = wiki ? await inKorean(wiki) : null;
    if (intro) intro.text = shorten(intro.text, 260);
    picked.push({ ...found, link: searchLink(`${found.name} ${found.artist}`), intro });
    if (picked.length === 3) break;
  }
  return picked;
}

/** Ten songs from the tag's chart, at most two by one artist. */
async function pickSongs(season) {
  const top = await lastfm("tag.gettoptracks", { tag: season.tag, limit: "40" });
  const perArtist = new Map();
  const songs = [];
  for (const row of asList(top?.tracks?.track)) {
    const artist = row.artist?.name;
    if (!row.name || !artist) continue;
    const n = perArtist.get(norm(artist)) ?? 0;
    if (n >= 2) continue;
    perArtist.set(norm(artist), n + 1);
    songs.push({ title: row.name, artist, link: searchLink(`${row.name} ${artist}`) });
    if (songs.length === 10) break;
  }
  return songs;
}

const MIRRORS = ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://fi1.api.radio-browser.info"];

/** Two working stations from the season's radio tags, most voted first, whose own website still answers. */
async function pickRadios(season) {
  const out = [];
  for (const tag of season.radio) {
    const q = new URLSearchParams({ tag, tagExact: "true", hidebroken: "true", is_https: "true", order: "votes", reverse: "true", limit: "25" });
    let rows = null;
    for (const m of MIRRORS) if ((rows = await getJson(`${m}/json/stations/search?${q}`))) break;
    for (const r of rows ?? []) {
      const url = /^https?:\/\//i.test(r.homepage ?? "") ? r.homepage : null;
      if (!r.name || !url || out.some((o) => o.url === url || norm(o.name) === norm(r.name))) continue;
      const alive = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(6_000) }).then((x) => x.status < 400).catch(() => false);
      if (!alive) continue;
      out.push({ name: r.name.trim(), country: r.country || "", tags: String(r.tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 3), url });
      if (out.length === 2) return out;
    }
  }
  return out;
}

/** Apple's Korean most-played chart: entries that came out in the last ten days (a month when that finds none). */
async function pickReleases() {
  const chart = await getJson("https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/100/albums.json");
  const NOT_NEW = /\b(live|tour|remaster(?:ed)?|anniversary)\b|ライブ|リマスター|周年/i;
  const now = Date.now();
  const rows = (chart?.feed?.results ?? []).filter((r) => r.releaseDate && !NOT_NEW.test(r.name));
  for (const days of [10, 30]) {
    const fresh = rows.filter((r) => now - Date.parse(r.releaseDate) <= days * 86_400_000 && Date.parse(r.releaseDate) <= now + 86_400_000);
    if (fresh.length) return fresh.slice(0, 3).map((r) => ({ date: r.releaseDate.slice(5), title: r.name, artist: r.artistName, link: searchLink(`${r.name} ${r.artistName}`) }));
  }
  return [];
}

// ───────── what the texts are
/**
 * A Wikipedia article for the first query that finds one `accepts` agrees with,
 * Korean first then English. The check is what keeps a short album title from
 * landing on some other article that merely mentions the artist.
 */
async function wikipedia(queries, accepts) {
  for (const lang of ["ko", "en"]) {
    for (const q of queries) {
      const hits = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=3`);
      for (const h of hits?.query?.search ?? []) {
        const page = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(h.title.replaceAll(" ", "_"))}`);
        const text = page?.extract ?? "";
        if (page?.type === "standard" && text.length > 80 && accepts(page.title, text)) {
          return { text, lang, title: page.title, url: page.content_urls?.desktop?.page ?? null };
        }
      }
    }
  }
  return null;
}

/** An English passage becomes a short Korean one that adds nothing the passage does not say; without a key, or on any failure, it is kept as it is. */
async function inKorean(passage) {
  if (passage.lang === "ko" || !process.env.GEMINI_API_KEY) return { ...passage, summarized: false };
  const model = process.env.AGENT_GEMINI_MODEL || "gemini-flash-lite-latest";
  const res = await getJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `아래 위키백과 발췌를 한국어 2~3문장으로 요약해 줘. 발췌에 없는 사실은 절대 덧붙이지 말고, 고유명사는 원문 표기를 그대로 써. 요약문만 출력해.\n\n${passage.text}` }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  const out = res?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return out && out.length > 20 ? { ...passage, text: out, summarized: true } : { ...passage, summarized: false };
}

const shorten = (t, max = 420) => {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("다. "));
  return (stop > 120 ? cut.slice(0, stop + 1) : cut.trimEnd() + "…").trim();
};

/**
 * The eyes of the chat button (public/icons/eyes-white.svg) on its round black
 * button, as a PNG: mail clients do not draw SVG. The disc takes the week's ink
 * and the eyes its card colour, so it reads on the dark look too. Placed low and
 * left of centre, as in the app.
 */
function face(theme) {
  // drawn at the size it is shown: some mail clients ignore width/height and show a picture as big as it is
  const k = FACE_PX / 119;
  const eyes = readFileSync(new URL("../public/icons/eyes-white.svg", import.meta.url), "utf8")
    .replaceAll("#FFFDF6", theme.card)
    .replace(/<svg[^>]*>/, `<svg x="${12.3 * k}" y="${38.4 * k}" width="${60 * k}" height="${60 * k}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FACE_PX}" height="${FACE_PX}" viewBox="0 0 ${FACE_PX} ${FACE_PX}"><circle cx="${FACE_PX / 2}" cy="${FACE_PX / 2}" r="${FACE_PX / 2}" fill="${theme.ink}"/>${eyes}</svg>`;
  // rendered at 4x and scaled down, so the small circle and eyes are smooth
  return sharp(Buffer.from(svg), { density: 72 * 4 }).resize(FACE_PX, FACE_PX).png().toBuffer();
}
/** as tall and wide as the heading beside it */
const FACE_PX = 30;
const FACE_CID = "face@superlike";

function transport() {
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!GMAIL_USER || !pass) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD are not set.");
    process.exit(1);
  }
  return nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL_USER, pass } });
}

// ───────── the words only you write

const draftFile = (week) => new URL(`${week}.json`, DRAFTS);
const albumLabel = (a) => `${a.name} — ${a.artist}`;

/** The texts waiting in issue-drafts/<week>.json, or null when the file is not there or cannot be read. */
function readEdits(week) {
  try {
    return existsSync(draftFile(week)) ? JSON.parse(readFileSync(draftFile(week), "utf8")) : null;
  } catch (e) {
    console.error(`issue-drafts/${week}.json cannot be read (${e.message}); fix the JSON and run again.`);
    process.exit(1);
  }
}

/** What the file says, laid over the gathered issue: the headline, the cover story and a note per album (found by its name). */
function applyEdits(magazine, edits) {
  const notes = new Map((edits?.albumNotes ?? []).map((n) => [n.album, String(n.note ?? "").trim()]));
  const prev = magazine.text ?? {};
  const cover = String(edits?.cover ?? "").trim();
  // words already on the issue (Gemini's, from the draft) stay unless the file says something in their place
  magazine.text = {
    headline: String(edits?.headline ?? "").trim() || prev.headline || "",
    cover: cover || prev.cover || "",
    albumNotes: magazine.albums.map((a, i) => notes.get(albumLabel(a)) || prev.albumNotes?.[i] || ""),
    // written by the model, not by the developer: the mail says so
    auto: !cover && !!prev.auto,
  };
  return magazine;
}

/**
 * Gemini writes the headline, the cover story and one line per album from the
 * facts gathered, and only from them. Tried a few times; null when it never
 * gives a usable answer, so an issue is never sent with made-up filler.
 */
async function writeWords(magazine) {
  if (!process.env.GEMINI_API_KEY) return null;
  const model = process.env.AGENT_GEMINI_MODEL || "gemini-flash-lite-latest";
  const { season, albums, songs, radios, releases } = magazine;
  const facts = {
    주제: season.name,
    앨범: albums.map((a) => ({ 이름: a.name, 가수: a.artist, 발매일: a.releaseDate, 곡수: a.trackCount, 장르: a.genre, 수록곡: a.tracks.slice(0, 16), 소개: a.intro?.text ?? null })),
    플레이리스트: songs.map((n) => `${n.title} — ${n.artist}`),
    라디오: radios.map((r) => ({ 이름: r.name, 나라: r.country, 태그: r.tags })),
    이번주신보: releases.map((r) => `${r.title} — ${r.artist}`),
  };
  const prompt =
    `너는 음악 감상 서비스 Superlike의 월간 주제 매거진 메일을 쓰는 편집자야. 아래 자료만 근거로 한국어(합니다체)로 써.\n` +
    `규칙: 자료에 없는 사실(연도, 순위, 수상, 일화, 가사 내용)은 절대 쓰지 마. 과장하지 말고 담백하게. 이모지와 해시태그 금지. 고유명사는 원문 표기 그대로. ‘만나보세요’ ‘감상하세요’ ‘포근한’ 같은 상투적인 표현은 피하고, 앨범 한 줄에는 수록곡 이름·곡 수·발매일 같은 자료 속 구체적인 사실 하나를 꼭 넣어. 커버 스토리는 반드시 줄바꿈으로 나뉜 문단 3개로 써.\n` +
    `출력은 JSON 하나: {"headline": 20자 안팎의 제목, "cover": 문단 3개를 \\n으로 이은 커버 스토리(300~450자: 이 주제의 계절에 왜 이 노래들을 찾게 되는지, 이번 호 구성 소개, 권하는 한마디), "albumNotes": 앨범 순서대로 한 줄(60자 이내) 추천 문장 ${albums.length}개의 배열}\n\n` +
    JSON.stringify(facts);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await getJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, responseMimeType: "application/json" } }),
    });
    try {
      const out = JSON.parse(res?.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
      const notes = Array.isArray(out.albumNotes) ? out.albumNotes.map((n) => String(n).trim()) : [];
      if (String(out.headline ?? "").trim() && String(out.cover ?? "").trim().length > 120 && notes.length === albums.length && notes.every(Boolean)) {
        return { headline: String(out.headline).trim(), cover: String(out.cover).trim(), albumNotes: notes };
      }
    } catch {
      // an answer that is not JSON is tried again
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/** The blanks to fill, written once and kept: running the draft again leaves what was written. */
function writeEdits(week, magazine) {
  mkdirSync(DRAFTS, { recursive: true });
  const t = magazine.text;
  const file = {
    "안내": "headline(이번 호 제목), cover(커버 스토리 300~500자, 줄바꿈은 \\n), 앨범마다 note(1~2줄)를 쓰면 됩니다. 비워 둔 칸은 메일에서 빠집니다. 다 쓰고 npm run issue:send -- --to 내주소 로 확인하세요.",
    headline: t.headline,
    cover: t.cover,
    albumNotes: magazine.albums.map((a, i) => ({ album: albumLabel(a), note: t.albumNotes[i] })),
  };
  writeFileSync(draftFile(week), JSON.stringify(file, null, 2) + "\n");
}

// ───────── the page

/** "2026-12-07" → "2026년 12월호" */
const monthLabel = (week) => `${week.slice(0, 4)}년 ${Number(week.slice(5, 7))}월호`;

function render(issue, who, unsubscribeUrl, faceSrc) {
  const t = issue.theme;
  const m = issue.magazine;
  const s = m.season;
  const x = m.text;
  const block = (title, body) =>
    `<tr><td style="padding:30px 28px 0"><div style="font-size:11px;letter-spacing:1.5px;color:${t.sub};font-weight:700">${title}</div>${body}</td></tr>`;
  const paras = (txt, size = 15) => esc(txt).split("\n").filter(Boolean).map((p) => `<p style="margin:10px 0 0;font-size:${size}px;line-height:1.75;color:${t.ink}">${p}</p>`).join("");
  // what is written by hand has a bar beside it, as in the design
  const mine = (txt, size = 14) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr><td width="3" style="width:3px;background:${t.sub}"></td><td style="padding-left:12px;font-size:${size}px;line-height:1.7;color:${t.ink}">${esc(txt).replaceAll("\n", "<br>")}</td></tr></table>`;
  const credit = (intro) =>
    intro
      ? `<div style="margin-top:6px;font-size:10px;color:${t.sub}">출처 <a href="${esc(intro.url)}" style="color:${t.sub}">Wikipedia · ${esc(intro.title)}</a>${intro.summarized ? " (요약)" : ""}</div>`
      : "";
  const link = (href, label) => `<a href="${esc(href)}" style="color:${t.ink};text-decoration:none;font-weight:700">${label}</a>`;
  const button = (href, label) =>
    `<a href="${esc(href)}" style="display:inline-block;margin-top:12px;background:${t.ink};color:${t.card};text-decoration:none;font-size:13px;font-weight:700;padding:10px 20px;border-radius:30px">${label}</a>`;

  const hero = `<tr><td style="padding:22px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${s.color};border-radius:6px;padding:70px 28px 26px">
    <div style="font-size:46px;line-height:1.05;letter-spacing:2px;font-weight:800;color:#ffffff">${esc(s.word)}</div>
    <div style="margin-top:8px;font-size:14px;color:#ffffffcc">${esc(s.line)}</div></td></tr></table></td></tr>`;
  const cover = x.cover
    ? `<tr><td style="padding:16px 28px 0">${mine(x.cover, 15)}<div style="margin-top:10px;font-size:12px;color:${t.sub}">— ${x.auto ? "Superlike" : "용눈이"}</div></td></tr>`
    : "";

  const albums = m.albums
    .map((a, i) => {
      const meta = [a.releaseDate, a.trackCount ? `${a.trackCount}곡` : null, a.genre].filter(Boolean).map(esc).join(" · ");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;background:${t.panel};border-radius:8px"><tr>
        ${a.artwork ? `<td width="104" valign="top" style="padding:14px 0 14px 14px"><img src="${esc(a.artwork)}" width="104" height="104" alt="${esc(a.name)}" style="display:block;border-radius:4px"></td>` : ""}
        <td valign="top" style="padding:14px">
          <div style="font-size:16px;font-weight:800;line-height:1.35;color:${t.ink}">${esc(a.name)}</div>
          <div style="margin-top:2px;font-size:12px;color:${t.sub}">${esc(a.artist)}</div>
          <div style="margin-top:2px;font-size:11px;color:${t.sub}">${meta}</div>
          ${a.intro ? `<div style="margin-top:8px;font-size:12.5px;line-height:1.65;color:${t.ink}">${esc(a.intro.text)}</div>${credit(a.intro)}` : ""}
          ${x.albumNotes[i] ? mine(x.albumNotes[i], 12.5) : ""}
          ${button(a.link, "듣기 →")}
        </td></tr></table>`;
    })
    .join("");

  const songs = m.songs
    .map((n, i) => `<tr><td width="28" style="font-size:11px;font-weight:700;color:${t.sub};padding:5px 0">${String(i + 1).padStart(2, "0")}</td><td style="font-size:13.5px;color:${t.ink};padding:5px 0">${link(n.link, esc(n.title))}</td><td align="right" style="font-size:11.5px;color:${t.sub};padding:5px 0 5px 10px">${esc(n.artist)}</td></tr>`)
    .join("");

  const radios = m.radios
    .map((r) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:${t.panel};border-radius:8px"><tr><td style="padding:14px 16px">
        <div style="font-size:15px;font-weight:800;color:${t.ink}">${esc(r.name)}</div>
        <div style="margin-top:2px;font-size:11px;color:${t.sub}">${[r.country, ...r.tags].filter(Boolean).map(esc).join(" · ")}</div>
        <div style="margin-top:8px;font-size:12px"><a href="${esc(r.url)}" style="color:${t.ink};font-weight:700">공식 사이트 ↗</a></div></td></tr></table>`)
    .join("");

  const releases = m.releases
    .map((r) => `<tr><td width="52" style="font-size:11px;font-weight:700;color:${t.sub};padding:5px 0">${esc(r.date.replace("-", "."))}</td><td style="font-size:13.5px;color:${t.ink};padding:5px 0">${link(r.link, esc(r.title))}</td><td align="right" style="font-size:11.5px;color:${t.sub};padding:5px 0 5px 10px">${esc(r.artist)}</td></tr>`)
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:${t.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${t.card};font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:${t.ink}">
  <tr><td style="padding:26px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px"><img src="${esc(faceSrc)}" width="${FACE_PX}" height="${FACE_PX}" alt="" style="display:block;width:${FACE_PX}px;height:${FACE_PX}px;border-radius:${FACE_PX / 2}px"></td>
      <td style="font-size:22px;line-height:30px;letter-spacing:2px;font-weight:800;color:${t.sub}">SUPERLIKE® · MAGAZINE</td>
    </tr></table>
    <div style="margin-top:6px;font-size:12px;color:${t.sub}">${esc(issue.monthLabel)} · ${esc(s.name)}</div>
    <h1 style="margin:14px 0 0;font-size:30px;line-height:1.25;letter-spacing:-1px">${esc(who)}님,<br>${esc(x.headline || s.line)}</h1>
  </td></tr>
  ${block("COVER STORY", "")}
  ${hero}
  ${cover}
  ${m.albums.length ? block("ALBUMS OF THE MONTH", albums) : ""}
  ${songs ? block(`PLAYLIST · ${m.songs.length} SONGS`, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${songs}</table><div style="margin-top:8px;font-size:10px;color:${t.sub}">출처 Last.fm · ${esc(s.tag)} 태그 인기 곡</div>`) : ""}
  ${radios ? block("ON AIR · 틀어 두기 좋은 라디오", radios) : ""}
  ${releases ? block("NEW THIS WEEK", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${releases}</table><div style="margin-top:8px;font-size:10px;color:${t.sub}">출처 Apple Music · 최근 발매</div>`) : ""}
  <tr><td style="padding:32px 28px;font-size:12px;line-height:1.6;color:${t.sub}">${esc(issue.monthLabel)} 매거진입니다.<br><a href="${esc(unsubscribeUrl)}" style="color:${t.sub}">구독 해지</a></td></tr>
</table></td></tr></table></body></html>`;

  const text =
    `${who}님, ${x.headline || s.line}\n${issue.monthLabel} · ${s.name}\n\n` +
    (x.cover ? `[커버 스토리]\n${x.cover}\n— ${x.auto ? "Superlike" : "용눈이"}\n\n` : "") +
    m.albums.map((a, i) => `[앨범] ${albumLabel(a)}\n${a.intro ? a.intro.text + `\n(출처 Wikipedia ${a.intro.url})\n` : ""}${x.albumNotes[i] ? x.albumNotes[i] + "\n" : ""}듣기: ${a.link}\n\n`).join("") +
    (m.songs.length ? `[플레이리스트]\n${m.songs.map((n, i) => `${i + 1}. ${n.title} — ${n.artist}`).join("\n")}\n\n` : "") +
    (m.radios.length ? `[라디오]\n${m.radios.map((r) => `${r.name}: ${r.url}`).join("\n")}\n\n` : "") +
    (m.releases.length ? `[이번 주 신보]\n${m.releases.map((r) => `${r.date.replace("-", ".")} ${r.title} — ${r.artist}`).join("\n")}\n\n` : "") +
    `해지: ${unsubscribeUrl}\n`;
  return { text, html };
}

let skipSend = false;

async function draft() {
  // The week is the Seoul week (Monday first), as everywhere else in the app.
  const { rows: [{ week }] } = await db.query(
    "select date_trunc('week', (now() at time zone 'Asia/Seoul'))::date::text as week",
  );
  const { rows: [existing] } = await db.query("select status from issues where week_start = $1::date", [week]);
  if (existing?.status === "sent") {
    // the Friday job may start twice (a retry, a manual run): the second one has nothing to do
    console.error(`The issue for the week of ${week} has already been sent; it is not rewritten.`);
    process.exitCode = command === "auto" ? 0 : 1;
    skipSend = true;
    return;
  }
  if (!LASTFM_API_KEY) {
    console.error("LASTFM_API_KEY is needed to gather the theme's albums and songs (put it in .env.local).");
    process.exitCode = 1;
    return;
  }
  const season = seasonFor(week);
  // the developer's own most played songs this week: "용눈이의 한 곡" comes from them
  const { rows: tracks } = await db.query(
    `select p.track_id as id, max(p.title) as title, max(p.artist) as artist, sum(p.count)::int as count
       from plays_daily p
      where p.user_id = $1 and p.day >= $2::date
      group by p.track_id
      order by sum(p.count) desc, max(p.day) desc
      limit 25`,
    [OWNER_SPOTIFY_ID, week],
  );
  // an album an earlier issue already featured is not featured again
  const { rows: past } = await db.query("select magazine, album from issues where week_start <> $1::date", [week]);
  const used = new Set(past.flatMap((r) => [...(r.magazine?.albums ?? []).map((a) => String(a.collectionId)), r.album?.collectionId ? String(r.album.collectionId) : null]).filter(Boolean));

  console.log(`theme: ${season.name} (${season.tag})`);
  const [albums, songs, radios, releases] = await Promise.all([pickAlbums(season, used), pickSongs(season), pickRadios(season), pickReleases()]);
  if (albums.length === 0 && songs.length === 0) {
    console.error(`Last.fm has nothing for "${season.tag}"; try --theme with another tag.`);
    process.exitCode = 1;
    return;
  }
  const magazine = applyEdits({ season, albums, songs, radios, releases }, readEdits(week));
  if ((flag("write") || command === "auto") && !magazine.text.cover) {
    const words = await writeWords(magazine);
    if (!words) {
      console.error("Gemini did not give usable words for this issue; nothing is sent. Run it again, or write issue-drafts/<week>.json yourself.");
      process.exitCode = 1;
      return;
    }
    magazine.text = { ...words, auto: command === "auto" };
  }

  const lead = albums[0];
  const monthTitle = monthLabel(week);
  const title = `Superlike ${monthTitle.replace(/^\d+년 /, "")} · ${season.name}`;
    const { intro, link: _link, ...leadAlbum } = lead ?? {};
  await db.query(
    `insert into issues (week_start, title, tracks, album, theme, magazine, status) values ($1::date, $2, $3::jsonb, $4::jsonb, $5, $6::jsonb, 'draft')
     on conflict (week_start) do update set title = excluded.title, tracks = excluded.tracks, album = excluded.album, theme = excluded.theme, magazine = excluded.magazine`,
    // `album` is what the archive page (/issues) shows: the issue's first album
    [week, title, JSON.stringify(tracks), lead ? JSON.stringify({ ...leadAlbum, spotifyAlbumId: null, albumIntro: intro }) : null, season.name, JSON.stringify(magazine)],
  );
  // the unattended job keeps its words in the database only; by hand they go in the file to be edited
  if (command !== "auto") writeEdits(week, magazine);

  const { rows: [saved] } = await db.query("select *, week_start::text as week_text from issues where week_start = $1::date", [week]);
  const file = join(tmpdir(), `superlike-issue-${week}.html`);
  const preview = hydrate(saved);
  const faceUri = `data:image/png;base64,${(await face(preview.theme)).toString("base64")}`;
  writeFileSync(file, render(preview, option("as") ?? "닉네임", `${SITE}/subscribe?unsubscribe=PREVIEW`, faceUri).html);
  console.log(`${title}\n${albums.length} albums · ${songs.length} songs · ${radios.length} radios · ${releases.length} new releases`);
  albums.forEach((a) => console.log(`  album: ${albumLabel(a)} · intro ${a.intro ? `${a.intro.title} (${a.intro.lang}${a.intro.summarized ? ", summarized" : ""})` : "none found"}`));
  console.log(`\nwrite your part: issue-drafts/${week}.json  (cover story and a line per album)\npreview: ${file}\nnext: npm run issue:send -- --to <your address>   then   npm run issue:send -- --confirm`);
}

/** A saved issue row, back into what render() reads. */
function hydrate(row) {
  if (!row.magazine) throw new Error("this draft was made before the magazine layout; run npm run issue:draft again");
  const s = row.magazine.season;
  const theme = { bg: s.bg, card: s.card, panel: s.panel, sub: s.sub, ink: "#ffffff" };
  return { title: row.title, tracks: row.tracks, magazine: row.magazine, theme, monthLabel: monthLabel(row.week_text) };
}

async function deliver(mail, issue, to, token, who) {
  const url = `${SITE}/subscribe?unsubscribe=${token}`;
  const shown = hydrate(issue);
  const { text, html } = render(shown, who, url, `cid:${FACE_CID}`);
  await mail.sendMail({
    from: `Superlike <${GMAIL_USER}>`,
    to,
    subject: issue.title,
    text,
    html,
    headers: { "List-Unsubscribe": `<${url}>` },
    attachments: [{ filename: "superlike.png", content: await face(shown.theme), cid: FACE_CID }],
  });
}

async function send() {
  const { rows: [issue] } = await db.query(
    "select id, title, tracks, album, theme, magazine, status, delivered, week_start::text as week_text from issues order by week_start desc limit 1",
  );
  if (!issue) {
    console.error("There is no draft. Run: npm run issue:draft");
    process.exitCode = 1;
    return;
  }
  if (issue.status !== "sent" && issue.magazine) {
    // the texts written since the draft was made go in now
    issue.magazine = applyEdits(issue.magazine, readEdits(issue.week_text));
    await db.query("update issues set magazine = $2::jsonb where id = $1", [issue.id, JSON.stringify(issue.magazine)]);
  }
  const proof = option("to");
  if (proof) {
    // a proof copy for the developer: any address, the real layout, nothing marked sent
    await deliver(transport(), issue, proof, "PREVIEW", option("as") ?? "닉네임");
    console.log(`proof of "${issue.title}" sent to ${proof}`);
    return;
  }
  if (issue.status === "sent") {
    console.error(`"${issue.title}" has already been sent.`);
    process.exitCode = 1;
    return;
  }
  // anyone an earlier, interrupted run already reached is not mailed twice
  const done = new Set(issue.delivered ?? []);
  const { rows: all } = await db.query("select email, token, nickname from subscribers where status = 'active' order by confirmed_at");
  const subs = all.filter((s) => !done.has(s.email));
  console.log(`"${issue.title}" → ${subs.length} active subscribers`);
  if (!flag("confirm")) {
    subs.forEach((s) => console.log("  ", s.email));
    console.log("\nNothing sent. Add --confirm to send.");
    return;
  }
  if (!issue.magazine?.text?.cover) {
    console.error(`The cover story is empty: write it in issue-drafts/${issue.week_text}.json before sending to everyone.`);
    process.exitCode = 1;
    return;
  }
  if (subs.length > DAILY_LIMIT) {
    console.error(`${subs.length} recipients is over the ${DAILY_LIMIT} a day this account can send; not sending.`);
    process.exitCode = 1;
    return;
  }
  const mail = transport();
  let sent = 0;
  for (const s of subs) {
    try {
      await deliver(mail, issue, s.email, s.token, s.nickname || "구독자");
      sent++;
      await db.query("update issues set delivered = array_append(delivered, $2) where id = $1", [issue.id, s.email]);
    } catch (e) {
      console.error(`failed: ${s.email}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  // marked sent only when everyone got it; a partial run leaves the draft to be sent again
  if (sent === subs.length) {
    await db.query("update issues set status = 'sent', sent_at = now() where id = $1", [issue.id]);
  }
  console.log(`sent ${sent}/${subs.length}${sent === subs.length ? "" : " — the draft stays a draft"}`);
  if (sent < subs.length) process.exitCode = 1;
}

try {
  await db.connect();
  if (command === "auto") {
  await draft();
  if (!process.exitCode && !skipSend) await send();
} else {
  await (command === "draft" ? draft() : send());
}
} catch (e) {
  console.error(`${command} failed:`, e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
