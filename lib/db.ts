// Database access. Two transports, identical results:
//  - "supabase": POST to the secret-gated public.jobradar_exec gateway through
//    the Supabase REST API (production on Vercel).
//  - "pg": direct Postgres connection via DATABASE_URL (local dev, tests).
//    With DB_VIA_GATEWAY=1 the pg transport also goes through the gateway
//    function, exercising exactly the production code path.
// Every query's rows come back as JSON (jsonb_agg), so timestamps are ISO
// strings and numerics are numbers on both transports.

import { Sql, toInline, toParameterised } from "./sql.ts";

export type Row = Record<string, any>;

type Transport = (q: Sql) => Promise<Row[]>;

let transport: Transport | null = null;
let pgPool: any = null;

function wrap(text: string): string {
  return `with t as (${text}) select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows from t`;
}

async function pgTransport(): Promise<Transport> {
  const { default: pg } = await import("pg");
  pgPool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
  const viaGateway = process.env.DB_VIA_GATEWAY === "1";
  return async (q) => {
    if (viaGateway) {
      const res = await pgPool.query("select public.jobradar_exec($1, $2) as rows", [
        process.env.DB_GATEWAY_SECRET,
        toInline(q),
      ]);
      return res.rows[0].rows as Row[];
    }
    const { text, values } = toParameterised(q);
    const res = await pgPool.query(wrap(text), values);
    return res.rows[0].rows as Row[];
  };
}

function supabaseTransport(): Transport {
  const url = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY!;
  const secret = process.env.DB_GATEWAY_SECRET!;
  return async (q) => {
    const res = await fetch(`${url}/rest/v1/rpc/jobradar_exec`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_secret: secret, p_sql: toInline(q) }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      let message = body;
      try {
        message = JSON.parse(body).message ?? body;
      } catch {}
      throw new Error(`Database error (${res.status}): ${message}`);
    }
    return (await res.json()) as Row[];
  };
}

async function getTransport(): Promise<Transport> {
  if (transport) return transport;
  if (process.env.DATABASE_URL) transport = await pgTransport();
  else if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.DB_GATEWAY_SECRET)
    transport = supabaseTransport();
  else throw new Error("Database is not configured (set DATABASE_URL or SUPABASE_URL/SUPABASE_ANON_KEY/DB_GATEWAY_SECRET)");
  return transport;
}

export function isDbConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
      (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.DB_GATEWAY_SECRET),
  );
}

export async function query<T extends Row = Row>(q: Sql): Promise<T[]> {
  const t = await getTransport();
  return (await t(q)) as T[];
}

export async function one<T extends Row = Row>(q: Sql): Promise<T | null> {
  const rows = await query<T>(q);
  return rows[0] ?? null;
}

export async function closeDb(): Promise<void> {
  if (pgPool) await pgPool.end();
  pgPool = null;
  transport = null;
}
