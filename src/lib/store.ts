// Client state for Shifa, persisted to localStorage ("shifa:v1", or a per-Google-account key). SSR-safe:
// nothing touches `window` at module load, and the server snapshot is one constant EMPTY object.
import { useSyncExternalStore } from "react";
import type { AlertContact, ChatMessage, LabReport, Lang, Person, Sex } from "@/lib/types";
import { newId } from "@/lib/labRules";
import { buildDemoFamily } from "@/lib/demoData";
import { displayName, namesMatch } from "@/lib/identity";

export interface ShifaState {
  version: 1;
  onboarded: boolean;
  lang: Lang;
  people: Person[];
  activePersonId: string | null;
  reports: LabReport[];
  messages: ChatMessage[];
  contacts: AlertContact[]; // WhatsApp numbers for emergency alerts (max 3)
}

const GUEST_KEY = "shifa:v1";
// Signed-in users get their own key, so each Google account's reports stay separate on a shared phone.
const accountKey = (id: string) => `shifa:v1:acct:${id.replace(/[^A-Za-z0-9_-]/g, "")}`;
let storageKey = GUEST_KEY;
let account: string | null = null;
const MAX_MESSAGES_PER_PERSON = 200;
const MAX_CONTACTS = 3;
const LANGS: Lang[] = ["en", "ur", "roman"];

// One constant object: the server snapshot and the "nothing stored yet" state. Never mutated by
// this module (not frozen, so a consumer's accidental in-place sort can't crash SSR).
const EMPTY: ShifaState = {
  version: 1,
  onboarded: false,
  lang: "roman",
  people: [],
  activePersonId: null,
  reports: [],
  messages: [],
  contacts: [],
};

let state: ShifaState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null; // e.g. storage blocked by the browser
  }
}

function sanitize(raw: unknown): ShifaState {
  if (!raw || typeof raw !== "object") return EMPTY;
  const r = raw as Partial<ShifaState>;
  if (r.version !== 1) return EMPTY;
  const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  const people = arr<Person>(r.people).filter((p) => p && typeof p.id === "string");
  return {
    version: 1,
    onboarded: r.onboarded === true,
    lang: LANGS.includes(r.lang as Lang) ? (r.lang as Lang) : "roman",
    people,
    activePersonId:
      typeof r.activePersonId === "string" && people.some((p) => p.id === r.activePersonId) ? r.activePersonId : people[0]?.id ?? null,
    reports: arr<LabReport>(r.reports).filter((x) => x && typeof x.id === "string" && Array.isArray(x.tests)),
    messages: arr<ChatMessage>(r.messages).filter((m) => m && typeof m.id === "string"),
    contacts: arr<AlertContact>(r.contacts)
      .filter((c) => c && typeof c.id === "string" && typeof c.name === "string" && /^\d{10,15}$/.test(String(c.phone)))
      .slice(0, MAX_CONTACTS),
  };
}

function readStorage(): ShifaState {
  const ls = storage();
  if (!ls) return EMPTY;
  try {
    const raw = ls.getItem(storageKey);
    return raw ? sanitize(JSON.parse(raw)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Load from localStorage once, lazily, on the client only. */
function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = readStorage();
}

function emit(): void {
  for (const l of Array.from(listeners)) l();
}

/** Drop the oldest ~20% of messages (at least 10). Returns null when there is nothing left to drop. */
function dropOldestMessages(s: ShifaState): ShifaState | null {
  if (!s.messages.length) return null;
  const n = Math.min(s.messages.length, Math.max(10, Math.ceil(s.messages.length * 0.2)));
  const oldest = new Set(
    s.messages
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, n)
      .map((m) => m.id),
  );
  return { ...s, messages: s.messages.filter((m) => !oldest.has(m.id)) };
}

function persist(): void {
  const ls = storage();
  if (!ls) return;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      ls.setItem(storageKey, JSON.stringify(state));
      return;
    } catch (e) {
      // Most likely QuotaExceededError: drop the oldest messages and retry.
      const smaller = dropOldestMessages(state);
      if (!smaller) {
        console.warn("[shifa] could not save to localStorage", e);
        return;
      }
      state = smaller;
    }
  }
}

function commit(next: ShifaState): void {
  state = next;
  persist();
  emit();
}

/** Current state (hydrates first). Every action builds on this. */
function current(): ShifaState {
  hydrate();
  return state;
}

function onStorage(e: StorageEvent): void {
  if (e.key !== storageKey && e.key !== null) return;
  state = readStorage();
  emit();
}

