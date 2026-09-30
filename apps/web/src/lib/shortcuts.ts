"use client";

/** Global keyboard shortcuts.
 * 1–6 switch views · space play/pause · ←/→ step day · ↑/↓ change depth
 * ? toggle the shortcut sheet. Registered once in the app shell. */

import { useEffect } from "react";

export type ShortcutHandlers = {
  onTogglePlay?: () => void;
  onStepDay?: (dir: 1 | -1) => void;
  onStepDepth?: (dir: 1 | -1) => void;
  onToggleHelp?: () => void;
  onEscape?: () => void;
};

export function useShortcuts(handlers: ShortcutHandlers, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case " ":
          e.preventDefault();
          handlers.onTogglePlay?.();
          break;
        case "ArrowRight":
          e.preventDefault();
          handlers.onStepDay?.(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlers.onStepDay?.(-1);
          break;
        case "ArrowUp":
          e.preventDefault();
          handlers.onStepDepth?.(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          handlers.onStepDepth?.(1);
          break;
        case "?":
          handlers.onToggleHelp?.();
          break;
        case "Escape":
          handlers.onEscape?.();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers, active]);
}

export const SHORTCUT_LIST: { keys: string; action: string }[] = [
  { keys: "1 – 6", action: "Switch view (Explorer → About)" },
  { keys: "Space", action: "Play / pause time animation" },
  { keys: "← / →", action: "Step one day" },
  { keys: "↑ / ↓", action: "Change depth level" },
  { keys: "?", action: "Toggle this sheet" },
  { keys: "Esc", action: "Close panels" },
];
