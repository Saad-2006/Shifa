"use client";

// Light / dark / follow-the-phone theme. A per-device preference, so it lives in its own
// localStorage key (not in the per-account store). The <html data-theme> attribute drives the
// colour tokens in globals.css; "system" removes it and lets prefers-color-scheme decide.
import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const KEY = "shifa:theme";
const listeners = new Set<() => void>();

/** Runs before first paint (inlined in layout.tsx) so a dark-mode user never sees a white flash. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export function readThemePref(): ThemePref {
  try {
    const t = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    return t === "dark" || t === "light" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, pref);
  } catch {
    /* storage blocked: the choice still applies for this visit */
  }
  apply(pref);
  for (const l of Array.from(listeners)) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", listener);
  };
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readThemePref, () => "system");
}

/** What is actually showing: the user's choice, or the phone's setting when on "system". */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribe,
    () => {
      const pref = readThemePref();
      if (pref !== "system") return pref;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    },
    () => "light",
  );
}
