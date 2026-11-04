export const NEEDED: string[];
export type MailCheck = { key: string; label: string; ok: boolean; detail: string; ms: number };
export function runChecks(env?: Record<string, string | undefined>): Promise<MailCheck[]>;
