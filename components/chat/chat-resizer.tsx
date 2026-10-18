"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_MIN_WIDTH, useChat } from "./chat-provider";

/** One arrow-key press moves the edge this far. */
const STEP = 24;

/**
 * The line between the page and the chat. Dragging it moves the split.
 *
 * It sits on the chat column's left edge and is wider than it looks: the line
 * itself is a hair, but the strip you can grab is 10px. The width it asks for
 * is clamped by the provider — no narrower than the column starts at, no wider
 * than half the window — so dragging past either end simply stops there.
 */
export function ChatResizer() {
  const { width, setWidth, maxWidth } = useChat();
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // while dragging, the cursor stays a resize cursor and the page does not select text
  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="채팅 폭 조절 (더블클릭하면 처음 폭)"
      aria-valuemin={CHAT_MIN_WIDTH}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      tabIndex={0}
      title="끌어서 폭 조절 · 더블클릭하면 처음 폭"
      className="group absolute -left-[5px] top-0 z-20 flex h-full w-[10px] cursor-col-resize touch-none justify-center outline-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startWidth: width };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        // the column grows leftwards: moving the pointer left is a wider chat
        if (d) setWidth(d.startWidth + (d.startX - e.clientX));
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={() => setWidth(CHAT_MIN_WIDTH)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setWidth(width + STEP);
        else if (e.key === "ArrowRight") setWidth(width - STEP);
        else if (e.key === "Home") setWidth(CHAT_MIN_WIDTH);
        else if (e.key === "End") setWidth(maxWidth);
        else return;
        e.preventDefault();
      }}
    >
      <span
        aria-hidden
        className={`h-full transition-[width,background-color] ${
          dragging
            ? "w-[3px] bg-ink"
            : "w-px bg-black/25 group-hover:w-[3px] group-hover:bg-ink group-focus-visible:w-[3px] group-focus-visible:bg-ink"
        }`}
      />
    </div>
  );
}
