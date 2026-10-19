// The weekly mail: make a draft, read it, then send it.
//   npm run issue:draft                    build this week's draft (an album from the developer's plays) and save a preview file
//                                          --track <spotify track id> to choose the album yourself
//   npm run issue:send -- --to me@x.com    send the draft to one address only (a proof copy; nothing is marked sent)
//   npm run issue:send                     list who would receive it (nothing is sent)
//   npm run issue:send -- --confirm        send it to every active subscriber and mark the issue sent
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nodemailer from "nodemailer";
import pg from "pg";
import sharp from "sharp";

const [command, ...flags] = process.argv.slice(2);
const flag = (name) => flags.includes(`--${name}`);
const option = (name) => {
  const i = flags.indexOf(`--${name}`);
  return i >= 0 ? flags[i + 1] : undefined;
};

const { DATABASE_URL, OWNER_SPOTIFY_ID, GMAIL_USER } = process.env;
const SITE = (process.env.SITE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
if (!DATABASE_URL || !OWNER_SPOTIFY_ID) {
  console.error("DATABASE_URL and OWNER_SPOTIFY_ID are needed (put them in .env.local).");
  process.exit(1);
}
if (command !== "draft" && command !== "send") {
  console.error("usage: issue.mjs draft | send [--to address] [--confirm]");
  process.exit(1);
}

const db = new pg.Client({ connectionString: DATABASE_URL.replace("sslmode=require", "sslmode=verify-full"), connectionTimeoutMillis: 20_000 });
/** Gmail's sending cap is about 500 a day; stay well under it */
const DAILY_LIMIT = 400;
const UA = { "User-Agent": "SuperlikeStudentProject/0.1 (weekly mail; contact via GMAIL_USER)" };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const getJson = (url, init = {}) => fetch(url, { ...init, headers: { ...UA, ...init.headers } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

/** The look changes week by week: a name for the week's idea, and its colours. */
const THEMES = [
  { name: "A SIDE", line: "이번 주 개발자의 턴테이블에 올라간 앨범", bg: "#ffe000", ink: "#111111", sub: "#5c5200", card: "#fffbe0" },
  { name: "LINER NOTES", line: "앨범 뒷면에 적혀 있을 법한 이야기", bg: "#f78fc0", ink: "#1a0a12", sub: "#6b2f4a", card: "#fff0f7" },
  { name: "SPOTLIGHT", line: "이 앨범을 만든 사람들 이야기", bg: "#b8f26b", ink: "#0f1a00", sub: "#3d5a10", card: "#f4ffe0" },
  { name: "NIGHT SHIFT", line: "밤에 꺼내 듣기 좋은 한 장", bg: "#1d1d2b", ink: "#ffffff", sub: "#b9b9d0", card: "#2a2a3d" },
];
const themeFor = (week) => THEMES[Math.floor(Date.parse(week) / (7 * 86_400_000)) % THEMES.length];

// ───────── what the album and the artist are

/** Finds the album a track is on. iTunes search needs no key; the Korean storefront answers nothing here, the US one does. */
async function findAlbum(title, artist) {
  const found = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(`${title} ${artist}`)}&entity=song&limit=8`);
  const hit = (found?.results ?? []).find((r) => norm(r.artistName).includes(norm(artist)) && norm(r.trackName).startsWith(norm(title).slice(0, 6)));
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

const norm = (v) => v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

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

// ───────── the page

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

function render(issue, who, unsubscribeUrl, faceSrc) {
  const t = issue.theme;
  const a = issue.album;
  // the album's own page in the app
  const listen = a.spotifyAlbumId ? `${SITE}/album/${a.spotifyAlbumId}` : null;
  const credit = (intro) =>
    intro
      ? `<p style="margin:8px 0 0;font-size:11px;color:${t.sub}">출처 <a href="${esc(intro.url)}" style="color:${t.sub}">Wikipedia · ${esc(intro.title)}</a>${intro.summarized ? " (요약)" : ""}</p>`
      : "";
  const block = (title, body) =>
    `<tr><td style="padding:22px 28px 0"><div style="font-size:11px;letter-spacing:1.5px;color:${t.sub};font-weight:700">${title}</div>${body}</td></tr>`;
  const para = (txt) => `<p style="margin:8px 0 0;font-size:15px;line-height:1.75;color:${t.ink}">${esc(txt)}</p>`;

  const trackList = a.tracks.length
    ? `<ol style="margin:10px 0 0;padding-left:22px;font-size:14px;line-height:1.8;color:${t.ink}">${a.tracks.slice(0, 16).map((n) => `<li>${esc(n)}</li>`).join("")}</ol>`
    : "";
  const heard = issue.tracks
    .slice(0, 8)
    .map((x) => `<li>${esc(x.title)} — ${esc(x.artist)} <span style="color:${t.sub}">${x.count}회</span></li>`)
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:${t.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${t.card};font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:${t.ink}">
  <tr><td style="padding:26px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px"><img src="${esc(faceSrc)}" width="${FACE_PX}" height="${FACE_PX}" alt="" style="display:block;width:${FACE_PX}px;height:${FACE_PX}px;border-radius:${FACE_PX / 2}px"></td>
      <td style="font-size:24px;line-height:30px;letter-spacing:2px;font-weight:800;color:${t.sub}">SUPERLIKE® · ${esc(t.name)}</td>
    </tr></table>
    <div style="margin-top:6px;font-size:13px;color:${t.sub}">${esc(issue.weekLabel)}</div>
    <h1 style="margin:14px 0 0;font-size:30px;line-height:1.2;letter-spacing:-1px">${esc(who)}님,<br>${esc(t.line)}</h1>
  </td></tr>
  <tr><td style="padding:22px 28px 0">
    ${a.artwork ? `<img src="${esc(a.artwork)}" width="544" alt="${esc(a.name)}" style="display:block;width:100%;height:auto;border-radius:6px">` : ""}
    <div style="margin-top:14px;font-size:24px;font-weight:800;letter-spacing:-0.5px">${esc(a.name)}</div>
    <div style="margin-top:2px;font-size:15px;color:${t.sub}">${esc(a.artist)}</div>
    <div style="margin-top:6px;font-size:12px;color:${t.sub}">${[a.releaseDate, a.trackCount ? `${a.trackCount}곡` : null, a.genre].filter(Boolean).map(esc).join(" · ")}</div>
  </td></tr>
  ${listen ? `<tr><td style="padding:20px 28px 0"><a href="${esc(listen)}" style="display:inline-block;background:${t.ink};color:${t.card};text-decoration:none;font-size:15px;font-weight:700;padding:13px 26px;border-radius:30px">바로 들으러 가기 →</a></td></tr>` : ""}
  ${issue.albumIntro ? block("ABOUT THE ALBUM", para(issue.albumIntro.text) + credit(issue.albumIntro)) : ""}
  ${trackList ? block("TRACKLIST", trackList) : ""}
  ${issue.artistIntro ? block(`ABOUT ${esc(a.artist.toUpperCase())}`, para(issue.artistIntro.text) + credit(issue.artistIntro)) : ""}
  ${heard ? block("이번 주 개발자가 들은 곡", `<ul style="margin:10px 0 0;padding-left:20px;font-size:13px;line-height:1.8;color:${t.ink}">${heard}</ul>`) : ""}
  <tr><td style="padding:28px;font-size:12px;color:${t.sub}">개발자(honeydragoneye)가 이번 주 들은 곡 중에서 고른 앨범입니다.<br><a href="${esc(unsubscribeUrl)}" style="color:${t.sub}">구독 해지</a></td></tr>
</table></td></tr></table></body></html>`;

  const text =
    `${who}님, ${t.line}\n\n${a.name} — ${a.artist}\n${[a.releaseDate, a.trackCount ? `${a.trackCount}곡` : null, a.genre].filter(Boolean).join(" · ")}\n` +
    (listen ? `바로 들으러 가기: ${listen}\n` : "") + "\n" +
    (issue.albumIntro ? `[앨범 소개]\n${issue.albumIntro.text}\n(출처 Wikipedia ${issue.albumIntro.url})\n\n` : "") +
    (a.tracks.length ? `[수록곡]\n${a.tracks.slice(0, 16).map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\n` : "") +
    (issue.artistIntro ? `[가수 소개]\n${issue.artistIntro.text}\n(출처 Wikipedia ${issue.artistIntro.url})\n\n` : "") +
    `해지: ${unsubscribeUrl}\n`;
  return { text, html };
}

async function draft() {
  // The week is the Seoul week (Monday first), as everywhere else in the app.
  const { rows: [{ week }] } = await db.query(
    "select date_trunc('week', (now() at time zone 'Asia/Seoul'))::date::text as week",
  );
  const { rows: [existing] } = await db.query("select status from issues where week_start = $1::date", [week]);
  if (existing?.status === "sent") {
    console.error(`The issue for the week of ${week} has already been sent; it is not rewritten.`);
    process.exitCode = 1;
    return;
  }
  const { rows: tracks } = await db.query(
    // the album id was not kept for older plays; a heart on the track remembers it too
    `select p.track_id as id, max(p.title) as title, max(p.artist) as artist, sum(p.count)::int as count,
            coalesce(max(p.album_id), max(l.album_id)) as "albumId"
       from plays_daily p
       left join likes l on l.user_id = p.user_id and l.track_id = p.track_id
      where p.user_id = $1 and p.day >= $2::date
      group by p.track_id
      order by sum(p.count) desc, max(p.day) desc
      limit 25`,
    [OWNER_SPOTIFY_ID, week],
  );
  if (tracks.length === 0) {
    console.error(`No plays of the developer's on or after ${week}; nothing to put in an issue.`);
    process.exitCode = 1;
    return;
  }

  // the album comes from the most played track that has one, and not one an earlier issue was already about
  const { rows: past } = await db.query("select album->>'collectionId' as id from issues where album is not null and week_start <> $1::date", [week]);
  const used = new Set(past.map((r) => r.id));
  const only = option("track");
  let album = null;
  let fresh = null;
  for (const t of tracks.filter((x) => !only || x.id === only)) {
    const found = await findAlbum(t.title, t.artist);
    if (!found) continue;
    found.spotifyAlbumId = t.albumId ?? null;
    if (!used.has(String(found.collectionId))) { album = found; break; }
    fresh ??= found;
  }
  album ??= fresh;
  if (!album) {
    console.error("None of this week's tracks could be matched to an album.");
    process.exitCode = 1;
    return;
  }

  const baseName = album.name.replace(/\s*[-–(].*$/, "").trim();
  // the album's article is named like the album and its text names the artist; the artist's article is named like the artist
  const albumWiki = await wikipedia(
    [`${baseName} ${album.artist} album`, `${baseName} ${album.artist} 앨범`],
    (title, text) => norm(title).includes(norm(baseName)) && norm(text).includes(norm(album.artist)),
  );
  const artistWiki = await wikipedia([`${album.artist} 가수`, album.artist], (title) => norm(title).startsWith(norm(album.artist)));
  const albumIntro = albumWiki ? { ...(await inKorean(albumWiki)) } : null;
  const artistIntro = artistWiki ? { ...(await inKorean(artistWiki)) } : null;
  if (albumIntro) albumIntro.text = shorten(albumIntro.text);
  if (artistIntro) artistIntro.text = shorten(artistIntro.text);

  if (!album.spotifyAlbumId) console.warn("note: no Spotify album id for this track yet, so the mail has no listen button (it is kept the next time the track is played)");
  const theme = themeFor(week);
  const title = `Superlike 주간 매거진 · ${album.name} — ${album.artist}`;
  await db.query(
    `insert into issues (week_start, title, tracks, album, theme, status) values ($1::date, $2, $3::jsonb, $4::jsonb, $5, 'draft')
     on conflict (week_start) do update set title = excluded.title, tracks = excluded.tracks, album = excluded.album, theme = excluded.theme`,
    [week, title, JSON.stringify(tracks), JSON.stringify({ ...album, albumIntro, artistIntro }), theme.name],
  );

  const { rows: [saved] } = await db.query("select *, week_start::text as week_text from issues where week_start = $1::date", [week]);
  const file = join(tmpdir(), `superlike-issue-${week}.html`);
  const preview = hydrate(saved);
  const faceUri = `data:image/png;base64,${(await face(preview.theme)).toString("base64")}`;
  writeFileSync(file, render(preview, option("as") ?? "닉네임", `${SITE}/subscribe?unsubscribe=PREVIEW`, faceUri).html);
  console.log(`${title}\ntheme: ${theme.name} · ${album.trackCount} tracks · picked from ${tracks.length} played this week`);
  console.log(`album intro : ${albumIntro ? `${albumIntro.title} (${albumIntro.lang}${albumIntro.summarized ? ", summarized" : ""}) ${albumIntro.url}` : "none found"}`);
  console.log(`artist intro: ${artistIntro ? `${artistIntro.title} (${artistIntro.lang}${artistIntro.summarized ? ", summarized" : ""}) ${artistIntro.url}` : "none found"}`);
  console.log(`\npreview: ${file}\nnext: npm run issue:send -- --to <your address>   then   npm run issue:send -- --confirm`);
}

/** A saved issue row, back into what render() reads. */
function hydrate(row) {
  const { albumIntro, artistIntro, ...album } = row.album;
  const theme = THEMES.find((t) => t.name === row.theme) ?? THEMES[0];
  return { title: row.title, tracks: row.tracks, album, albumIntro, artistIntro, theme, weekLabel: `${row.week_text} 주` };
}

function transport() {
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!GMAIL_USER || !pass) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD are not set.");
    process.exit(1);
  }
  return nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL_USER, pass } });
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
    "select id, title, tracks, album, theme, status, week_start::text as week_text from issues order by week_start desc limit 1",
  );
  if (!issue) {
    console.error("There is no draft. Run: npm run issue:draft");
    process.exitCode = 1;
    return;
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
  const { rows: subs } = await db.query("select email, token, nickname from subscribers where status = 'active' order by confirmed_at");
  console.log(`"${issue.title}" → ${subs.length} active subscribers`);
  if (!flag("confirm")) {
    subs.forEach((s) => console.log("  ", s.email));
    console.log("\nNothing sent. Add --confirm to send.");
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
}

try {
  await db.connect();
  await (command === "draft" ? draft() : send());
} catch (e) {
  console.error(`${command} failed:`, e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
