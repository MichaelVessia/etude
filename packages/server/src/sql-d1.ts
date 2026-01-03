import type { D1Database } from "@cloudflare/workers-types"
import { D1Client } from "@effect/sql-d1"

/**
 * Create a D1 SQL layer from a Cloudflare D1 binding.
 * Used in the Cloudflare Worker entry point where D1 is provided via env.
 */
export const makeD1Layer = (db: D1Database) =>
  D1Client.layer({ db })
