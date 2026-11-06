"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadPeople, usePeopleState } from "@/components/people/people-store";
import { PersonFollowButton } from "@/components/people/person-follow-button";
import { useSpotify } from "@/components/player/spotify-provider";
import { AlbumMore, TrackMore } from "@/components/ui/more-menu";
import type { Profile, ProfileAlbum, ProfilePlaylist, ProfileSong } from "@/lib/db/people";
import { DetailStatus } from "./detail-shell";
import { useDetail } from "./use-detail";

const PILL = "shrink-0 whitespace-nowrap rounded-pill px-[14px] py-[8px] text-[9px] tracking-[0.7px]";
const BANNERS = ["#4a5a7a", "#5b4a6e", "#3f5f5a", "#6a4f4b", "#4d5568", "#58605a"];
const bannerOf = (name: string) => BANNERS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % BANNERS.length];

/** Songs as rows: a press plays from that row on, and ··· opens the song's menu. */
function SongList({ songs }: { songs: ProfileSong[] }) {
  const { play } = useSpotify();
  const rows = songs.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork, durationMs: t.durationMs }));
  return (
    <ul className="flex flex-col">
      {songs.map((t, i) => (
        <li key={`${t.id}-${i}`} className="group relative rule-b track-row">
          <button
            type="button"
            onClick={() => void play({ uris: rows.map((r) => r.uri).slice(i), tracks: rows.slice(i) })}
            className="flex h-[52px] w-full cursor-pointer items-center gap-[12px] pr-[40px] text-left"
          >
            <span className="tnum w-[24px] shrink-0 text-[12px] font-black text-on-bright-muted">{String(i + 1).padStart(2, "0")}</span>
            <span className="relative size-[40px] shrink-0 overflow-hidden rounded-[4px] bg-artwork">
              {t.artwork && <Image src={t.artwork} alt="" fill sizes="40px" className="object-cover" unoptimized />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-[9px] text-on-bright-muted">{t.artist}</span>
              <span className="truncate text-[13px]">{t.title}</span>
            </span>
          </button>
          <TrackMore
            className="absolute right-[8px] top-1/2 -translate-y-1/2"
            track={{ id: t.id, uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork, durationMs: t.durationMs }}
          />
        </li>
      ))}
    </ul>
  );
}

