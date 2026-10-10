import type { NextConfig } from "next";

// Baseline security headers for every route. No Content-Security-Policy yet: a strict CSP
// needs nonces for Next's inline scripts, too risky to wire up the night before the demo.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Camera (scan a report) and microphone (voice input) are used by the app itself.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
