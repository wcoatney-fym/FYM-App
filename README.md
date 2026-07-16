# FYM Command

Internal operations dashboard for FYM Financial's growth and CRM team.

## Tech Stack

- **React 18** + TypeScript
- **Vite** dev server & build
- **Tailwind CSS** + shadcn/ui components
- **Supabase** (JS client for data)
- **React Router v6** (client-side routing)
- **Recharts** (charts)
- **Zustand** (state management)

## Getting Started

```bash
# Install dependencies
npm install

# Copy env file and fill in Supabase credentials (optional)
cp .env.example .env

# Start dev server
npm run dev
```

The app works out of the box with **mock data mode** enabled. Toggle it off in Settings once you've configured Supabase credentials.

## Pages

| Route          | Description                              |
| -------------- | ---------------------------------------- |
| `/`            | Dashboard — KPI cards + retention chart  |
| `/agencies`    | Sub-agency directory with detail panel   |
| `/agents`      | Searchable agent directory               |
| `/contracting` | Contracting intake pipeline (Kanban)     |
| `/at-risk`     | At-risk policies table                   |
| `/crm-ops`     | CRM operations (placeholder)             |
| `/settings`    | Supabase config + mock data toggle       |

## Deployment (Netlify)

The `public/_redirects` file is included for SPA fallback routing. Deploy with:

```
Build command: npm run build
Publish directory: dist
```

## Configuration

Supabase credentials can be set via:
1. `.env` file (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
2. Settings page (stored in localStorage, overrides .env)

Mock data mode is on by default — no live credentials needed to explore the UI.
