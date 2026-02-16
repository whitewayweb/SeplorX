# Architecture

## Overview

SeplorX is a shipping/logistics management portal. It serves as a central hub where users integrate third-party shipping APIs (Shree Maruti, Delhivery, DHL, FedEx, etc.) and manage shipments.

## System Design

```
┌─────────────────────────────────────────────────┐
│                   Next.js App                    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Dashboard │  │   Apps   │  │  Future Pages │  │
│  │   /      │  │  /apps   │  │  /shipments   │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│         │             │              │           │
│         └─────────────┼──────────────┘           │
│                       │                          │
│              ┌────────┴────────┐                 │
│              │ Server Actions  │                 │
│              │ (mutations)     │                 │
│              └────────┬────────┘                 │
│                       │                          │
│              ┌────────┴────────┐                 │
│              │   Drizzle ORM   │                 │
│              └────────┬────────┘                 │
└───────────────────────┼──────────────────────────┘
                        │
               ┌────────┴────────┐
               │ Supabase PgSQL  │
               │ (port 6543)     │
               └─────────────────┘
```

## Layout

Sidebar navigation with two main sections:
- **Dashboard** (`/`) — overview and quick stats
- **Apps** (`/apps`) — install and configure third-party integrations

The sidebar uses shadcn/ui's `Sidebar` component with `SidebarProvider` wrapping the root layout.

## Key Patterns

### 1. Registry Pattern (Apps)
App definitions are TypeScript objects in `src/lib/apps/registry.ts`. The database only stores what the user has installed and their configuration. This means:
- No app metadata in the DB
- Adding new apps is a code-only change
- The registry is the single source of truth for app definitions

### 2. Server Components + Server Actions
- **Pages** are server components that read directly from the DB
- **Mutations** happen through server actions (`"use server"`)
- **Client components** handle interactivity (dialogs, forms, tabs)
- Data flows: Server Component → props → Client Component → Server Action → revalidatePath

### 3. JSONB Config Storage
Each app has different config fields (API keys, account IDs, etc.). Instead of a normalized key-value table, we use a single `jsonb` column. The app registry defines what fields exist, and Zod validates them dynamically.

### 4. Dynamic Validation
Zod schemas are built at runtime from the app registry's `configFields`. This keeps validation in sync with the registry automatically — no manual schema updates when adding apps.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript (strict) |
| Database | Supabase PostgreSQL |
| ORM | Drizzle ORM + postgres-js |
| Styling | Tailwind CSS v4, shadcn/ui |
| Validation | Zod v4 |
| Icons | Lucide React |
| Deployment | Vercel (serverless) |
| Package Manager | Yarn 1 |

## Directory Structure

```
src/
├── app/                        # Next.js App Router
│   ├── apps/                   # Apps integration page
│   │   ├── page.tsx            # Server component (reads DB + registry)
│   │   ├── actions.ts          # Server actions (install/configure/uninstall)
│   │   └── loading.tsx         # Streaming skeleton
│   ├── api/health/             # Health check endpoint
│   ├── page.tsx                # Dashboard
│   ├── error.tsx               # Global error boundary
│   ├── layout.tsx              # Root layout with sidebar
│   └── globals.css             # Tailwind + design tokens
├── components/
│   ├── apps/                   # App-specific components
│   │   ├── app-card.tsx        # Individual app card
│   │   ├── app-grid.tsx        # Responsive card grid
│   │   ├── app-config-dialog.tsx # Config form dialog
│   │   ├── app-icon.tsx        # Dynamic Lucide icon
│   │   ├── app-status-badge.tsx # Status badge
│   │   └── category-tabs.tsx   # Category tab navigation
│   ├── layout/                 # Layout components
│   │   └── app-sidebar.tsx     # Sidebar navigation
│   └── ui/                     # shadcn/ui primitives
├── db/
│   ├── schema.ts               # Drizzle schema (all tables)
│   └── index.ts                # DB connection + health check
└── lib/
    ├── apps/                   # App registry system
    │   ├── types.ts            # Type definitions
    │   ├── registry.ts         # App definitions + helpers
    │   └── index.ts            # Barrel export
    ├── validations/            # Zod schemas
    │   └── apps.ts             # App config validation
    ├── env.ts                  # Environment validation
    └── utils.ts                # cn() helper
```
