// The magazine mail as HTML, shared by what sends it (scripts/issue.mjs) and what shows it on the
// site (GET /api/issues/[week]): one drawing, so the page is the mail as it was sent.
// No Node imports on purpose: it runs in a script and in a route alike.

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const albumLabel = (a) => `${a.name} — ${a.artist}`;

/** as tall and wide as the heading beside it */
export const FACE_PX = 30;
export const FACE_CID = "face@superlike";

/**
 * The eyes of the chat button on its round button, as SVG text: the disc takes the issue's ink
 * and the eyes its card colour. Placed low and left of centre, as in the app. A mail client
 * does not draw SVG, so the sender turns it into a PNG; the site shows it as it is.
 */
const EYES = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="7" cy="14.5" rx="3.5" ry="6" stroke="#FFFDF6" stroke-width="1.8"/><ellipse cx="17" cy="14.5" rx="3.5" ry="6" stroke="#FFFDF6" stroke-width="1.8"/><path d="M3.5 7.5C5.167 4.633 7.5 3.8 10.5 5" stroke="#FFFDF6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.5 7.5C18.833 4.633 16.5 3.8 13.5 5" stroke="#FFFDF6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.6" cy="16.3" r="1.7" fill="#FFFDF6"/><circle cx="16.6" cy="16.3" r="1.7" fill="#FFFDF6"/></svg>`;
export function faceSvg(theme) {
  // drawn at the size it is shown: some mail clients ignore width/height and show a picture as big as it is
  const k = FACE_PX / 119;
  const eyes = EYES.replaceAll("#FFFDF6", theme.card).replace(/<svg[^>]*>/, `<svg x="${12.3 * k}" y="${38.4 * k}" width="${60 * k}" height="${60 * k}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FACE_PX}" height="${FACE_PX}" viewBox="0 0 ${FACE_PX} ${FACE_PX}"><circle cx="${FACE_PX / 2}" cy="${FACE_PX / 2}" r="${FACE_PX / 2}" fill="${theme.ink}"/>${eyes}</svg>`;
}

/** "2026-12-07" → "2026년 12월호" */
export const monthLabel = (week) => `${week.slice(0, 4)}년 ${Number(week.slice(5, 7))}월호`;

export function render(issue, who, unsubscribeUrl, faceSrc, web = false) {
  const t = issue.theme;
  const m = issue.magazine;
  const s = m.season;
  const x = m.text;
  const block = (title, body) =>
    `<tr><td style="padding:30px 28px 0"><div style="font-size:11px;letter-spacing:1.5px;color:${t.sub};font-weight:700">${title}</div>${body}</td></tr>`;
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

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${web ? '<base target="_blank">' : ""}</head><body style="margin:0;background:${t.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${t.card};font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:${t.ink}">
  <tr><td style="padding:26px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px"><img src="${esc(faceSrc)}" width="${FACE_PX}" height="${FACE_PX}" alt="" style="display:block;width:${FACE_PX}px;height:${FACE_PX}px;border-radius:${FACE_PX / 2}px"></td>
      <td style="font-size:22px;line-height:30px;letter-spacing:2px;font-weight:800;color:${t.sub}">SUPERLIKE® · MAGAZINE</td>
    </tr></table>
    <div style="margin-top:6px;font-size:12px;color:${t.sub}">${esc(issue.monthLabel)} · ${esc(s.name)}</div>
    <h1 style="margin:14px 0 0;font-size:30px;line-height:1.25;letter-spacing:-1px">${who ? `${esc(who)}님,<br>` : ""}${esc(x.headline || s.line)}</h1>
  </td></tr>
  ${block("COVER STORY", "")}
  ${hero}
  ${cover}
  ${m.albums.length ? block("ALBUMS OF THE MONTH", albums) : ""}
  ${songs ? block(`PLAYLIST · ${m.songs.length} SONGS`, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${songs}</table><div style="margin-top:8px;font-size:10px;color:${t.sub}">출처 Last.fm · ${esc(s.tag)} 태그 인기 곡</div>`) : ""}
  ${radios ? block("ON AIR · 틀어 두기 좋은 라디오", radios) : ""}
  ${releases ? block("NEW THIS WEEK", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${releases}</table><div style="margin-top:8px;font-size:10px;color:${t.sub}">출처 Apple Music · 최근 발매</div>`) : ""}
  <tr><td style="padding:32px 28px;font-size:12px;line-height:1.6;color:${t.sub}">${esc(issue.monthLabel)} 매거진입니다.${unsubscribeUrl ? `<br><a href="${esc(unsubscribeUrl)}" style="color:${t.sub}">구독 해지</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`;

  const text =
    `${who ? `${who}님, ` : ""}${x.headline || s.line}\n${issue.monthLabel} · ${s.name}\n\n` +
    (x.cover ? `[커버 스토리]\n${x.cover}\n— ${x.auto ? "Superlike" : "용눈이"}\n\n` : "") +
    m.albums.map((a, i) => `[앨범] ${albumLabel(a)}\n${a.intro ? a.intro.text + `\n(출처 Wikipedia ${a.intro.url})\n` : ""}${x.albumNotes[i] ? x.albumNotes[i] + "\n" : ""}듣기: ${a.link}\n\n`).join("") +
    (m.songs.length ? `[플레이리스트]\n${m.songs.map((n, i) => `${i + 1}. ${n.title} — ${n.artist}`).join("\n")}\n\n` : "") +
    (m.radios.length ? `[라디오]\n${m.radios.map((r) => `${r.name}: ${r.url}`).join("\n")}\n\n` : "") +
    (m.releases.length ? `[이번 주 신보]\n${m.releases.map((r) => `${r.date.replace("-", ".")} ${r.title} — ${r.artist}`).join("\n")}\n\n` : "") +
    (unsubscribeUrl ? `해지: ${unsubscribeUrl}\n` : "");
  return { text, html };
}

/** A saved issue row, back into what render() reads. */
export function hydrate(row) {
  if (!row.magazine) throw new Error("this draft was made before the magazine layout; run npm run issue:draft again");
  const s = row.magazine.season;
  const theme = { bg: s.bg, card: s.card, panel: s.panel, sub: s.sub, ink: "#ffffff" };
  return { title: row.title, tracks: row.tracks, magazine: row.magazine, theme, monthLabel: monthLabel(row.week_text) };
}

