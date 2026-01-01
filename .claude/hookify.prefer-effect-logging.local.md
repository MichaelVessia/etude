---
name: prefer-effect-logging
enabled: true
event: file
pattern: console\.log\(
action: warn
---

**Use Effect logging instead of console.log**

This is an Effect project. Use Effect's logging instead:

```typescript
import { Effect } from "effect"

// Instead of console.log:
Effect.log("message")
Effect.logDebug("debug message")
Effect.logInfo("info message")
Effect.logWarning("warning message")
Effect.logError("error message")

// With structured data:
Effect.log("message").pipe(Effect.annotateLogs("key", value))
```

Remove console.log statements after debugging.
