export function Ticker() {
  return (
    <div className="flex h-[30px] shrink-0 items-center gap-[14px] overflow-hidden bg-ticker px-[34px] text-paper-solid">
      <p className="shrink-0 whitespace-nowrap text-[9px] tracking-[0.6px]">
        ● ON AIR
      </p>
      <p className="shrink-0 whitespace-nowrap text-[9px] tracking-[0.4px]">
        NEW RELEASES EVERY FRIDAY · 00:00 KST
      </p>
      <p className="w-[17px] shrink-0 text-[15px] font-black">→</p>
      <p className="shrink-0 whitespace-nowrap text-[9px] tracking-[0.4px]">
        DISCOVER WEEKLY IS OUT
      </p>
      <button
        type="button"
        className="shrink-0 rounded-pill bg-[rgba(250,252,254,0.93)] px-[9px] py-[3px] text-[8px] tracking-[0.6px] text-black"
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
