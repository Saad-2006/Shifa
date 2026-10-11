"use client";

// Shows a passcode screen only when /api/health says the demo needs an access code and
// none is stored. Fails open: if health can't be reached, the app shows and the API
// itself still enforces the code.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ACCESS_REQUIRED_EVENT, apiFetch, getAccessCode, setAccessCode } from "@/lib/apiClient";

type GateState = "checking" | "open" | "locked";

const WRONG_CODE = "That access code didn't work. Please check it and try again.";

export default function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    // A stored code is trusted until the API says otherwise (401 -> event below).
    if (getAccessCode()) {
      setState("open");
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    apiFetch("/api/health", { cache: "no-store", signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) return false;
        const body = (await res.json()) as { accessRequired?: unknown };
        return body.accessRequired === true;
      })
      .catch(() => false) // fail open
      .then((required) => {
        if (!cancelled) setState(required && !getAccessCode() ? "locked" : "open");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  useEffect(() => {
    const onRequired = () => {
      setAccessCode("");
      setError(WRONG_CODE);
      setBusy(false);
      setState("locked");
    };
    window.addEventListener(ACCESS_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(ACCESS_REQUIRED_EVENT, onRequired);
  }, []);

  useEffect(() => {
    if (state === "locked") inputRef.current?.focus();
  }, [state]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    setAccessCode(value);
    // Check the code straight away: the access check runs before any body parsing, so an
    // empty chat request answers 401 for a wrong code and 400 for a right one (no AI call).
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (res.status === 401) return; // the event handler shows the error
      if (res.status === 429) {
        setAccessCode("");
        setError("Too many attempts. Please wait a minute and try again.");
        setBusy(false);
        return;
      }
    } catch {
      // network trouble: let them in; the API still enforces the code
    }
    setBusy(false);
    setCode("");
    setState("open");
  }

  if (state === "open") return <>{children}</>;
  if (state === "checking") return <div className="min-h-dvh bg-bg" aria-busy="true" />;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 text-ink">
      <div className="w-full max-w-sm rounded-[16px] border border-border bg-bg p-6">
        <p className="text-center text-3xl font-semibold tracking-tight">Shifa</p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3" noValidate>
          <label htmlFor="shifa-access-code" className="text-[17px] font-medium">
            Enter the demo access code
          </label>
          <input
            ref={inputRef}
            id="shifa-access-code"
            name="access-code"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "shifa-access-error" : undefined}
            className="h-12 w-full rounded-[12px] border border-border bg-bg px-4 text-[17px] text-ink outline-none placeholder:text-muted focus:border-ink/50 focus:ring-2 focus:ring-ink/10"
            placeholder="Access code"
          />
          {error && (
            <p id="shifa-access-error" role="alert" className="text-[15px] text-bad">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="h-12 w-full rounded-[12px] bg-ink text-[17px] font-medium text-on-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
        <p className="mt-4 text-center text-[15px] text-muted">Ask the Shifa team for the code.</p>
      </div>
    </main>
  );
}
