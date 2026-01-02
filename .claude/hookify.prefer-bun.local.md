---
name: prefer-bun
enabled: true
event: bash
pattern: ^(npm|pnpm|yarn)\s+
action: block
---

**Use bun instead of npm/pnpm/yarn**

This project uses bun as the package manager and runner.

Replace with:
- `npm run` → `bun run`
- `npm test` → `bun test`
- `npm install` → `bun install`
- `npx` → `bunx`
