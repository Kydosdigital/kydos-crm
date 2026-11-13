import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const baseHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      {
        // Internal app and API routes: never framed by other sites.
        source: "/:path((?!f/|api/embed/|api/forms/).*)",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, ...baseHeaders],
      },
      {
        // Public hosted forms and embed routes are designed to be iframed by client sites.
        source: "/:path(f/.*|api/embed/.*|api/forms/.*)",
        headers: baseHeaders,
      },
    ];
  },
};

export default nextConfig;
