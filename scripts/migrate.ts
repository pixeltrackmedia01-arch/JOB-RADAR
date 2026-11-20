// Applies db/migrations/*.sql to DATABASE_URL and sets the gateway secret hash.
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
for (const f of readdirSync("db/migrations").sort()) {
  await client.query(readFileSync(`db/migrations/${f}`, "utf8"));
  console.log("applied", f);
}
if (process.env.DB_GATEWAY_SECRET) {
  const h = createHash("sha256").update(process.env.DB_GATEWAY_SECRET).digest();
  await client.query("insert into jobradar.app_secrets (id, secret_hash) values (1, $1) on conflict (id) do update set secret_hash = excluded.secret_hash, updated_at = now()", [h]);
  console.log("gateway secret set");
}
await client.end();