/** The albums of the songs they played lately; a cover opens the album. */
function Albums({ albums }: { albums: ProfileAlbum[] }) {
  return (
    <section className="flex w-full shrink-0 flex-col gap-[10px]">
      <h3 className="text-[15px] font-black tracking-[-0.3px]">최근 들은 앨범</h3>
      {albums.length === 0 ? (
        <p className="text-[10px] text-on-bright-muted">Superlike에서 들은 앨범이 아직 없어요.</p>
      ) : (
        <div className="scroll-x flex w-full gap-[12px] pb-[6px]">
          {albums.map((a) => (
            <article key={a.id} className="group flex w-[150px] shrink-0 flex-col gap-[6px]">
              <Link href={`/album/${a.id}`} title={`${a.name} · ${a.artist}`} className="relative aspect-square w-full overflow-hidden rounded-[4px] bg-artwork">
                {a.artwork && <Image src={a.artwork} alt="" fill sizes="150px" className="object-cover" unoptimized />}
              </Link>
              <div className="flex items-center gap-[2px]">
                <Link href={`/album/${a.id}`} title={`${a.name} · ${a.artist}`} className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="truncate text-[12px]">{a.name}</span>
                  <span className="truncate text-[9px] text-on-bright-muted">{a.artist}</span>
                </Link>
                <AlbumMore title={a.name} albumId={a.id} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** The playlists they made public. One opens at a time, to show its songs under it. */
function Playlists({ playlists, self }: { playlists: ProfilePlaylist[]; self: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="flex w-full shrink-0 flex-col gap-[10px]">
      <h3 className="text-[15px] font-black tracking-[-0.3px]">공개 플레이리스트</h3>
      {playlists.length === 0 ? (
        <p className="text-[10px] text-on-bright-muted">
          {self ? "공개로 바꾼 플레이리스트가 아직 없어요. 마이페이지의 플레이리스트에서 공개로 바꿀 수 있어요." : "공개한 플레이리스트가 아직 없어요."}
        </p>
      ) : (
        <ul className="flex flex-col border-t-[1.5px] border-rule">
          {playlists.map((p) => {
            const on = open === p.id;
            return (
              <li key={p.id} className="rule-b">
                <button
                  type="button"
                  aria-expanded={on}
                  onClick={() => setOpen(on ? null : p.id)}
                  className="track-row flex h-[60px] w-full cursor-pointer items-center gap-[12px] text-left"
                >
                  <span className="relative size-[44px] shrink-0 overflow-hidden rounded-[4px] bg-artwork">
                    {p.tracks[0]?.artwork && <Image src={p.tracks[0].artwork} alt="" fill sizes="44px" className="object-cover" unoptimized />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[14px]">{p.name}</span>
                    <span className="text-[9px] text-on-bright-muted">{p.count}곡</span>
                  </span>
                  {/* the padding is on the outside: turning a padded box over would swing the arrow to its other side */}
                  <span aria-hidden className="flex shrink-0 pr-[32px]">
                    <span className={`text-[18px] leading-none text-on-bright-muted transition-transform ${on ? "rotate-180" : ""}`}>⌄</span>
                  </span>
                </button>
                {on && (p.tracks.length === 0 ? <p className="pb-[12px] text-[10px] text-on-bright-muted">담긴 곡이 없어요.</p> : <SongList songs={p.tracks} />)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Another listener's page: who they are, how many follow them, and, when they
 * share it and the listener follows them, what they have been listening to.
 * The server decides what is in the answer; this only draws it.
 */
export function UserPage({ id }: { id: string }) {
  const router = useRouter();
  const [version, setVersion] = useState(0);
  const { data, loading, error } = useDetail<Profile>(`/api/me/people/${encodeURIComponent(id)}?v=${version}`);
  const { status } = usePeopleState();
  const { connected } = useSpotify();

  // the follow button reads the shared list, which may not have been loaded on this screen yet
  useEffect(() => {
    if (connected && status === "idle") void loadPeople();
  }, [connected, status]);

  const cream = "text-paper-solid";
  const refresh = () => setVersion((v) => v + 1);

  if (!data) {
    const text = error === "Spotify를 연결해 주세요" ? "Spotify를 연결하면 다른 사람의 페이지를 볼 수 있어요." : error === "찾을 수 없습니다" ? "찾을 수 없는 사람이에요." : error;
    return (
      <section className="flex min-h-full flex-1 flex-col gap-[16px] bg-chart p-[16px]">
        <div className="flex w-full shrink-0 items-center justify-between gap-[12px]">
          <h2 className="text-[26px] font-black tracking-[-1px]">함께 듣는 사람</h2>
          <button type="button" onClick={() => router.back()} className={`${PILL} bg-paper transition-colors hover:bg-soft rule`}>
            <span aria-hidden>←</span> 뒤로
          </button>
        </div>
        <DetailStatus loading={loading} error={loading ? null : text} />
      </section>
    );
  }

  return (
    <section className="flex min-h-full flex-1 flex-col gap-[16px] bg-chart p-[16px]">
      <div
        className="relative flex h-[230px] w-full shrink-0 items-center gap-[28px] overflow-hidden rounded-[8px] p-[32px]"
        style={{ backgroundColor: bannerOf(data.name) }}
      >
        <span className={`flex size-[150px] shrink-0 items-center justify-center rounded-pill bg-black/25 text-[64px] font-black ${cream}`}>
          {data.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col gap-[6px]">
          <p className={`text-[9px] tracking-[1.4px] opacity-80 ${cream}`}>{data.self ? "ME" : "LISTENER"}</p>
          <h2 className={`truncate text-[46px] font-black leading-[1.05] tracking-[-1.5px] ${cream}`} title={data.name}>
            {data.name}
          </h2>
          <p className={`text-[12px] opacity-85 ${cream}`}>
            팔로워 {data.followers} · 팔로잉 {data.following}
            {!data.self && data.followsMe && " · 나를 팔로우해요"}
          </p>
          <div className="mt-[8px] flex items-center gap-[8px]">
            {data.self ? (
              <Link href="/mypage" className={`${PILL} bg-paper transition-colors hover:bg-soft rule`}>
                내 마이페이지
              </Link>
            ) : (
              <PersonFollowButton id={data.id} name={data.name} following={data.iFollow} big onChange={refresh} />
            )}
            <button type="button" onClick={() => router.back()} className={`${PILL} bg-paper transition-colors hover:bg-soft rule`}>
              <span aria-hidden>←</span> 뒤로
            </button>
          </div>
        </div>
      </div>

      {data.visible ? (
        <>
          <Albums albums={data.albums} />
          <Playlists playlists={data.playlists} self={data.self} />
          <section className="flex w-full shrink-0 flex-col gap-[8px]">
            <h3 className="text-[15px] font-black tracking-[-0.3px]">이번 주 아티스트</h3>
            {data.weeklyArtist ? (
              <p className="text-[13px]">
                이번 주 가장 많이 들은 아티스트는 <strong>{data.weeklyArtist.name}</strong> 이에요.
              </p>
            ) : (
              <p className="text-[10px] text-on-bright-muted">이번 주에 들은 기록이 아직 없어요.</p>
            )}
          </section>
        </>
      ) : (
        <div className="flex w-full shrink-0 flex-col items-center gap-[8px] rounded-[8px] bg-paper px-[24px] py-[56px] text-center">
          <p className="text-[18px] font-black tracking-[-0.3px]">
            {data.shared ? `팔로우하면 ${data.name}님이 듣는 곡을 볼 수 있어요` : `${data.name}님은 활동을 공개하지 않았어요`}
          </p>
          <p className="text-[11px] text-on-bright-muted">
            {data.shared
              ? "최근 들은 앨범, 공개한 플레이리스트, 이번 주 아티스트가 보여요. 팔로우는 언제든 취소할 수 있어요."
              : "공개 여부는 상대가 정해요. 팔로우는 할 수 있지만, 공개를 켜기 전에는 곡이 보이지 않아요."}
          </p>
        </div>
      )}
    </section>
  );
}
