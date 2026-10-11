"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

export const SIDEBAR_MIN = 260;
export const SIDEBAR_MAX = 560;
export const SIDEBAR_DEFAULT = 300;
const KEY = "shifa:sidebarWidth"; // a per-device convenience, not data

const clamp = (w: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));

/** Desktop sidebar width, remembered on this device (charts in the sidebar grow with it). */
export function useSidebarWidth(): [number, (w: number) => void] {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      if (saved) setWidth(clamp(saved));
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const set = (w: number) => {
    const next = clamp(w);
    setWidth(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      /* ignore */
    }
  };
  return [width, set];
}

/** Drag handle on the sidebar's edge (also arrow keys; double-click resets). */
export default function SidebarResizer({ width, onChange, lang }: { width: number; onChange: (w: number) => void; lang: Lang }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const [active, setActive] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("resizeSidebar", lang)}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title={t("resizeSidebar", lang)}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        setActive(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current) onChange(start.current.w + (e.clientX - start.current.x));
      }}
      onPointerUp={() => {
        start.current = null;
        setActive(false);
      }}
      onPointerCancel={() => {
        start.current = null;
        setActive(false);
      }}
      onDoubleClick={() => onChange(SIDEBAR_DEFAULT)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onChange(width + 24);
        else if (e.key === "ArrowLeft") onChange(width - 24);
        else return;
        e.preventDefault();
      }}
      className="group absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none focus-visible:outline-none"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover:bg-accent group-focus-visible:bg-accent ${active ? "bg-accent" : "bg-transparent"}`}
      />
    </div>
  );
}
