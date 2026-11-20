// Minimal SQL builder. A query is a list of literal fragments plus values, and
// can be rendered either as a parameterised statement ($1, $2 … for the pg
// driver) or with values inlined as safely escaped literals (for the Supabase
// gateway function, which accepts a single SQL string).

export type SqlValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | readonly (string | number | null)[]
  | { [k: string]: unknown };

export class Sql {
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
  constructor(strings: readonly string[], values: readonly unknown[]) {
    this.strings = strings;
    this.values = values;
  }
}

/** Raw, trusted SQL fragment (identifiers, keywords). Never pass user input. */
export class RawSql {
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }
}

/** A value that must be sent as JSON (use with ::jsonb). */
export class Json {
  readonly value: unknown;
  constructor(value: unknown) {
    this.value = value;
  }
}

export function json(value: unknown): Json {
  return new Json(value);
}

export function raw(text: string): RawSql {
  return new RawSql(text);
}

export function sql(strings: TemplateStringsArray, ...values: unknown[]): Sql {
  return new Sql(strings, values);
}

/** Joins fragments with a separator. */
export function join(parts: Sql[], separator = ", "): Sql {
  if (parts.length === 0) return new Sql([""], []);
  const strings: string[] = [""];
  const values: unknown[] = [];
  parts.forEach((p, i) => {
    if (i > 0) strings[strings.length - 1] += separator;
    values.push(p);
    strings.push("");
  });
  return new Sql(strings, values);
}

export const empty = new Sql([""], []);

type Flat = { strings: string[]; values: unknown[] };

function flatten(q: Sql, out: Flat = { strings: [""], values: [] }): Flat {
  q.strings.forEach((s, i) => {
    out.strings[out.strings.length - 1] += s;
    if (i < q.values.length) {
      const v = q.values[i];
      if (v instanceof Sql) {
        flatten(v, out);
      } else if (v instanceof RawSql) {
        out.strings[out.strings.length - 1] += v.text;
      } else {
        out.values.push(v);
        out.strings.push("");
      }
    }
  });
  return out;
}

function normaliseParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Json) return JSON.stringify(v.value ?? null);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : x));
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

export function toParameterised(q: Sql): { text: string; values: unknown[] } {
  const f = flatten(q);
  let text = f.strings[0];
  for (let i = 0; i < f.values.length; i++) text += `$${i + 1}` + f.strings[i + 1];
  return { text, values: f.values.map(normaliseParam) };
}

function quoteString(s: string): string {
  if (s.includes("\u0000")) throw new Error("NUL byte not allowed in SQL literal");
  // standard_conforming_strings is on (Postgres default since 9.1): inside
  // '…' only the quote character itself needs escaping.
  return "'" + s.replace(/'/g, "''") + "'";
}

function arrayLiteral(arr: readonly unknown[]): string {
  const items = arr.map((x) => {
    if (x === null || x === undefined) return "NULL";
    const s = String(x);
    if (s.includes("\u0000")) throw new Error("NUL byte not allowed in SQL literal");
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  });
  return "{" + items.join(",") + "}";
}

export function literal(v: unknown): string {
  v = normaliseParam(v);
  if (v === null) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("Non-finite number in SQL");
    return String(v);
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return quoteString(arrayLiteral(v));
  return quoteString(String(v));
}

export function toInline(q: Sql): string {
  const f = flatten(q);
  let text = f.strings[0];
  for (let i = 0; i < f.values.length; i++) text += literal(f.values[i]) + f.strings[i + 1];
  return text;
}
