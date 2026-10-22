"use client";

import { useDetail } from "@/components/detail/use-detail";
import type { About } from "@/lib/about";
import type { AlbumPage, ArtistPage } from "@/lib/data";
import { releaseLabel } from "@/lib/time";
import { AboutBlock, type Fact } from "./about-block";
import { ReleaseTimeline } from "./release-timeline";
import { RailLabel, RailShell } from "./rail-shell";

/**
 * Beside an album: what it is, and where it sits among the artist's releases.
 *
 * The timeline needs the artist's discography, which the album does not carry,
 * so the artist is fetched after the album names them.
 */
export function AlbumRail({ id }: { id: string }) {
  const { data: album } = useDetail<AlbumPage>(`/api/spotify/album/${id}`);
  const artist = album?.artists[0] ?? null;
  const about = useDetail<About>(
    album && artist
      ? `/api/about/album?name=${encodeURIComponent(album.name)}&artist=${encodeURIComponent(artist.name)}`
      : null,
  );
  const discography = useDetail<ArtistPage>(artist ? `/api/spotify/artist/${artist.id}` : null);

  const minutes = album ? Math.round(album.tracks.reduce((sum, t) => sum + t.durationMs, 0) / 60_000) : 0;
  const genres = about.data?.tags.length ? about.data.tags : (discography.data?.genres.slice(0, 3) ?? []);
  const facts: Fact[] = [];
  if (album) {
    facts.push(["발매일", releaseLabel(album.releaseDate, album.releaseDatePrecision)]);
    if (album.label) facts.push(["레이블", album.label]);
    facts.push(["수록", minutes ? `${album.totalTracks}곡 · ${minutes}분` : `${album.totalTracks}곡`]);
    if (genres.length) facts.push(["장르", genres.join(" · ")]);
  }

  if (!album) return <RailShell>{null}</RailShell>;
  return (
    <RailShell>
      <AboutBlock label="ABOUT THE ALBUM" title={album.name} about={about.data} loading={about.loading} facts={facts} />
      {artist && (
        <div className="flex shrink-0 flex-col gap-[8px]">
          <RailLabel>MORE BY {artist.name} · 발매 순서</RailLabel>
          {discography.data ? (
            <ReleaseTimeline albums={discography.data.albums} currentId={album.id} />
          ) : (
            <p className="text-[10px] font-medium text-on-bright-muted">{discography.error ?? "불러오는 중"}</p>
          )}
        </div>
      )}
    </RailShell>
  );
}
