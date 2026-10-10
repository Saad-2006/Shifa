import type { Metadata } from "next";
import { Suspense } from "react";
import SummaryView from "./SummaryView";

export const metadata: Metadata = {
  title: "Doctor Summary · Shifa",
  description: "A one-page printable summary of lab results, checked by Shifa's rules.",
};

export default function SummaryPage() {
  return (
    // Next 15 requires a Suspense boundary around useSearchParams().
    <Suspense fallback={<p className="p-8 text-muted">Loading…</p>}>
      <SummaryView />
    </Suspense>
  );
}
