import { Suspense } from "react";
import type { Metadata } from "next";
import { Hanken_Grotesk, Noto_Sans_KR } from "next/font/google";
import { SpotifyProvider } from "@/components/player/spotify-provider";
import { RadioProvider } from "@/components/radio/radio-provider";
import { SearchProvider } from "@/components/search/search-provider";
import { AppShell } from "@/components/app-shell";
import { ChatProvider } from "@/components/chat/chat-provider";
import { LyricsViewProvider } from "@/components/lyrics/lyrics-view";
import { SearchFocusProvider } from "@/components/search/search-focus";
import { InlineScript } from "@/components/theme/inline-script";
import { THEME_SCRIPT } from "@/components/theme/use-theme";
import "./globals.css";

/**
 * English and numerals. Hanken Grotesk has no Hangul, so the stack below falls
 * through to Noto Sans KR for every Korean character, glyph by glyph: one
 * sentence can carry both without either font being asked for what it lacks.
 */
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken-grotesk",
  display: "swap",
});

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Superlike",
  description:
    "Superlike 디스커버리 홈. 현재 재생 중인 트랙, 실시간 차트, 신보와 큐레이션을 한 화면에.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme is set by the script below before the first paint, so the server's markup never has it
    <html lang="ko" className={`${hankenGrotesk.variable} ${notoSansKR.variable}`} suppressHydrationWarning>
      <head>
        <InlineScript html={THEME_SCRIPT} />
      </head>
      <body className="font-[family-name:var(--font-hanken-grotesk),var(--font-noto-sans-kr)] font-bold">
        <SpotifyProvider>
          <RadioProvider>
            {/* the search query lives in the URL, and reading it opts the tree
                into client rendering — the boundary keeps that from failing the
                prerender of pages that have no query at all, like 404 */}
            <Suspense fallback={<div className="h-screen w-full bg-shell" />}>
              <SearchProvider>
                <LyricsViewProvider>
                  <ChatProvider>
                    <SearchFocusProvider>
                      <AppShell>{children}</AppShell>
                    </SearchFocusProvider>
                  </ChatProvider>
                </LyricsViewProvider>
              </SearchProvider>
            </Suspense>
          </RadioProvider>
        </SpotifyProvider>
      </body>
    </html>
  );
}
