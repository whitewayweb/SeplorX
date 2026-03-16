---
description: Reconnaissance and Pre-Flight Checks for AI Agents
---

# Pre-Flight Reconnaissance (MANDATORY)

Before writing *any* new file or implementing *any* new type interfaces, you MUST run this workflow to ensure you aren't duplicating effort or ignoring the established architecture.

1. **Check Directory Structure**
   Run `list_dir` on the target directory where you intend to write code.
   - Are there existing files that serve a similar purpose? (e.g., `queries.ts`, `actions.ts`)
   - If yes, **do not create a new file**. Append your new functions to the existing file.

2. **Check for Generated Sub-Folders**
   Look for an `api/types/` or similar directory.
   - Run `list_dir` on those folders to see if generated API schemas already exist (e.g., `ordersV0Schema.ts`).
   - If they do, use standard tools like `grep_search` to find how the official types are exported and use those directly instead of creating ad-hoc `interface FooRaw {}` definitions.

3. **Check Project Documentation**
   Use `view_file` to quickly scan:
   - `CLAUDE.md` to ensure your proposed changes comply with the project's strict architecture guidelines.
   - `docs/` folder (e.g., `channels-integration.md`) for any existing design patterns on how your feature should be implemented.

By forcing yourself to do this BEFORE touching code, you guarantee that your output matches the project's structural integrity.
