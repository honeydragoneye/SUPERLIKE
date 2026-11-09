/**
 * The action in a row of a mypage list (열기, 이름 바꾸기, 삭제, 공식 사이트, 즐겨찾기 해제): text only,
 * no outline and no fill, blue under the cursor. One style so the lists read as one.
 */
export const ROW_ACTION =
  "shrink-0 cursor-pointer whitespace-nowrap px-[8px] py-[6px] text-[10px] tracking-[0.7px] transition-colors hover:text-accent-bright";

/** The same, for an action that is not there (no address to open): faint, and nothing under the cursor. */
export const ROW_ACTION_OFF = "shrink-0 whitespace-nowrap px-[8px] py-[6px] text-[10px] tracking-[0.7px] opacity-40";
