import { NextResponse } from "next/server";
import { clearTokens } from "@/lib/spotify/tokens";

export async function POST() {
  const res = NextResponse.json({ connected: false });
  clearTokens(res);
  return res;
}
