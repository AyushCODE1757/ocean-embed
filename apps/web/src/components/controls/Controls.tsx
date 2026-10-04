"use client";

import { useEffect } from "react";
import { rampCss, rampFor, niceTicks } from "@/lib/colormaps";

export function Colorbar({ field, lo, hi, units }: { field: string; lo: number; hi: number; units: string }) {
  const ramp = rampFor(field);
  const ticks = niceTicks(lo, hi, 4);
  return (
    <div className="legend-bar" aria-label={`Colour legend from ${lo.toFixed(1)} to ${hi.toFixed(1)} ${units}`}>
      <span className="num">{lo.toFixed(1)}</span>
      <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${rampCss(ramp)})` }} />
      <span className="num">{hi.toFixed(1)}</span>
      <span style={{ color: "var(--text-3)" }}>{units}</span>
    </div>
  );
}

export function ChipRow({
  label, options, value, onChange, ariaLabel,
}: {
  label: string;
  options: { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="chip-row" role="radiogroup" aria-label={ariaLabel ?? label}>
      <span className="chip-label">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="chip"
          data-active={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* Date slider + play. Play advances through dates at a fixed rate and
   pauses when the tab is hidden; honours prefers-reduced-motion. */
export function DateSlider({
  dates, index, onIndex, playing, onPlaying,
}: {
  dates: string[];
  index: number;
  onIndex: (i: number) => void;
  playing: boolean;
  onPlaying: (p: boolean) => void;
}) {
  useEffect(() => {
    if (!playing) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      onIndex((index + 1) % dates.length);
    }, 700);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, dates.length]);

  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row spread">
        <span className="eyebrow muted">Date</span>
        <span className="num" style={{ color: "var(--text-1)" }}>{dates[index]}</span>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <button
          type="button"
          className="btn small"
          aria-label={playing ? "Pause animation" : "Play animation"}
          onClick={() => onPlaying(!playing)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, dates.length - 1)}
          value={index}
          step={1}
          style={{ flex: 1 }}
          aria-label="Date"
          onChange={(e) => { onPlaying(false); onIndex(Number(e.target.value)); }}
        />
      </div>
    </div>
  );
}
