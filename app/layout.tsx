import { Suspense } from "react";
import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { SpotifyProvider } from "@/components/player/spotify-provider";
import { SearchProvider } from "@/components/search/search-provider";
import { AppShell } from "@/components/app-shell";
import { LyricsViewProvider } from "@/components/lyrics/lyrics-view";
import { SearchFocusProvider } from "@/components/search/search-focus";
import "./globals.css";

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
    <html lang="ko" className={notoSansKR.variable}>
      <body className="font-[family-name:var(--font-noto-sans-kr)] font-bold">
        <SpotifyProvider>
          {/* the search query lives in the URL, and reading it opts the tree
              into client rendering — the boundary keeps that from failing the
              prerender of pages that have no query at all, like 404 */}
          <Suspense fallback={<div className="h-screen w-full bg-shell" />}>
            <SearchProvider>
              <LyricsViewProvider>
                <SearchFocusProvider>
                  <AppShell>{children}</AppShell>
                </SearchFocusProvider>
              </LyricsViewProvider>
            </SearchProvider>
          </Suspense>
        </SpotifyProvider>
      </body>
    </html>
  );
}
