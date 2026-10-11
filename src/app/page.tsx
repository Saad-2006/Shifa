"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeartPulse, Languages, Menu, X } from "lucide-react";
import AccountCard from "@/components/AccountCard";
import BackupRestore from "@/components/BackupRestore";
import ChatThread from "@/components/ChatThread";
import Composer, { type ComposerHandle } from "@/components/Composer";
import Disclaimer from "@/components/Disclaimer";
import FollowUpChips from "@/components/FollowUpChips";
import PersonMenu from "@/components/PersonMenu";
import PersonEditSheet from "@/components/PersonEditSheet";
import ReportSheet from "@/components/ReportSheet";
import SignInGate from "@/components/SignInGate";
import Sidebar from "@/components/Sidebar";
import WelcomeState from "@/components/WelcomeState";
import type { NewPerson } from "@/components/AddPersonForm";
import type { Lang } from "@/lib/types";
import { personReports } from "@/components/reportUtils";
import { useShifaChat } from "@/components/useShifaChat";
import { LANG_SELF_NAME, t } from "@/lib/i18n";
import { shifa, useHydrated, useShifa, type ShifaState } from "@/lib/store";
import { useAuth } from "@/lib/useAuth";
import { relationSex } from "@/lib/relations";
import SidebarResizer, { useSidebarWidth } from "@/components/SidebarResizer";

export default function Home() {
  const hydrated = useHydrated();
  const state = useShifa();
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const userName = auth.user?.name ?? null;

  // Point the on-device store at the signed-in Google account (or back to guest data on sign-out).
  useEffect(() => {
    if (!hydrated || !auth.enabled || auth.status === "loading") return;
    shifa.switchAccount(userId, { displayName: userName });
  }, [hydrated, auth.enabled, auth.status, userId, userName]);

  if (!hydrated) return <AppSkeleton />;
  if (auth.enabled && auth.status === "loading") return <AppSkeleton />;
  if (auth.ready && auth.enabled && auth.required && !auth.user) {
    return <SignInGate auth={auth} lang={state.lang} onLangChange={(l) => shifa.setLang(l)} />;
  }
  return <ShifaApp state={state} auth={auth} />;
}

/** Light placeholder until localStorage is read (avoids a hydration mismatch). */
function AppSkeleton() {
  return (
    <div className="flex h-dvh" aria-busy="true">
      <div className="hidden w-[300px] shrink-0 border-r bg-surface lg:block" />
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <HeartPulse size={22} aria-hidden />
          <span className="text-lg font-semibold">Shifa</span>
        </div>
        <div className="mx-auto w-full max-w-[760px] flex-1 space-y-3 px-4 pt-10">
          <div className="h-7 w-56 animate-pulse rounded-full bg-surface" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded-full bg-surface" />
          <div className="h-24 w-full animate-pulse rounded-card bg-surface" />
        </div>
        <div className="mx-auto mb-4 h-24 w-[calc(100%-2rem)] max-w-[760px] animate-pulse rounded-[20px] bg-surface" />
      </div>
    </div>
  );
}

function addAndSelect(p: NewPerson) {
  const person = shifa.addPerson({ name: p.name, relation: p.relation, age: p.age });
  shifa.setActivePerson(person.id);
}

