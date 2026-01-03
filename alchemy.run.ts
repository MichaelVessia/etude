import alchemy from "alchemy"
import { Assets, D1Database, DurableObjectNamespace, Worker } from "alchemy/cloudflare"
import { CloudflareStateStore } from "alchemy/state"

const app = await alchemy("etude", {
  stage: process.env.ALCHEMY_STAGE ?? "dev",
  stateStore: process.env.ALCHEMY_STATE_TOKEN
    ? (scope) => new CloudflareStateStore(scope)
    : undefined,
})

// D1 Database for pieces and attempts
const database = await D1Database("etude-db", {
  migrationsDir: "./packages/server/migrations",
})

// Durable Object for session state
const sessionDO = DurableObjectNamespace("session-do", {
  className: "SessionDO",
})

// Static assets for the SPA
const assets = await Assets({
  path: "./packages/client/dist",
})

// Worker serving API + static assets
const worker = await Worker("etude", {
  entrypoint: "./packages/server/src/worker.ts",
  bindings: {
    DB: database,
    SESSION_DO: sessionDO,
    ASSETS: assets,
  },
  domains: ["etude.vessia.net"],
  url: true, // Also enable workers.dev URL for testing
  compatibility: "node", // Node.js compatibility for Effect
})

console.log(`Worker URL: ${worker.url}`)
if (worker.domains?.[0]) {
  console.log(`Custom domain: https://${worker.domains[0].domainName}`)
}

await app.finalize()
