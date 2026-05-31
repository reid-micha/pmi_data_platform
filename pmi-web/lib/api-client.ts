/**
 * Thin typed fetch wrapper over pmi-api.
 *
 * Two URL contexts:
 *   - Server (SSR / Server Components): `PMI_API_URL` (internal compose hostname).
 *   - Browser: `NEXT_PUBLIC_PMI_API_URL` (must be reachable from the user's host).
 *
 * The `serverFetch` helper picks the right base depending on where it runs,
 * which means Server Components can talk to pmi-api inside the docker network
 * while client-side `useEffect` calls go over localhost. This matches the
 * approach we'll need once auth headers land (server-side never leaks the
 * server API key to the browser).
 */

import type {
  ExplainPayload,
  HistoryEnvelope,
  IndexSummary,
  ScoreEnvelope,
  SenateBoardEnvelope,
  SourceHealthRow,
} from "./types";

const SERVER_BASE =
  process.env.PMI_API_URL || process.env.NEXT_PUBLIC_PMI_API_URL || "http://pmi-api:8000";

const BROWSER_BASE = process.env.NEXT_PUBLIC_PMI_API_URL || "http://localhost:8001";

function pickBase(): string {
  return typeof window === "undefined" ? SERVER_BASE : BROWSER_BASE;
}

class PmiApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown,
  ) {
    super(`pmi-api ${status} at ${url}`);
    this.name = "PmiApiError";
  }
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const base = pickBase();
  const url = `${base}${path}`;
  // Default to no caching on the server so a Server Component refresh
  // surfaces a fresh score immediately. Override per-call via `init.cache`
  // (e.g. `{ next: { revalidate: 60 } }`) once real volume shows up.
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore — body might not be JSON
    }
    throw new PmiApiError(res.status, url, body);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => get<{ status: string; db: string }>("/health"),
  listIndexes: () => get<IndexSummary[]>("/indexes"),
  getIndex: (id: string) => get<IndexSummary>(`/indexes/${encodeURIComponent(id)}`),
  getScore: (id: string, opts?: { asOf?: string }) => {
    const qs = opts?.asOf ? `?as_of=${encodeURIComponent(opts.asOf)}` : "";
    return get<ScoreEnvelope>(`/indexes/${encodeURIComponent(id)}/score${qs}`);
  },
  getHistory: (id: string, opts?: { from?: string; to?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return get<HistoryEnvelope>(`/indexes/${encodeURIComponent(id)}/score/history${qs}`);
  },
  explainScore: (id: string, opts?: { asOf?: string }) => {
    const qs = opts?.asOf ? `?as_of=${encodeURIComponent(opts.asOf)}` : "";
    return get<ExplainPayload>(`/indexes/${encodeURIComponent(id)}/explain${qs}`);
  },
  senateBoard: (id: string, opts?: { asOf?: string }) => {
    const qs = opts?.asOf ? `?as_of=${encodeURIComponent(opts.asOf)}` : "";
    return get<SenateBoardEnvelope>(
      `/indexes/${encodeURIComponent(id)}/senate-board${qs}`,
    );
  },
  sourcesHealth: () => get<SourceHealthRow[]>("/sources/health"),
};

export { PmiApiError };
