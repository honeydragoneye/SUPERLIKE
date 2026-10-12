import { Placeholder } from "@/components/detail/placeholder";

/**
 * Where the rail's ARTIST OF THE WEEK block lands.
 *
 * Routed and empty on purpose, like the signup screen. Kept apart from
 * `/artist/[id]`: that screen is one Spotify artist, and this one is the
 * feature written around whoever is chosen — which may link there, but is not
 * the same page.
 */
export default function WeeklyArtist() {
  return (
    <Placeholder
      eyebrow="ARTIST OF THE WEEK"
      title="이번 주 아티스트"
      subtitle="매주 한 팀을 골라 소개합니다"
    />
  );
}
