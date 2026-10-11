import type { Metadata } from "next";
import { Suspense } from "react";
import DashboardView from "./DashboardView";

export const metadata: Metadata = {
  title: "Trends & reports · Shifa",
  description: "Every trend chart and report for one family member, most urgent first. Checked by Shifa's rules.",
};

export default function DashboardPage() {
  return (
    // Next 15 requires a Suspense boundary around useSearchParams().
    <Suspense fallback={<p className="p-8 text-muted">Loading…</p>}>
      <DashboardView />
    </Suspense>
  );
}
