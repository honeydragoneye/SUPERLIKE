/**
 * Takes the screenshots in /public/manual that the 이용 안내 page shows.
 *
 * Needs `npm run dev` on :3000 and Google Chrome. Every account call is faked in
 * the page (a signed-in listener, a player that is playing, a station, a chat
 * answer), so the shots show the real screens with made-up listening and no
 * private data; the covers come from the live new-release charts.
 *
 *   node scripts/manual-shots.mjs            # all of them
 *   node scripts/manual-shots.mjs home chat  # only these
 *
 * The photo-heavy ones are saved as PNG and then turned into JPEG by hand
 * (`sips -s format jpeg -s formatOptions 84`): layout, home, dark and chat.
 * After a screen changes, retake its shot and keep `ratio` in
 * components/manual/content.ts in step with the printed width / height.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";

const OUT = new URL("../public/manual", import.meta.url).pathname;
const only = process.argv.slice(2);
const want = (n) => only.length === 0 || only.includes(n);
const BASE = "http://localhost:3000";

// real covers from the live charts, so the shots look like the app and not like boxes
let rel;
try { rel = (await (await fetch(BASE + "/api/releases?country=KR")).json()).albums;  } catch {}
if (!Array.isArray(rel)) throw new Error("the releases endpoint did not answer; is the dev server up?");
const C = rel.slice(0, 12).map((a) => ({ id: a.id, name: a.title.replace(/ - EP$/, ""), artist: a.artist, art: a.artwork }));

const track = (i, n = i) => ({
  id: "t" + i,
  uri: "spotify:track:t" + i,
  name: C[n % C.length].name,
  artist: C[n % C.length].artist,
  album: C[n % C.length].name,
  artwork: C[n % C.length].art,
  artworkLarge: C[n % C.length].art,
  durationMs: 200000 + i * 7000,
  explicit: false,
  popularity: 70,
  previewUrl: null,
  albumId: "b" + i,
  artistId: "a" + i,
});
const FIX = {
  releasesFirst: C,
  me: { id: "myseo", name: "myseo", avatar: null, product: "premium" },
  taste: {
    ready: true, days: 28, minPlays: 5, totalPlays: 74,
    artists: C.slice(0, 5).map((c, i) => ({ name: c.artist, plays: 20 - i * 3 })),
    recs: C.slice(5, 10).map((c) => ({ title: c.name, artist: c.artist, because: C[0].artist })),
    recsError: null,
  },
  albums: C.slice(0, 7).map((c, i) => ({ id: "b" + i, name: c.name, artwork: c.art, artist: c.artist, playedAt: Date.now() - i * 3600000, day: "2026-10-28" })),
  likes: C.slice(2, 9).map((c, i) => ({ id: "l" + i, albumId: "b" + i, uri: "spotify:track:l" + i, title: c.name, artist: c.artist, artwork: c.art, durationMs: 210000, at: Date.now() - i * 86400000 })),
  playlists: [
    ["밤에 듣는 노래", 12, "#8b2f1d", "#3a0f08", "#d9b45a"], ["드라이브", 34, "#1f4e79", "#0b2036", "#7fb7e6"], ["가사 없는 집중용", 8, "#2f5d3a", "#10281a", "#a9d18e"], ["운동할 때", 21, "#6b2d6e", "#2a0f2c", "#e6a0e8"], ["새벽 감성", 15, "#3b3f58", "#14162a", "#9aa3e0"], ["출근길", 9, "#7a5a1f", "#2f220a", "#f0cf7a"], ["주말 오후", 17, "#7a2f3c", "#2e0f16", "#f0a0b0"],
  ].map(([name, n, bg, bgDeep, disc], i) => ({ id: "p" + i, name, isPublic: false, updatedAt: new Date(Date.now() - i * 86400000).toISOString(), palette: { bg, bgDeep, disc }, count: n, has: false })),
  follows: C.slice(0, 3).map((c, i) => ({ id: "ar" + i, name: c.artist, image: c.art, followedAt: new Date(Date.now() - (i + 5) * 86400000).toISOString(), lastRelease: "2026-10-" + (24 - i * 3) })),
  updates: C.slice(0, 6).map((c, i) => ({ id: String(900 + i), title: c.name, kind: i % 3 === 2 ? "single" : i % 3 === 1 ? "ep" : "album", releaseDate: "2026-10-" + String(24 - i * 3).padStart(2, "0"), artwork: c.art, artist: c.artist, artistId: "ar" + (i % 3), unread: i < 2 })),
  search: (q) => ({
    query: q,
    tracks: [...(/track:"([^"]+)"/.exec(q) ? C.filter((c) => c.name === /track:"([^"]+)"/.exec(q)[1] || c.name.startsWith(/track:"([^"]+)"/.exec(q)[1])).map((c) => ({ id: "x" + c.id, uri: "spotify:track:x" + c.id, name: c.name, artist: c.artist, album: c.name, artwork: c.art, artworkLarge: c.art, durationMs: 200000, explicit: false, popularity: 70, previewUrl: null, albumId: "b0", artistId: "a0" })) : []), ...Array.from({ length: 8 }, (_, i) => track(i, i))],
    albums: C.slice(0, 4).map((c, i) => ({ id: "b" + i, uri: "spotify:album:b" + i, name: c.name, artist: c.artist, artwork: c.art, releaseDate: "2026-10-1" + i, totalTracks: 6, albumType: "album" })),
    artists: [{ id: "a0", uri: "spotify:artist:a0", name: C[0].artist, image: C[0].art, genres: ["k-pop"], followers: 2400000, popularity: 80 }],
    playlists: [],
  }),
  recent: C.slice(0, 12).map((c, i) => ({ index: String(i + 1).padStart(2, "0"), title: c.name, artist: c.artist, artwork: c.art, artworkLarge: c.art, playedAt: new Date(Date.now() - i * 5400000).toISOString(), durationMs: 200000, uri: "spotify:track:r" + i })),
  stationQueue: C.slice(1, 11).map((c, i) => ({ id: "s" + i, uri: "spotify:track:s" + i, name: c.name, artist: c.artist, artwork: c.art, durationMs: 190000 + i * 5000, lfmKey: "k" + i })),
  stations: [
    { uuid: "u1", name: "SomaFM Indie Pop Rocks!", country: "United States", countryCode: "US", tags: ["indie", "indie pop"], favicon: null, votes: 1200, language: "english", homepage: "https://somafm.com" },
    { uuid: "u2", name: "KBS Cool FM", country: "South Korea", countryCode: "KR", tags: ["k-pop", "korean"], favicon: null, votes: 900, language: "korean", homepage: null },
    { uuid: "u3", name: "BOX : Japan City Pop", country: "Japan", countryCode: "JP", tags: ["city pop", "japanese"], favicon: null, votes: 700, language: "japanese", homepage: null },
  ],
};

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=9371", "--user-data-dir=" + fs.mkdtempSync("/tmp/superlike-manual-"), "--no-first-run", "about:blank"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const t = (await (await fetch("http://127.0.0.1:9371/json")).json()).find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = {};
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable");
await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*sdk.scdn.co*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
const FIX = ${JSON.stringify({ ...FIX, search: undefined })};
const track = ${track.toString()};
const C = FIX.releasesFirst;
const search = ${FIX.search.toString().replace(/C\b/g, "FIX.releasesFirst")};
const real = window.fetch.bind(window);
window.__plays = [];
const json = (b, s = 200) => Promise.resolve(new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } }));
window.fetch = (u, o) => {
  const url = String(u);
  if (url.includes("/api/spotify/token")) return json({ accessToken: "x" });
  if (url.includes("/api/spotify/me/recently-played")) return json({ tracks: FIX.recent });
  if (url.includes("/api/spotify/me")) return json(FIX.me);
  if (url.includes("/api/me/taste")) return json(FIX.taste);
  if (url.includes("/api/me/albums")) return json({ albums: FIX.albums });
  if (url.includes("/api/me/likes")) return json({ tracks: FIX.likes });
  { const id = url.includes("/api/me/playlists/") ? url.split("/api/me/playlists/")[1].split(/[/?]/)[0] : null; if (id) { const p = FIX.playlists.find((x) => x.id === id); return p ? json({ id: p.id, name: p.name, isPublic: p.isPublic, tracks: C.slice(0, 8).map((c, i) => ({ id: "t" + i, uri: "spotify:track:t" + i, title: c.name, artist: c.artist, artwork: c.art, durationMs: 190000 + i * 7000, albumId: null })) }) : json({ error: "not_found" }, 404); } }
  if (url.includes("/api/me/playlists")) return json({ playlists: FIX.playlists });
  if (url.includes("/api/me/artist-follows")) return json(o && o.method === "POST" ? { ok: true } : { artists: FIX.follows });
  if (url.includes("/api/me/updates")) return json(o && o.method === "POST" ? { ok: true } : { items: FIX.updates, unread: 2, following: 3, checkedAt: new Date().toISOString(), checkError: false });
  if (url.includes("/api/me/plays")) return json({ ok: true });
  if (url.includes("/api/me/chats")) return json({ chats: [] });
  if (url.includes("/api/me/radio")) return json({ stations: FIX.stations.slice(0, 4).map((s, i) => ({ ...s, favoritedAt: Date.now() - (i + 2) * 86400000, lastPlayedAt: i === 3 ? null : Date.now() - i * 86400000 })) });
  if (url.includes("/api/radio/recommend")) return json({ ready: true, tags: ["indie", "k-pop", "city pop"], stations: FIX.stations });
  if (url.includes("/api/station/queue")) return json({ candidates: FIX.stationQueue, tags: ["pop", "dance pop", "disco"], stages: [], exhausted: false, lastfmError: null, moodError: null, moodMs: 0, genrePage: 1 });
  if (url.includes("/api/spotify/search")) return json(search(decodeURIComponent((url.split("q=")[1] || "").split("&")[0])));
  if (url.includes("/api/spotify/play") || url.includes("/api/spotify/player")) { window.__plays.push(url); return json({ ok: true }); }
  if (url.includes("/api/agent")) {
    const ev = (o) => "data: " + JSON.stringify(o) + "\\n\\n";
    const body = ev({ type: "tool_call", name: "top_tracks", arguments: { tag: "indie" } }) +
      ev({ type: "tool_result", name: "top_tracks", result: { checked: 20, tracks: FIX.releasesFirst.slice(4, 9).map((c) => ({ title: c.name, artist: c.artist })) } }) +
      ev({ type: "token", data: "차분한 분위기의 곡들로 골랐어요. 잔잔한 보컬과 어쿠스틱한 편곡이 어울리는 곡 위주예요." });
    return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
  }
  return real(u, o);
};
class Player {
  constructor() { this.l = {}; window.__player = this; return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => Promise.resolve(null)) }); }
  addListener(e, cb) { (this.l[e] = this.l[e] || []).push(cb); return true; }
  removeListener() { return true; }
  async connect() { setTimeout(() => { (this.l.ready || []).forEach((f) => f({ device_id: "dev1" })); }, 50); return true; }
  disconnect() {}
  emit(s) { (this.l.player_state_changed || []).forEach((f) => f(s)); }
}
window.Spotify = { Player };
window.__nowState = () => {
  const mk = (n) => { const c = FIX.releasesFirst[n % FIX.releasesFirst.length]; return { uri: "spotify:track:n" + n, name: c.name, artists: [{ name: c.artist, uri: "spotify:artist:a" + n }], album: { name: c.name, uri: "spotify:album:b" + n, images: [{ url: c.art }] }, duration_ms: 214000 }; };
  return { paused: false, position: 102000, duration: 214000, shuffle: false, repeat_mode: 0, track_window: { current_track: mk(0), next_tracks: [mk(1), mk(2), mk(3), mk(4)], previous_tracks: [] } };
};
` });

const shot = async (name, clip, { dsf = 1.5, full = false } = {}) => {
  const r = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: full });
  const file = `${OUT}/${name}.png`;
  fs.writeFileSync(file, Buffer.from(r.data, "base64"));
  console.log(name, Math.round(clip.width * dsf), "x", Math.round(clip.height * dsf), "ratio", (clip.width / clip.height).toFixed(4));
};
const open = async (path, { theme = "light", h = 982, w = 1512, dsf = 1.5 } = {}) => {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dsf, mobile: false });
  await send("Page.navigate", { url: BASE + "/" });
  await wait(1500);
  await ev(`localStorage.setItem("superlike-theme","${theme}")`);
  await send("Page.navigate", { url: BASE + path });
  await wait(7000);
  await ev(`window.__player && window.__player.emit(window.__nowState())`);
  await wait(1500);
  // the dev server's own badge would end up in the corner of every shot
  await ev(`document.querySelectorAll("nextjs-portal").forEach((e) => e.remove())`);
};

if (want("layout")) { await open("/"); await shot("layout", { x: 0, y: 0, width: 1512, height: 982 }); }
if (want("home")) {
  await open("/", { h: 2000 });
  await shot("home", { x: 0, y: 114, width: 1182, height: 1500 });
}
if (want("bell")) {
  await open("/");
  await ev(`document.querySelector('button[aria-label^="소식"]')?.click()`);
  await wait(800);
  await shot("bell", { x: 912, y: 0, width: 600, height: 420 });
}
if (want("search")) { await open("/search?q=" + encodeURIComponent(C[0].artist)); await shot("search", { x: 0, y: 114, width: 1512, height: 796 }); }
if (want("player")) { await open("/"); await shot("player", { x: 0, y: 910, width: 1512, height: 72 }); }
if (want("mypage")) { await open("/mypage?playlist=p0", { h: 2000 }); await shot("mypage", { x: 0, y: 114, width: 1512, height: 1814 }); }
if (want("dark")) { await open("/", { theme: "dark" }); await shot("dark", { x: 0, y: 0, width: 1512, height: 982 }); }
if (want("radio")) {
  await open("/");
  await ev(`[...document.querySelectorAll("button")].find(b=>/다른 방송국/.test(b.textContent))?.click()`);
  await wait(1500);
  await shot("radio", { x: 0, y: 0, width: 1512, height: 300 });
}
if (want("station")) {
  await open("/search?q=" + encodeURIComponent(C[0].artist));
  console.log("click", await ev(`(()=>{const bs=[...document.querySelectorAll("button")].filter(x=>/^STATION$/.test(x.textContent.trim())); if(bs[0]){bs[0].click();return "clicked "+bs.length+" disabled="+bs[0].disabled+" aria="+bs[0].getAttribute("aria-disabled")} return "none"})()`));
  await wait(5000);
  await ev(`window.__player && window.__player.emit(window.__nowState())`);
  await wait(1000);
  await ev(`[...document.querySelectorAll("button")].find(x=>/UP NEXT/.test(x.textContent))?.click()`);
  await wait(800);
  console.log("open", await ev(`(()=>{const b=document.querySelector('[title="스테이션 화면 열기"]'); if(b){b.click(); return "ok"} return "no station button; plays="+JSON.stringify(window.__plays)})()`));
  await wait(3000);
  console.log("url", await ev("location.pathname"));
  await shot("station", { x: 0, y: 114, width: 1512, height: 796 });
}
if (want("chat")) {
  await open("/");
  await ev(`document.querySelector('button[aria-label="챗봇"]')?.click()`);
  await wait(1500);
  await ev(`(()=>{const i=document.querySelector("textarea, input[placeholder]"); return i? i.tagName+":"+i.placeholder : "no input"})()`);
  await ev(`(()=>{const i=[...document.querySelectorAll("textarea, input")].find(x=>/물어/.test(x.placeholder||"")); if(!i) return; const proto=i.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(i,"비 오는 날 듣기 좋은 인디 추천해줘"); i.dispatchEvent(new Event("input",{bubbles:true})); i.form?.requestSubmit?.();})()`);
  await wait(6000);
  await shot("chat", { x: 752, y: 114, width: 760, height: 796 });
}
chrome.kill();
process.exit(0);
