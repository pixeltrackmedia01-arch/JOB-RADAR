import type { RawJob } from "../normalize.ts";

export class SourceError extends Error {
  kind: "rate_limited" | "timeout" | "http" | "parse" | "config" | "budget" | "network";
  status?: number;
  retryAfterSeconds?: number;
  constructor(kind: SourceError["kind"], message: string, opts: { status?: number; retryAfterSeconds?: number } = {}) {
    super(message);
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
  get retryable(): boolean {
    return this.kind !== "config" && this.kind !== "parse" && !(this.kind === "http" && this.status && this.status >= 400 && this.status < 500 && this.status !== 408);
  }
}

export type SourceConfig = {
  id: string;
  slug: string;
  max_requests_per_cycle: number;
  rate_limit_per_minute: number;
  timeout_ms: number;
};

export type FetchContext = {
  /** Rate-limited, budgeted, timed-out JSON fetch. */
  getJson: (url: string, init?: RequestInit) => Promise<any>;
  requestsMade: () => number;
  budgetLeft: () => number;
  log: (message: string, data?: Record<string, unknown>) => void;
};

export type Connector = {
  slug: string;
  /** Throws SourceError("config") when credentials are missing. */
  collect: (ctx: FetchContext) => Promise<RawJob[]>;
};

const UA = "JobRadarBot/1.0 (+job aggregation; respects source terms and rate limits)";

export function createFetchContext(
  src: SourceConfig,
  opts: { fetchImpl?: typeof fetch; log?: FetchContext["log"]; sleep?: (ms: number) => Promise<void> } = {},
): FetchContext {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let made = 0;
  let lastAt = 0;
  const minGapMs = Math.ceil(60_000 / Math.max(1, src.rate_limit_per_minute));
  return {
    requestsMade: () => made,
    budgetLeft: () => src.max_requests_per_cycle - made,
    log: opts.log ?? (() => {}),
    async getJson(url, init) {
      if (made >= src.max_requests_per_cycle) throw new SourceError("budget", "Request budget for this cycle exhausted");
      const wait = lastAt + minGapMs - Date.now();
      if (made > 0 && wait > 0) await sleep(Math.min(wait, 10_000));
      made++;
      lastAt = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), src.timeout_ms);
      let res: Response;
      try {
        res = await fetchImpl(url, {
          ...init,
          signal: ctrl.signal,
          headers: { "User-Agent": UA, Accept: "application/json", ...(init?.headers ?? {}) },
          cache: "no-store",
        } as RequestInit);
      } catch (e: any) {
        if (e?.name === "AbortError") throw new SourceError("timeout", `Timed out after ${src.timeout_ms} ms`);
        throw new SourceError("network", `Network error: ${e?.message ?? e}`);
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after")) || undefined;
        throw new SourceError("rate_limited", "Source responded 429 Too Many Requests", { status: 429, retryAfterSeconds: ra });
      }
      if (!res.ok) throw new SourceError("http", `HTTP ${res.status} from source`, { status: res.status });
      try {
        return await res.json();
      } catch {
        throw new SourceError("parse", "Source returned invalid JSON");
      }
    },
  };
}
