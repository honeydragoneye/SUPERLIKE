import { DetailShell } from "./detail-shell";

export type InfoSection = { heading: string; body: string[]; /** an address to write to, shown under the paragraphs as a mail link */ mail?: string };

/**
 * The plain text pages the rail's footer links to: a title and sections of
 * paragraphs, in the detail shell's frame. Kept as data so a page is its words.
 */
export function InfoPage({
  eyebrow,
  title,
  sections,
}: {
  eyebrow: string;
  title: string;
  sections: InfoSection[];
}) {
  return (
    <DetailShell eyebrow={eyebrow} title={title}>
      <div className="flex max-w-[760px] flex-col gap-[28px] pt-[12px]">
        {sections.map((s) => (
          <section key={s.heading} className="flex flex-col gap-[8px]">
            <h3 className="text-[11px] tracking-[0.8px] text-accent-bright">{s.heading}</h3>
            {s.body.map((p) => (
              <p key={p} className="text-[14px] font-normal leading-[22px]">
                {p}
              </p>
            ))}
            {s.mail && (
              <a
                href={`mailto:${s.mail}`}
                className="w-fit text-[14px] leading-[22px] text-accent-bright underline underline-offset-2"
              >
                {s.mail}
              </a>
            )}
          </section>
        ))}
      </div>
    </DetailShell>
  );
}
