# Security Guidelines

## Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak sensitive data
- [ ] PII Redaction: All logging uses `logger` from `@/lib/logger` (no direct `console` logs for PII)
- [ ] Password Complexity: 12+ characters with mixed types for all password inputs

## Secret Management

- NEVER hardcode secrets in source code
- ALWAYS use environment variables or a secret manager
- Validate that required secrets are present at startup
- Rotate any secrets that may have been exposed

## PII and Logging (Amazon SP-API Compliance)

- NEVER use `console.log`, `console.error`, or `console.warn` in security, compliance, or PII-sensitive code paths.
- ALWAYS use the secure `logger` from `@/lib/logger` which automatically redacts PII and handles Error objects safely.
- Keep the `SENSITIVE_KEYS` list in `src/lib/logger.ts` updated with any new PII fields.

## Credential Management

- Passwords MUST be at least 12 characters.
- Passwords MUST include uppercase, lowercase, numbers, and special characters.
- Use the standard `ChangePasswordSchema` for all password-related validations.

## Security Response Protocol

If security issue found:
1. STOP immediately
2. Use **security-reviewer** agent
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase for similar issues
