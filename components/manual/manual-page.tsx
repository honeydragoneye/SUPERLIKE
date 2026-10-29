import Image from "next/image";
import { DetailShell } from "@/components/detail/detail-shell";
import { MANUAL, type ManualBlock, type ManualSection } from "./content";

/**
 * 이용 안내: the user manual, drawn from `content.ts`.
 *
 * One long page rather than several short ones, so the browser's own search
 * finds every word of it. The rail beside it (`ManualRail`) lists the sections
 * and follows the reading position.
 */
export function ManualPage() {
  return (
    <DetailShell eyebrow="ABOUT" title="이용 안내">
      <div className="flex max-w-[1080px] flex-col pt-[4px]">
        {MANUAL.map((section, i) => (
          <Section key={section.id} index={i + 1} section={section} />
        ))}
      </div>
    </DetailShell>
  );
}

/** `scroll-mt` keeps a section's title clear of the action bar when the rail jumps to it. */
function Section({ index, section }: { index: number; section: ManualSection }) {
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="flex scroll-mt-[92px] flex-col gap-[14px] border-t-[1.5px] border-rule py-[28px]"
    >
      <div className="flex items-baseline gap-[12px]">
        <span className="text-[26px] font-black text-accent-bright">{String(index).padStart(2, "0")}</span>
        <h3 id={`${section.id}-title`} className="text-[26px] font-black tracking-[-1px] text-on-bright">
          {section.title}
        </h3>
      </div>
      <p className="text-[13px] leading-[20px] text-on-bright-muted">{section.lead}</p>
      {section.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </section>
  );
}

function Block({ block }: { block: ManualBlock }) {
  switch (block.kind) {
    case "h":
      return <h4 className="text-[12px] tracking-[0.8px] text-accent-bright">{block.text}</h4>;
    case "p":
      return (
        <div className="flex flex-col">
          <p className="text-[14px] font-normal leading-[22px] text-on-bright">{block.text}</p>
          {block.mail && (
            <a
              href={`mailto:${block.mail}`}
              className="w-fit text-[14px] font-normal leading-[22px] text-accent-bright underline underline-offset-2"
            >
              {block.mail}
            </a>
          )}
        </div>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-[6px]">
          {block.items.map((item) => (
            <li key={item} className="flex gap-[8px] text-[14px] font-normal leading-[22px] text-on-bright">
              <span aria-hidden className="shrink-0 font-bold">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="flex flex-col gap-[10px]">
          {block.items.map((item, i) => (
            <li key={item} className="flex items-start gap-[12px] text-[14px] font-normal leading-[22px] text-on-bright">
              <span
                aria-hidden
                className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-on-ink"
              >
                {i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );
    case "tip":
    case "warn": {
      const warn = block.kind === "warn";
      return (
        <aside
          className={`flex flex-col gap-[4px] rounded-[6px] border-l-[3px] bg-card px-[14px] py-[12px] ${
            warn ? "border-alert" : "border-accent-bright"
          }`}
        >
          <span className={`text-[9px] tracking-[0.8px] ${warn ? "text-alert" : "text-accent-bright"}`}>
            {warn ? "주의" : "TIP"}
          </span>
          <p className="text-[13px] font-normal leading-[20px] text-on-bright">{block.text}</p>
        </aside>
      );
    }
    case "table":
      return (
        <div role="table" className="flex flex-col">
          <div role="row" className="flex gap-[24px] border-b-[1.5px] border-rule pb-[6px] pt-[4px] text-[9px] tracking-[0.8px] text-on-bright-muted">
            <span role="columnheader" className="w-[250px] shrink-0">
              {block.head[0]}
            </span>
            <span role="columnheader" className="min-w-0 flex-1">
              {block.head[1]}
            </span>
          </div>
          {block.rows.map(([a, b], i) => (
            <div key={i} role="row" className="flex gap-[24px] border-b border-rule/15 py-[10px] text-[13px] leading-[20px] text-on-bright">
              <span role="cell" className="w-[250px] shrink-0 font-black">
                {a}
              </span>
              <span role="cell" className="min-w-0 flex-1 font-normal">
                {b}
              </span>
            </div>
          ))}
        </div>
      );
    case "chat":
      return (
        <div className="flex flex-col gap-[10px] rounded-[8px] bg-well px-[16px] py-[14px]">
          {block.lines.map((line, i) =>
            line.who === "me" ? (
              <div key={i} className="flex justify-end">
                <span className="rounded-[16px] bg-ink px-[14px] py-[7px] text-[12px] text-on-ink">{line.text}</span>
              </div>
            ) : (
              <p key={i} className="text-[13px] font-normal leading-[20px] text-on-bright">
                {line.text}
              </p>
            ),
          )}
        </div>
      );
    case "shot":
      return (
        <figure className="flex flex-col gap-[8px]">
          <div
            className="relative w-full overflow-hidden rounded-[6px] bg-well rule"
            style={{ aspectRatio: String(block.ratio) }}
          >
            <Image src={block.src} alt={block.alt} fill sizes="1080px" className="object-cover object-top" unoptimized />
          </div>
          <figcaption className="text-[11px] font-normal leading-[17px] text-on-bright-muted">{block.caption}</figcaption>
        </figure>
      );
    case "faq":
      return (
        <div className="flex flex-col gap-[6px] border-b border-rule/15 pb-[14px] pt-[12px]">
          <h4 className="text-[14px] font-black leading-[21px] text-on-bright">{block.q}</h4>
          <p className="text-[13px] font-normal leading-[21px] text-on-bright">{block.a}</p>
        </div>
      );
  }
}
