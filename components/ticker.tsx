export function Ticker() {
  return (
    <div className="flex h-[30px] shrink-0 items-center gap-[14px] overflow-hidden bg-ticker px-[14px]">
      <p className="shrink-0 whitespace-nowrap text-[9px] tracking-[0.6px] text-alert">
        ● ON AIR
      </p>
      <p className="shrink-0 whitespace-nowrap text-[9px] tracking-[0.4px]">
        NEW RELEASES EVERY FRIDAY · 00:00 KST
      </p>
      <p className="w-[17px] shrink-0 text-[15px] font-black text-pink">→</p>
      <p className="shrink-0 whitespace-nowrap text-[9px] tracking-[0.4px]">
        DISCOVER WEEKLY IS OUT
      </p>
      <button
        type="button"
        className="shrink-0 rounded-pill bg-[rgba(255,253,246,0.93)] px-[9px] py-[3px] text-[8px] tracking-[0.6px]"
      >
        LISTEN NOW
      </button>
      <div className="min-w-px flex-1" />
      <p className="shrink-0 whitespace-nowrap text-[9px] tracking-[0.4px]">
        © SUPERLIKE 2026
      </p>
    </div>
  );
}
