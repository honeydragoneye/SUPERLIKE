import { randomBytes } from "node:crypto";
import { escapeHtml, sendMail, siteUrl } from "@/lib/mail";
import { query } from "./client";

/** what a subscriber is called in the mails: short, one line, no markup */
export function cleanNickname(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
  return name.length >= 1 && name.length <= 20 ? name : null;
}

export const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
/** one confirmation mail per address per this long */
const RESEND_AFTER_SECONDS = 60;

type Row = { id: string; status: "pending" | "active" | "unsubscribed"; token: string; wait: number | null };

export type SubscribeResult = "mailed" | "already" | "wait";

/**
 * Starts a subscription: the address is saved as pending and a confirmation
 * mail goes out. Nothing is sent to it until the link in that mail is opened
 * (double opt-in), so the form cannot be used to put someone else on the list.
 */
export async function subscribe(email: string, nickname: string): Promise<SubscribeResult> {
  const address = email.trim().toLowerCase();
  const rows = await query<Row>(
    `select id, status, token,
            extract(epoch from (now() - last_mailed_at))::int as wait
       from subscribers where email = $1`,
    [address],
  );
  const known = rows[0];
  if (known?.status === "active") return "already";
  if (known && known.wait !== null && known.wait < RESEND_AFTER_SECONDS) return "wait";

  const token = randomBytes(24).toString("hex");
  await query(
    `insert into subscribers (email, status, token, nickname) values ($1, 'pending', $2, $3)
     on conflict (email) do update set status = 'pending', token = excluded.token, nickname = excluded.nickname`,
    [address, token, nickname],
  );
  const link = `${siteUrl()}/subscribe?confirm=${token}`;
  await sendMail(
    address,
    "Superlike 구독을 확인해 주세요",
    `${nickname}님, Superlike 주간 매거진 구독을 신청하셨습니다.\n아래 링크를 열어 구독을 확인해 주세요.\n${link}\n\n신청하지 않으셨다면 이 메일을 무시하세요. 확인 전에는 아무것도 보내지 않습니다.`,
    `<p>${escapeHtml(nickname)}님, Superlike 주간 매거진 구독을 신청하셨습니다.</p>
     <p><a href="${escapeHtml(link)}">구독 확인하기</a></p>
     <p style="color:#666;font-size:12px">신청하지 않으셨다면 이 메일을 무시하세요. 확인 전에는 아무것도 보내지 않습니다.</p>`,
  );
  await query("update subscribers set last_mailed_at = now() where email = $1", [address]);
  return "mailed";
}

const TOKEN = /^[0-9a-f]{48}$/;
export const validToken = (t: unknown): t is string => typeof t === "string" && TOKEN.test(t);

/** Confirms (the link in the mail) or ends (the link at the bottom of every issue) a subscription. */
export async function settle(token: string, to: "active" | "unsubscribed"): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `update subscribers
        set status = $2,
            confirmed_at = case when $2 = 'active' then now() else confirmed_at end
      where token = $1 and (status = 'pending' or $2 = 'unsubscribed' or status = 'active')
      returning id`,
    [token, to],
  );
  return rows.length > 0;
}
