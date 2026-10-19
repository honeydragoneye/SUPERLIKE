import nodemailer, { type Transporter } from "nodemailer";

/**
 * Mail goes out through a Gmail account's SMTP with an app password: no domain
 * of our own is needed, at the price of Gmail's daily sending cap (about 500).
 *
 * Server only: GMAIL_APP_PASSWORD must never reach a client component.
 */
export class MailNotConfiguredError extends Error {
  constructor() {
    super("GMAIL_USER / GMAIL_APP_PASSWORD are not set");
    this.name = "MailNotConfiguredError";
  }
}

const globalForMail = globalThis as unknown as { superlikeMail?: Transporter };

function transport(): Transporter {
  if (globalForMail.superlikeMail) return globalForMail.superlikeMail;
  const user = process.env.GMAIL_USER;
  // Google shows the password in groups of four; the spaces are not part of it
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) throw new MailNotConfiguredError();
  globalForMail.superlikeMail = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  return globalForMail.superlikeMail;
}

/** The address the links inside mails point to. */
export function siteUrl(): string {
  return (process.env.SITE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
}

export function mailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<void> {
  await transport().sendMail({
    from: `Superlike <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
