import type { About } from "@/lib/about";
import { LoadingDots } from "@/components/ui/loading-dots";
import { RailLabel } from "./rail-shell";

export type Fact = [label: string, value: string];

/**
 * A name, a few sentences about it, and the plain facts — no card around them.
 *
 * `about` is null while it loads; the facts do not wait for it, because the
 * page already has them. The source is named whichever it came from, and links
 * to the article when there is one.
 */
export function AboutBlock({
  label,
  title,
  about,
  loading,
  facts,
}: {
  label: string;
  title: string;
  about: About | null;
  loading: boolean;
  facts: Fact[];
}) {
  const source = about?.source === "wikipedia" ? "Wikipedia" : about?.source === "lastfm" ? "Last.fm" : null;
  return (
    <div className="flex shrink-0 flex-col gap-[8px]">
      <RailLabel>{label}</RailLabel>
      <h2 className="text-[20px] font-black leading-[24px] tracking-[-0.5px]">{title}</h2>
      {loading ? (
        <p className="flex items-center gap-[8px] text-[10px] text-on-bright-muted">
          불러오는 중
          <LoadingDots size={4} />
        </p>
      ) : about?.text ? (
        <p className="text-[10px] font-medium leading-[15px] text-on-bright">{about.text}</p>
      ) : (
        <p className="text-[10px] font-medium text-on-bright-muted">소개 글을 찾지 못했습니다</p>
      )}
      {facts.length > 0 && (
        <dl className="flex flex-col gap-[3px]">
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-[8px] text-[9px]">
              <dt className="w-[84px] shrink-0 text-on-bright-muted">{k}</dt>
              <dd className="min-w-0 flex-1 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {source && (
        <p className="text-[8px] font-medium text-on-bright-muted">
          출처{" "}
          {about?.url ? (
            <a href={about.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {source}
            </a>
          ) : (
            source
          )}
        </p>
      )}
    </div>
  );
}
