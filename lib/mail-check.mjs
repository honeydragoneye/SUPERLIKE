// The connections the weekly mail depends on, tried one by one without sending anything.
// Shared by `node scripts/issue.mjs check` (a terminal, or the GitHub Actions run) and the
// operator's 마이페이지 panel, so both answer the same question the same way.
// Values are never returned, only whether each one works and, if not, why.
import nodemailer from "nodemailer";
import pg from "pg";

export const NEEDED = ["DATABASE_URL", "OWNER_SPOTIFY_ID", "GMAIL_USER", "GMAIL_APP_PASSWORD", "LASTFM_API_KEY", "GEMINI_API_KEY", "SITE_URL"];

const reason = (e) => String(e?.message ?? e).split("\n")[0].slice(0, 160);

/** @returns {Promise<{ key: string, label: string, ok: boolean, detail: string, ms: number }[]>} */
export async function runChecks(env = process.env) {
  const site = (env.SITE_URL || "").trim().replace(/\/+$/, "");
  const results = [];
  const add = async (key, label, run) => {
    const t = Date.now();
    try {
      results.push({ key, label, ok: true, detail: (await run()) ?? "", ms: Date.now() - t });
    } catch (e) {
      results.push({ key, label, ok: false, detail: reason(e), ms: Date.now() - t });
    }
  };

  await add("values", `값 ${NEEDED.length}개 등록`, async () => {
    const missing = NEEDED.filter((k) => !env[k]?.trim());
    if (missing.length) throw new Error(`없는 값: ${missing.join(", ")}`);
    return NEEDED.join(" · ");
  });

  await add("database", "데이터베이스", async () => {
    if (!env.DATABASE_URL || !env.OWNER_SPOTIFY_ID) throw new Error("DATABASE_URL / OWNER_SPOTIFY_ID 없음");
    const client = new pg.Client({ connectionString: env.DATABASE_URL.replace("sslmode=require", "sslmode=verify-full"), connectionTimeoutMillis: 20_000 });
    await client.connect();
    try {
      const subs = await client.query("select count(*)::int as n from subscribers where status = 'active'").catch(() => null);
      const owner = await client.query("select 1 from users where spotify_id = $1", [env.OWNER_SPOTIFY_ID]);
      if (!owner.rowCount) throw new Error("연결은 됐지만 OWNER_SPOTIFY_ID가 가입된 계정이 아님");
      return subs ? `연결됨 · 구독자 ${subs.rows[0].n}명 · 소유자 계정 확인` : "연결됨 · 소유자 계정 확인";
    } finally {
      await client.end();
    }
  });

  await add("gmail", "Gmail 로그인", async () => {
    if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD 없음");
    await nodemailer.createTransport({ service: "gmail", auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } }).verify();
    return "로그인만 확인 (발송 안 함)";
  });

  await add("lastfm", "Last.fm", async () => {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${new URLSearchParams({ method: "chart.gettoptags", api_key: env.LASTFM_API_KEY ?? "", format: "json", limit: "1" })}`, { signal: AbortSignal.timeout(12_000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.message ?? `HTTP ${res.status}`);
    return "응답 정상";
  });

  await add("gemini", "Gemini 키", async () => {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": env.GEMINI_API_KEY ?? "" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} · 키를 다시 확인해 주세요`);
    return "모델 목록 조회 정상 (글은 쓰지 않음)";
  });

  await add("site", "사이트 주소 (SITE_URL)", async () => {
    if (!site) throw new Error("SITE_URL 없음");
    const res = await fetch(site, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return site.startsWith("https://") ? "https로 열림 · 메일 링크 정상" : "열림 · 단, https가 아니라 메일 링크가 http로 걸려요";
  });

  return results;
}
