/**
 * The right-hand column: who follows whom and who else is here. None of it has
 * anything to read yet, and each panel says so rather than showing invented people.
 */

/** Marks a panel that is drawn but not wired, in the outline a disabled pill uses. */
function Soon() {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-pill border-[1.5px] border-black/30 px-[12px] py-[4px] text-[9px] tracking-[0.6px] text-black/45">
      준비 중
    </span>
  );
}

/**
 * Follower and following counts.
 *
 * Zero is the true figure, not a placeholder: following has to be known to
 * both people, and everything this app keeps lives in one browser. The counts
 * get a source when there is somewhere shared to store them.
 */
export function FollowCounts() {
  return (
    <dl className="flex h-[84px] w-full shrink-0 gap-[112px] border-b-[1.5px] border-ink pl-[40px] pt-[20px]">
      {(["팔로워", "팔로잉"] as const).map((label) => (
        <div key={label} className="flex w-[26px] shrink-0 flex-col gap-[4px]">
          <dt className="whitespace-nowrap text-[9px] tracking-[0.8px] text-on-bright-muted">
            {label}
          </dt>
          <dd className="tnum text-[29px] font-black leading-[34px] tracking-[-1px]">0</dd>
        </div>
      ))}
    </dl>
  );
}

/** The other accounts on this app — empty until there is a list to read. */
export function Listeners() {
  return (
    <section className="flex min-h-[355px] w-full flex-1 flex-col gap-[20px] border-b-[1.5px] border-ink px-[24px] pb-[24px] pt-[20px]">
      <div className="flex w-full items-start justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
          <h2 className="whitespace-nowrap text-[13px] font-black tracking-[-0.3px]">
            함께 듣는 사람
          </h2>
          <p className="whitespace-nowrap text-[8px] tracking-[0.6px] text-on-bright-muted">
            이 앱에 로그인할 수 있는 5명
          </p>
        </div>
        <Soon />
      </div>

      <p className="text-[10px] leading-[16px] tracking-[0.5px] text-on-bright-muted">
        아직 함께 듣는 사람이 없습니다.
      </p>
    </section>
  );
}
