"use client";

import { useDetail } from "@/components/detail/use-detail";
import type { About } from "@/lib/about";
import type { ArtistPage } from "@/lib/data";
import { followersLabel } from "@/lib/suggest";
import { AboutBlock, type Fact } from "./about-block";
import { ReleaseTimeline } from "./release-timeline";
import { RailLabel, RailShell } from "./rail-shell";

/**
 * Beside an artist: who they are in a few sentences, then every release in the
 * order it came out. The artist is the one the screen already fetched — the two
 * share the request (use-detail).
 */
export function ArtistRail({ id }: { id: string }) {
  const { data } = useDetail<ArtistPage>(`/api/spotify/artist/${id}`);
  const about = useDetail<About>(data ? `/api/about/artist?name=${encodeURIComponent(data.name)}` : null);

  const facts: Fact[] = [];
  if (data?.followers) facts.push(["팔로워", followersLabel(data.followers)]);
  if (about.data?.listeners) facts.push(["Last.fm 청취자", `${about.data.listeners.toLocaleString("ko-KR")}명`]);
  if (data?.genres.length) facts.push(["장르", data.genres.slice(0, 3).join(" · ")]);

  if (!data) return <RailShell>{null}</RailShell>;
  return (
    <RailShell>
      <AboutBlock label="ABOUT" title={data.name} about={about.data} loading={about.loading} facts={facts} />
      <div className="flex shrink-0 flex-col gap-[8px]">
        <RailLabel>DISCOGRAPHY · 발매 순서</RailLabel>
        <ReleaseTimeline albums={data.albums} />
      </div>
    </RailShell>
  );
}