function subscribe(listener: () => void): () => void {
  hydrate();
  if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): ShifaState => current();
const getServerSnapshot = (): ShifaState => EMPTY;
const getHydratedSnapshot = (): boolean => {
  hydrate();
  return hydrated;
};
const getServerHydrated = (): boolean => false;

export function useShifa(): ShifaState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** True once state has been loaded from localStorage on the client (false during SSR and hydration). */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getHydratedSnapshot, getServerHydrated);
}

function capMessages(messages: ChatMessage[], personId: string): ChatMessage[] {
  const mine = messages.filter((m) => m.personId === personId);
  if (mine.length <= MAX_MESSAGES_PER_PERSON) return messages;
  const drop = new Set(
    mine
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, mine.length - MAX_MESSAGES_PER_PERSON)
      .map((m) => m.id),
  );
  return messages.filter((m) => !drop.has(m.id));
}

const isDemoId = (id: string | undefined) => typeof id === "string" && id.startsWith("demo-");

/** File format for Backup / Restore. */
export interface ShifaBackup {
  app: "shifa";
  kind: "backup";
  version: 1;
  exportedAt: string;
  data: ShifaState;
}

export type RestoreResult =
  | { ok: true; people: number; reports: number; messages: number; exportedAt: string }
  | { ok: false };

const URGENCIES = new Set(["emergency", "soon", "routine", "normal"]);
const STATUSES = new Set(["low", "high", "normal", "unknown"]);
const isStr = (x: unknown): x is string => typeof x === "string";

// A restored file is untrusted: keep only records the UI can render safely.
const validPerson = (p: Person) =>
  isStr(p.name) && isStr(p.relation) && (p.reportNames === undefined || (Array.isArray(p.reportNames) && p.reportNames.every(isStr)));
const validReport = (r: LabReport) =>
  isStr(r.personId) &&
  URGENCIES.has(r.urgency) &&
  Array.isArray(r.urgencyReasons) &&
  r.tests.every((t) => t && isStr(t.name) && isStr(t.value) && STATUSES.has(t.status));
const validMessage = (m: ChatMessage) =>
  isStr(m.personId) && (m.role === "user" || m.role === "assistant") && isStr(m.text) && isStr(m.createdAt);

