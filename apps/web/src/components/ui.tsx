"use client";

/** Shared UI primitives — dark "Abyss" design system, WCAG-conscious
 * (focus-visible rings, aria labels, ≥3:1 text contrast). */

import {
  createContext,
  useContext,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/* ---------------- Panel ---------------- */

export function Panel({
  title,
  subtitle,
  actions,
  children,
  style,
  bodyStyle,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  className?: string;
}) {
  return (
    <section
      className={className}
      style={{
        background: "var(--panel)",
        border: "1px solid var(--panel-border)",
        borderRadius: "var(--r-lg)",
        backdropFilter: "blur(14px)",
        boxShadow: "var(--shadow-1)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...style,
      }}
      aria-label={typeof title === "string" ? title : undefined}
    >
      {(title || actions) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid var(--panel-border)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <h2
                style={{
                  margin: 0,
                  fontSize: "var(--fs-md)",
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ margin: "2px 0 0", fontSize: "var(--fs-xs)", color: "var(--text-2)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
        </header>
      )}
      <div style={{ padding: 14, minHeight: 0, flex: 1, ...bodyStyle }}>{children}</div>
    </section>
  );
}

/* ---------------- Badge ---------------- */

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "violet" | "teal";

const TONE_BG: Record<Tone, string> = {
  neutral: "rgba(148, 178, 210, 0.12)",
  accent: "rgba(69, 214, 255, 0.14)",
  ok: "rgba(74, 222, 128, 0.13)",
  warn: "rgba(255, 180, 84, 0.14)",
  danger: "rgba(255, 107, 94, 0.15)",
  violet: "rgba(167, 139, 250, 0.15)",
  teal: "rgba(45, 212, 191, 0.14)",
};
const TONE_FG: Record<Tone, string> = {
  neutral: "var(--text-1)",
  accent: "var(--accent-strong)",
  ok: "#7ef0a8",
  warn: "#ffc97e",
  danger: "#ff9a90",
  violet: "#c4b5fd",
  teal: "#7ce8db",
};

export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: "var(--fs-xs)",
        fontWeight: 600,
        letterSpacing: "0.03em",
        background: TONE_BG[tone],
        color: TONE_FG[tone],
        border: `1px solid ${TONE_BG[tone]}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/* ---------------- Buttons ---------------- */

export function Button({
  children,
  onClick,
  variant = "ghost",
  active = false,
  disabled = false,
  title,
  ariaPressed,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "solid" | "icon";
  active?: boolean;
  disabled?: boolean;
  title?: string;
  ariaPressed?: boolean;
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: "var(--r-sm)",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background var(--t-fast), border-color var(--t-fast), color var(--t-fast)",
    opacity: disabled ? 0.45 : 1,
    userSelect: "none",
    whiteSpace: "nowrap",
    ...style,
  };
  const styles: Record<string, CSSProperties> = {
    ghost: {
      ...base,
      background: active ? "var(--accent-soft)" : "rgba(148, 178, 210, 0.07)",
      border: `1px solid ${active ? "var(--panel-border-strong)" : "var(--panel-border)"}`,
      color: active ? "var(--accent-strong)" : "var(--text-1)",
      padding: "5px 12px",
      fontSize: "var(--fs-sm)",
      fontWeight: 550,
    },
    solid: {
      ...base,
      background: "linear-gradient(135deg, #1b9fe8, #0f6fb8)",
      border: "1px solid rgba(127, 228, 255, 0.5)",
      color: "#f2fbff",
      padding: "7px 16px",
      fontSize: "var(--fs-sm)",
      fontWeight: 650,
      boxShadow: "0 2px 14px rgba(27, 159, 232, 0.35)",
    },
    icon: {
      ...base,
      width: 30,
      height: 30,
      background: active ? "var(--accent-soft)" : "rgba(148, 178, 210, 0.07)",
      border: `1px solid ${active ? "var(--panel-border-strong)" : "var(--panel-border)"}`,
      color: active ? "var(--accent-strong)" : "var(--text-1)",
      fontSize: 14,
      lineHeight: 1,
    },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={ariaPressed}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

/* ---------------- Segmented control ---------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 2,
        background: "rgba(6, 13, 24, 0.6)",
        border: "1px solid var(--panel-border)",
        borderRadius: "var(--r-sm)",
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            title={o.title}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: size === "sm" ? "3px 9px" : "5px 12px",
              fontSize: size === "sm" ? "var(--fs-xs)" : "var(--fs-sm)",
              fontWeight: 550,
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: active ? "var(--accent-soft)" : "transparent",
              color: active ? "var(--accent-strong)" : "var(--text-2)",
              transition: "all var(--t-fast)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Slider field ---------------- */

export function SliderField({
  label,
  valueText,
  min,
  max,
  step = 1,
  value,
  onChange,
  disabled = false,
  marks,
}: {
  label: string;
  valueText: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  marks?: { at: number; label: string }[];
}) {
  const id = useId();
  return (
    <div style={{ opacity: disabled ? 0.45 : 1 }}>
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        <span className="num" style={{ color: "var(--text-0)", fontSize: "var(--fs-sm)" }}>
          {valueText}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {marks && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "var(--fs-xs)",
            color: "var(--text-3)",
            marginTop: -2,
          }}
        >
          {marks.map((m) => (
            <span key={m.at}>{m.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Skeleton / states ---------------- */

export function SkeletonBox({ h = 80, style }: { h?: number; style?: CSSProperties }) {
  return <div className="skeleton" style={{ height: h, ...style }} aria-hidden="true" />;
}

export function EmptyState({
  icon = "◇",
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "40px 20px",
        textAlign: "center",
        color: "var(--text-2)",
      }}
    >
      <div style={{ fontSize: 30, opacity: 0.7 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{title}</div>
      {hint && <div style={{ fontSize: "var(--fs-sm)", maxWidth: 380 }}>{hint}</div>}
      {action}
    </div>
  );
}

export function Progress({ pct, label }: { pct: number; label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: "rgba(125, 178, 240, 0.12)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            height: "100%",
            borderRadius: 3,
            background: "linear-gradient(90deg, #1b9fe8, #45d6ff)",
            transition: "width var(--t-med)",
            boxShadow: "0 0 10px rgba(69, 214, 255, 0.5)",
          }}
        />
      </div>
      {label && (
        <span className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--text-2)", minWidth: 34 }}>
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

/* ---------------- Stat readout ---------------- */

export function Stat({
  label,
  value,
  unit,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div
      title={hint}
      style={{
        padding: "10px 12px",
        background: "rgba(8, 17, 30, 0.55)",
        border: "1px solid var(--panel-border)",
        borderRadius: "var(--r-md)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: "var(--fs-xs)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-2)",
          marginBottom: 3,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div className="num" style={{ fontSize: "var(--fs-xl)", fontWeight: 650, color: TONE_FG[tone] }}>
        {value}
        {unit && (
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--text-2)", marginLeft: 4 }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- Tabs (page-level) ---------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 2,
        borderBottom: "1px solid var(--panel-border)",
        marginBottom: 12,
      }}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(t.value)}
            style={{
              padding: "7px 14px",
              fontSize: "var(--fs-sm)",
              fontWeight: active ? 650 : 500,
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
              color: active ? "var(--text-0)" : "var(--text-2)",
              cursor: "pointer",
              transition: "color var(--t-fast)",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- DataTable ---------------- */

export function DataTable({
  columns,
  rows,
  rowKey,
  highlightRow,
  dense = false,
  maxHeight,
  csvName,
}: {
  columns: { key: string; label: string; align?: "left" | "right" | "center"; width?: string; title?: string }[];
  rows: Record<string, ReactNode>[];
  rowKey: (row: Record<string, ReactNode>, i: number) => string;
  highlightRow?: (row: Record<string, ReactNode>, i: number) => boolean;
  dense?: boolean;
  maxHeight?: number | string;
  csvName?: string;
  onExportCsv?: () => void;
}) {
  const cellPad = dense ? "5px 10px" : "8px 12px";
  return (
    <div style={{ overflow: "auto", maxHeight, borderRadius: "var(--r-md)", border: "1px solid var(--panel-border)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-sm)" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                title={c.title}
                style={{
                  position: "sticky",
                  top: 0,
                  background: "var(--panel-solid)",
                  textAlign: c.align ?? "left",
                  padding: cellPad,
                  fontSize: "var(--fs-xs)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "var(--text-2)",
                  fontWeight: 600,
                  borderBottom: "1px solid var(--panel-border-strong)",
                  whiteSpace: "nowrap",
                  zIndex: 1,
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const hot = highlightRow?.(row, i) ?? false;
            return (
              <tr
                key={rowKey(row, i)}
                style={{
                  background: hot ? "var(--accent-soft)" : i % 2 ? "rgba(255,255,255,0.015)" : "transparent",
                }}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={c.key !== "label" ? "num" : undefined}
                    style={{
                      padding: cellPad,
                      textAlign: c.align ?? "left",
                      borderBottom: "1px solid rgba(125, 178, 240, 0.07)",
                      color: hot ? "var(--text-0)" : "var(--text-1)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Provenance drawer ---------------- */

const ProvenanceCtx = createContext<() => void>(() => {});
export const useProvenance = () => useContext(ProvenanceCtx);

export function ProvenanceProvider({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  return <ProvenanceCtx.Provider value={onOpen}>{children}</ProvenanceCtx.Provider>;
}

/* ---------------- Info dot (provenance affordance) ---------------- */

export function InfoDot({ title, onClick }: { title: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={`About: ${title}`}
      onClick={onClick}
      style={{
        width: 17,
        height: 17,
        borderRadius: "50%",
        border: "1px solid var(--panel-border-strong)",
        background: "transparent",
        color: "var(--text-2)",
        fontSize: 10,
        fontStyle: "italic",
        fontFamily: "Georgia, serif",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      i
    </button>
  );
}

/* ---------------- Chart frame (SVG sparkline / bars) ---------------- */

export function ChartFrame({
  h = 160,
  children,
  bg = "rgba(8, 17, 30, 0.45)",
}: {
  h?: number;
  children: ReactNode;
  bg?: string;
}) {
  return (
    <div
      style={{
        height: h,
        background: bg,
        border: "1px solid var(--panel-border)",
        borderRadius: "var(--r-md)",
        padding: 8,
        minHeight: 0,
      }}
    >
      {children}
    </div>
  );
}

/* ---------------- Collapsible ---------------- */

export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid var(--panel-border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "9px 12px",
          background: "rgba(8, 17, 30, 0.5)",
          border: "none",
          cursor: "pointer",
          fontSize: "var(--fs-sm)",
          fontWeight: 600,
          color: "var(--text-1)",
        }}
      >
        {title}
        <span style={{ color: "var(--text-2)", transform: open ? "rotate(90deg)" : "none", transition: "transform var(--t-fast)" }}>
          ▸
        </span>
      </button>
      {open && <div style={{ padding: 12 }}>{children}</div>}
    </div>
  );
}
