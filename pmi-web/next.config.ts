import type { NextConfig } from "next";

const config: NextConfig = {
  // Strict React 19 + App Router defaults. Anything that would lock us into
  // an experimental flag goes in CLAUDE.md §13 first.
  reactStrictMode: true,
  // Required for the docker bind-mounted dev container — Next sometimes
  // misses changes inside a mounted volume without explicit polling.
  experimental: {
    // Empty for now; placeholder for later (e.g. typedRoutes, ppr).
  },
  // Headers / redirects: not yet — keep the surface area small at scaffold time.
};

export default config;
