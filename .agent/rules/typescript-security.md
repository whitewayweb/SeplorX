---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Security

> This file extends [common/security.md](../common/security.md) with TypeScript/JavaScript specific content.

## Secret Management

```typescript
// NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ALWAYS: Environment variables
const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

## Logging and PII Redaction

```typescript
// NEVER: Direct console logging of objects containing PII
console.log("Processing order", order); // Risks leaking email/name

// ALWAYS: Use the secure logger
import { logger } from "@/lib/logger";
logger.info("Processing order", order); // Automatically redacts PII
```

## Credential Complexity (SP-API Requirement)

```typescript
// ALWAYS: Enforce 12-char mixed complexity in schemas
export const ChangePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
});
```

## Agent Support

- Use **security-reviewer** skill for comprehensive security audits