export const shifa = {
  getState: (): ShifaState => current(),

  setLang: (lang: Lang): void => {
    const s = current();
    if (s.lang !== lang && LANGS.includes(lang)) commit({ ...s, lang });
  },

  completeOnboarding: (): void => {
    const s = current();
    if (!s.onboarded) commit({ ...s, onboarded: true });
  },

  addPerson: (p: { name: string; relation: string; age?: number; sex?: Sex }): Person => {
    const s = current();
    const person: Person = {
      id: newId(),
      name: (p.name || "").trim(),
      relation: (p.relation || "").trim(),
      createdAt: new Date().toISOString(),
    };
    if (typeof p.age === "number" && Number.isFinite(p.age)) person.age = p.age;
    if (p.sex) person.sex = p.sex;
    const hasActive = s.activePersonId !== null && s.people.some((x) => x.id === s.activePersonId);
    commit({ ...s, people: [...s.people, person], activePersonId: hasActive ? s.activePersonId : person.id });
    return person;
  },

  /** Patch a family member (age/sex learned from a report, a rename...). */
  updatePerson: (id: string, patch: Partial<Pick<Person, "name" | "relation" | "age" | "sex" | "reportNames">>): void => {
    const s = current();
    if (!s.people.some((p) => p.id === id)) return;
    commit({ ...s, people: s.people.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p)) });
  },

  /** Remove a family member with their reports and chat. */
  deletePerson: (id: string): void => {
    const s = current();
    if (!s.people.some((p) => p.id === id)) return;
    const people = s.people.filter((p) => p.id !== id);
    commit({
      ...s,
      people,
      reports: s.reports.filter((r) => r.personId !== id),
      messages: s.messages.filter((m) => m.personId !== id),
      activePersonId: s.activePersonId === id ? (people[0]?.id ?? null) : s.activePersonId,
    });
  },

  /** Same person added twice: move everything from one profile into another, then remove the first. */
  mergePeople: (fromId: string, intoId: string): void => {
    const s = current();
    const from = s.people.find((p) => p.id === fromId);
    const into = s.people.find((p) => p.id === intoId);
    if (!from || !into || fromId === intoId) return;
    const names = [...(into.reportNames ?? [])];
    for (const n of from.reportNames ?? []) if (!names.some((x) => namesMatch(x, n))) names.push(n);
    const merged: Person = {
      ...into,
      ...(typeof into.age !== "number" && typeof from.age === "number" ? { age: from.age } : {}),
      ...(!into.sex && from.sex ? { sex: from.sex } : {}),
      ...(!into.relation && from.relation ? { relation: from.relation } : {}),
      ...(names.length ? { reportNames: names.slice(-5) } : {}),
    };
    commit({
      ...s,
      people: s.people.filter((p) => p.id !== fromId).map((p) => (p.id === intoId ? merged : p)),
      reports: s.reports.map((r) => (r.personId === fromId ? { ...r, personId: intoId } : r)),
      messages: s.messages.map((m) => (m.personId === fromId ? { ...m, personId: intoId } : m)),
      activePersonId: s.activePersonId === fromId ? intoId : s.activePersonId,
    });
  },

  /** Remember the name printed on this person's confirmed report, so later reports can be checked. */
  rememberReportName: (personId: string, name: string): void => {
    const shown = displayName(name);
    const s = current();
    const person = s.people.find((p) => p.id === personId);
    if (!shown || !person) return;
    const names = person.reportNames ?? [];
    if (names.some((n) => namesMatch(n, shown))) return;
    commit({ ...s, people: s.people.map((p) => (p.id === personId ? { ...p, reportNames: [...names, shown].slice(-5) } : p)) });
  },

  /** Move chat messages (e.g. a report card and its upload) to another family member. */
  moveMessages: (ids: string[], personId: string): void => {
    const s = current();
    const set = new Set(ids);
    if (!s.people.some((p) => p.id === personId)) return;
    commit({ ...s, messages: s.messages.map((m) => (set.has(m.id) ? { ...m, personId } : m)) });
  },

  /** Give a report to another family member (it was added to the wrong person). */
  moveReport: (reportId: string, personId: string): void => {
    const s = current();
    if (!s.people.some((p) => p.id === personId)) return;
    commit({ ...s, reports: s.reports.map((r) => (r.id === reportId ? { ...r, personId } : r)) });
  },

  setActivePerson: (id: string): void => {
    const s = current();
    if (s.activePersonId !== id && s.people.some((p) => p.id === id)) commit({ ...s, activePersonId: id });
  },

  addReport: (r: LabReport): void => {
    const s = current();
    const exists = s.reports.some((x) => x.id === r.id);
    commit({ ...s, reports: exists ? s.reports.map((x) => (x.id === r.id ? r : x)) : [...s.reports, r] });
  },

  deleteReport: (id: string): void => {
    const s = current();
    if (!s.reports.some((r) => r.id === id)) return;
    commit({
      ...s,
      reports: s.reports.filter((r) => r.id !== id),
      // Keep the chat text, but detach it from the deleted report card.
      messages: s.messages.map((m) => {
        if (m.reportId !== id) return m;
        const copy = { ...m };
        delete copy.reportId;
        return copy;
      }),
    });
  },

  addMessage: (m: Omit<ChatMessage, "id" | "createdAt"> & { id?: string }): ChatMessage => {
    const s = current();
    const msg: ChatMessage = { ...m, id: m.id ?? newId(), createdAt: new Date().toISOString() };
    commit({ ...s, messages: capMessages([...s.messages, msg], msg.personId) });
    return msg;
  },

  updateMessage: (id: string, patch: Partial<ChatMessage>): void => {
    const s = current();
    if (!s.messages.some((m) => m.id === id)) return;
    // New text (e.g. re-explained for another person) makes saved translations stale.
    const stale = patch.text !== undefined && !("translations" in patch) ? { translations: undefined, speechHi: undefined } : {};
    commit({ ...s, messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch, ...stale, id: m.id } : m)) });
  },

  clearChat: (personId: string): void => {
    const s = current();
    commit({ ...s, messages: s.messages.filter((m) => m.personId !== personId) });
  },

  loadDemoFamily: (): void => {
    const s = current();
    const demo = buildDemoFamily(new Date(), s.lang); // the demo answer follows the preferred language
    const people = s.people.filter((p) => !isDemoId(p.id));
    const reports = s.reports.filter((r) => r.source !== "demo" && !isDemoId(r.personId) && !isDemoId(r.id));
    const messages = s.messages.filter((m) => !isDemoId(m.personId) && !isDemoId(m.id));
    commit({
      ...s,
      onboarded: true,
      people: [...people, ...demo.people],
      reports: [...reports, ...demo.reports],
      messages: [...messages, ...demo.messages],
      activePersonId: demo.activePersonId,
    });
  },

  /** Everything on this device (for the current account) as a backup file's text. */
  exportBackup: (): string => {
    const file: ShifaBackup = { app: "shifa", kind: "backup", version: 1, exportedAt: new Date().toISOString(), data: current() };
    return JSON.stringify(file);
  },

  /**
   * Restore a backup by MERGING it: people, reports and messages not already here are added,
   * nothing existing is overwritten. Safe to run twice (the second run adds nothing).
   */
  importBackup: (text: string): RestoreResult => {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false };
    }
    const f = raw as Partial<ShifaBackup> | null;
    if (!f || f.app !== "shifa" || f.kind !== "backup" || f.version !== 1) return { ok: false };
    const incoming = sanitize(f.data);
    const s = current();
    const hasPerson = new Set(s.people.map((p) => p.id));
    const hasReport = new Set(s.reports.map((r) => r.id));
    const hasMessage = new Set(s.messages.map((m) => m.id));
    const people = incoming.people.filter((p) => !hasPerson.has(p.id) && validPerson(p));
    const known = new Set([...hasPerson, ...people.map((p) => p.id)]);
    const reports = incoming.reports.filter((r) => !hasReport.has(r.id) && validReport(r) && known.has(r.personId));
    const messages = incoming.messages.filter((m) => !hasMessage.has(m.id) && validMessage(m) && known.has(m.personId));
    if (people.length + reports.length + messages.length > 0) {
      const activePersonId = s.activePersonId ?? (incoming.activePersonId && known.has(incoming.activePersonId) ? incoming.activePersonId : (people[0]?.id ?? null));
      commit({
        ...s,
        onboarded: true,
        contacts: s.contacts.length ? s.contacts : incoming.contacts,
        people: [...s.people, ...people],
        reports: [...s.reports, ...reports],
        messages: [...s.messages, ...messages],
        activePersonId,
      });
    }
    return { ok: true, people: people.length, reports: reports.length, messages: messages.length, exportedAt: isStr(f.exportedAt) ? f.exportedAt : "" };
  },

  /** Save a WhatsApp alert number (already normalised to digits). Max 3; same number not added twice. */
  addContact: (c: { name: string; phone: string }): AlertContact | null => {
    const s = current();
    if (!/^\d{10,15}$/.test(c.phone) || s.contacts.length >= MAX_CONTACTS || s.contacts.some((x) => x.phone === c.phone)) return null;
    const contact: AlertContact = { id: newId(), name: c.name.trim() || c.phone, phone: c.phone };
    commit({ ...s, contacts: [...s.contacts, contact] });
    return contact;
  },

  removeContact: (id: string): void => {
    const s = current();
    commit({ ...s, contacts: s.contacts.filter((c) => c.id !== id) });
  },

  /** The signed-in Google account id (null = guest). */
  getAccount: (): string | null => account,

  /**
   * Point the store at a Google account's on-device data (or back to guest data on sign-out).
   * On the first sign-in on this device, guest data moves into the account so nothing is lost;
   * signing out then shows an empty guest space, so the next person can't see it.
   */
  switchAccount: (id: string | null, opts?: { displayName?: string | null }): void => {
    hydrate();
    if (id === account) return;
    const ls = storage();
    const nextKey = id ? accountKey(id) : GUEST_KEY;
    const prevLang = state.lang;
    let hadData = false;
    try {
      hadData = Boolean(ls?.getItem(nextKey));
      if (id && account === null && ls && !hadData) {
        const guestRaw = ls.getItem(GUEST_KEY);
        if (guestRaw) {
          ls.setItem(nextKey, guestRaw);
          ls.removeItem(GUEST_KEY);
          hadData = true;
        }
      }
    } catch {
      /* storage blocked or full: fall back to whatever can be read */
    }
    account = id;
    storageKey = nextKey;
    state = readStorage();
    if (!hadData) state = { ...state, lang: prevLang }; // keep the language the user already picked
    const first = (opts?.displayName ?? "").trim().split(/\s+/)[0];
    const me = id && first ? state.people.find((p) => p.relation === "Self" && (p.name === "Me" || !p.name)) : undefined;
    if (me) state = { ...state, people: state.people.map((p) => (p.id === me.id ? { ...p, name: first } : p)) };
    persist();
    emit();
  },

  resetAll: (): void => {
    hydrate();
    const lang = state.lang; // wiping data shouldn't switch the user's language
    state = lang === EMPTY.lang ? EMPTY : { ...EMPTY, lang };
    if (state === EMPTY) {
      try {
        storage()?.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    } else {
      persist(); // keep only the language choice across reloads
    }
    emit();
  },
};
