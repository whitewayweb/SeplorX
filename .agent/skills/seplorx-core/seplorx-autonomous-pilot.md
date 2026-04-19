# SeplorX Autonomous Pilot Protocol

This protocol defines how I (Antigravity) should work when you request a "Set and Forget" feature. It combines SeplorX's safety patterns with the specialized agents from ECC.

## 1. The Autonomous Feature Loop

When a feature is requested, I follow this loop without stopping for minor permissions:

1.  **Specialist Delegation**: 
    - Invoke the **Planner** to create the implementation path.
    - Invoke the **Architect** to verify logic against `seplorx-architecture/SKILL.md`.
2.  **Implementation**: 
    - Execute changes using absolute paths and strict TypeScript.
    - If a build error occurs, I MUST solve it immediately using the **Build Error Resolver**.
3.  **Cross-Check**: 
    - Before finishing, run `yarn fix` (lint + knip + build) to ensure project integrity.
4.  **Final Quality Gate**: 
    - Invoke the **Code Reviewer** specialist to perform an automated audit.

## 2. Decision Matrix (When to Stop)

| Situation | Action |
|-----------|--------|
| **Bug/Build Error** | **Autonomous Fix**. Do not stop. |
| **Missing Logic/Type** | **Research & Resolve**. Use reconnaissance to find existing patterns. |
| **Logic Conflict** | **Stop & Ask**. If the project rules conflict with a new requirement. |
| **Destructive Migration** | **Stop & Ask**. Before running `db:push` or deleting columns. |
| **Branding/UI Change** | **Stop & Ask**. For major visual departures from SeplorX design. |

## 3. The Multi-Agent Verification

I am now authorized to run "sub-sessions" where I review my own work using different personas (Architect, Security, Performance). You will see these summarized in the final report.