function ShifaApp({ state, auth }: { state: ShifaState; auth: ReturnType<typeof useAuth> }) {
  const { lang, people, activePersonId, reports, messages, contacts } = state;
  const chat = useShifaChat();
  const composerRef = useRef<ComposerHandle>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [editPersonId, setEditPersonId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  // "Preferred language: Urdu. New answers will be in Urdu…" after changing it in the sidebar.
  const [langNotice, setLangNotice] = useState(false);
  useEffect(() => {
    if (!langNotice) return;
    const id = setTimeout(() => setLangNotice(false), 10_000);
    return () => clearTimeout(id);
  }, [langNotice, lang]);
  const changeLang = useCallback((l: Lang) => {
    shifa.setLang(l);
    setLangNotice(true);
  }, []);
  const editPerson = editPersonId ? (people.find((p) => p.id === editPersonId) ?? null) : null;
  const openEditPerson = useCallback((id: string) => {
    setDrawerOpen(false);
    setEditPersonId(id);
  }, []);
  const closeEditPerson = useCallback(() => setEditPersonId(null), []);

  const activePerson = people.find((p) => p.id === activePersonId) ?? null;
  const personMessages = useMemo(
    () => (activePerson ? messages.filter((m) => m.personId === activePerson.id) : []),
    [messages, activePerson],
  );
  const myReports = useMemo(() => personReports(reports, activePerson?.id), [reports, activePerson]);
  const sheetReport = sheetId ? (reports.find((r) => r.id === sheetId) ?? null) : null;
  const showWelcome = !activePerson || personMessages.length === 0;

  useEffect(() => {
    document.documentElement.lang = lang === "ur" ? "ur" : "en";
  }, [lang]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const closeSheet = useCallback(() => setSheetId(null), []);
  const openReport = useCallback((id: string) => {
    setDrawerOpen(false);
    setSheetId(id);
  }, []);

  const ask = (text: string) => {
    setSheetId(null);
    void chat.sendText(text);
  };

  const loadDemo = () => {
    if (chat.busy) return;
    shifa.loadDemoFamily();
    setDrawerOpen(false);
  };

  const last = personMessages[personMessages.length - 1];
  const showFollowUps =
    !chat.busy && !showWelcome && myReports.length > 0 && last?.role === "assistant" && last.text.trim().length > 0;

  const sidebar = (
    <>
      <AccountCard auth={auth} lang={lang} />
      <Sidebar
      onChangeLang={changeLang}
      contacts={contacts}
      onEditPerson={openEditPerson}
      lang={lang}
      people={people}
      activeId={activePerson?.id ?? null}
      reports={reports}
      hasMessages={personMessages.length > 0}
      busy={chat.busy}
      onSelectPerson={(id) => {
        shifa.setActivePerson(id);
        setDrawerOpen(false);
      }}
      onAddPerson={(p) => {
        addAndSelect(p);
        setDrawerOpen(false);
      }}
      onOpenReport={openReport}
      onLoadDemo={loadDemo}
      onClearChat={() => {
        if (activePerson) shifa.clearChat(activePerson.id);
        setDrawerOpen(false);
      }}
      onReset={() => {
        shifa.resetAll();
        setSheetId(null);
        setDrawerOpen(false);
      }}
      />
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar: fixed on large screens */}
      <div className="relative hidden shrink-0 lg:flex" style={{ width: sidebarWidth }}>
        <aside className="w-full overflow-y-auto border-r bg-surface" aria-label={t("family", lang)}>
          {sidebar}
        </aside>
        <SidebarResizer width={sidebarWidth} onChange={setSidebarWidth} lang={lang} />
      </div>

      {/* Drawer on phones and tablets */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t("family", lang)}
            className="absolute inset-y-0 left-0 flex w-[min(320px,88vw)] animate-drawer-in flex-col bg-surface"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-3">
              <span className="flex items-center gap-2 text-lg font-semibold">
                <HeartPulse size={22} aria-hidden /> Shifa
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("closeMenu", lang)}
                autoFocus
                className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-bg"
              >
                <X size={22} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{sidebar}</div>
          </aside>
        </div>
      )}

      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1.5 border-b bg-bg px-2 sm:px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("openMenu", lang)}
            aria-expanded={drawerOpen}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface lg:hidden"
          >
            <Menu size={22} aria-hidden />
          </button>
          <span className="flex shrink-0 items-center gap-1.5 text-lg font-semibold tracking-tight">
            <HeartPulse size={22} aria-hidden className="hidden sm:block" />
            Shifa
          </span>
          <div className="min-w-0 flex-1" />
          {/* On phones the family list lives in the drawer, so the person chip is desktop-only. */}
          <div className="hidden lg:block">
            <PersonMenu
              lang={lang}
              people={people}
              activeId={activePerson?.id ?? null}
              onSelect={(id) => shifa.setActivePerson(id)}
              onAdd={addAndSelect}
            />
          </div>
        </header>

        {langNotice && (
          <div role="status" className="animate-fade-in border-b bg-surface">
            <div className="mx-auto flex max-w-[760px] items-start gap-3 px-4 py-2.5">
              <Languages size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" />
              <div className={`min-w-0 flex-1 text-sm ${lang === "ur" ? "urdu" : ""}`}>
                <p className="font-semibold">{t("langNoticeTitle", lang, { name: LANG_SELF_NAME[lang] })}</p>
                <p className="text-muted">{t("langNoticeBody", lang, { name: LANG_SELF_NAME[lang] })}</p>
              </div>
              <button
                type="button"
                onClick={() => setLangNotice(false)}
                aria-label={t("close", lang)}
                className="-me-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-bg"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
          </div>
        )}

        {showWelcome ? (
          <WelcomeState
            lang={lang}
            people={people}
            activeId={activePerson?.id ?? null}
            busy={chat.busy}
            onSelectPerson={(id) => shifa.setActivePerson(id)}
            onAddPerson={addAndSelect}
            onLangChange={(l) => shifa.setLang(l)}
            onScan={() => composerRef.current?.openFilePicker()}
            onAsk={() => composerRef.current?.focus()}
            onSample={() => void chat.runSample()}
            onLoadDemo={loadDemo}
            // New phone? Bring family, reports and chats back from a backup file.
            restoreLink={<BackupRestore lang={lang} busy={chat.busy} variant="link" />}
            footer={
              auth.enabled && auth.ready && !auth.user ? (
                <div className="-mx-3">
                  <AccountCard auth={auth} lang={lang} />
                </div>
              ) : null
            }
          />
        ) : (
          <ChatThread
            messages={personMessages}
            reports={reports}
            lang={lang}
            busyMessageId={chat.busyMessageId}
            scan={chat.scan}
            onAsk={ask}
            onOpenReport={openReport}
            people={people}
            onResolveIdentity={(id, choice) => void chat.resolveIdentity(id, choice)}
            onWrongPerson={chat.startMove}
            contacts={contacts}
            onSetRelation={(id, rel) => {
              // "Sister" also tells us the sex, if the profile doesn't have one yet.
              const sex = relationSex(rel);
              const unset = !people.find((p) => p.id === id)?.sex;
              shifa.updatePerson(id, { relation: rel, ...(sex && unset ? { sex } : {}) });
            }}
            onEditPerson={openEditPerson}
            footer={
              showFollowUps ? <FollowUpChips lang={lang} canCompare={myReports.length >= 2} onPick={ask} /> : null
            }
          />
        )}

        <div className="pb-safe shrink-0 bg-bg pt-2">
          <div className="mx-auto max-w-[760px] px-3 sm:px-4">
            <Composer
              ref={composerRef}
              lang={lang}
              busy={chat.busy}
              onSend={(text) => void chat.sendText(text)}
              onFile={(file, note) => void chat.scanFile(file, note)}
            />
            <Disclaimer lang={lang} />
          </div>
        </div>
      </div>

      <PersonEditSheet person={editPerson} people={people} reports={reports} lang={lang} onClose={closeEditPerson} />
      <ReportSheet
        key={sheetId ?? "closed"}
        report={sheetReport}
        lang={lang}
        onClose={closeSheet}
        onAsk={chat.busy ? undefined : ask}
        onDelete={(id) => {
          shifa.deleteReport(id);
          setSheetId(null);
        }}
      />
    </div>
  );
}
