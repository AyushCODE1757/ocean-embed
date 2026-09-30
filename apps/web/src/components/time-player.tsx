"use client";

/** Time player: play/pause with speed, date scrubber, single-day steps,
 * and a "today-in-context" readout (season badge). */

import { useEffect, useRef } from "react";
import { Button, Segmented } from "./ui";
import { fmtDate } from "@/lib/format";

export function TimePlayer({
  dates,
  index,
  onIndex,
  playing,
  onPlaying,
  speed,
  onSpeed,
  disabled = false,
}: {
  dates: string[];
  index: number;
  onIndex: (i: number) => void;
  playing: boolean;
  onPlaying: (p: boolean) => void;
  speed: number;
  onSpeed: (s: number) => void;
  disabled?: boolean;
}) {
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    if (!playing || disabled) {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }
    const daysPerSecond = 12 * speed;
    const tick = (t: number) => {
      if (!last.current) last.current = t;
      const dt = (t - last.current) / 1000;
      last.current = t;
      const adv = dt * daysPerSecond;
      onIndex((indexRef.current + adv) % (dates.length - 1));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, disabled, dates.length]);

  const date = dates[index];
  const month = date ? Number(date.slice(5, 7)) : 1;
  const season =
    month <= 2 || month === 12
      ? "Winter"
      : month <= 5
        ? "Pre-monsoon"
        : month <= 9
          ? "SW monsoon"
          : "Post-monsoon";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="field-label">
        <label htmlFor="time-slider">Date</label>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--violet)", fontWeight: 600, fontSize: "var(--fs-xs)" }}>{season}</span>
          <span className="num" style={{ color: "var(--text-0)", fontSize: "var(--fs-sm)" }}>
            {date ? fmtDate(date) : "—"}
          </span>
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button
          variant="icon"
          onClick={() => onIndex(Math.max(0, index - 1))}
          disabled={disabled}
          title="Previous day (←)"
          ariaPressed={false}
        >
          ◀
        </Button>
        <Button
          variant="icon"
          onClick={() => onPlaying(!playing)}
          active={playing}
          disabled={disabled}
          title={playing ? "Pause (space)" : "Play (space)"}
          ariaPressed={playing}
        >
          {playing ? "❚❚" : "▶"}
        </Button>
        <Button
          variant="icon"
          onClick={() => onIndex(Math.min(dates.length - 1, index + 1))}
          disabled={disabled}
          title="Next day (→)"
          ariaPressed={false}
        >
          ▶
        </Button>
        <input
          id="time-slider"
          type="range"
          min={0}
          max={dates.length - 1}
          value={index}
          disabled={disabled}
          aria-valuetext={date}
          onChange={(e) => onIndex(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <Segmented
          ariaLabel="Playback speed"
          size="sm"
          options={[
            { value: "1", label: "1×" },
            { value: "3", label: "3×" },
            { value: "8", label: "8×" },
          ]}
          value={String(speed)}
          onChange={(v) => onSpeed(Number(v))}
        />
      </div>
    </div>
  );
}
