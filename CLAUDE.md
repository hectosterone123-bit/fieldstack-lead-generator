# FieldStack Lead Generator — Project Context

## What This Is

AI-powered lead generation + CRM tool for HVAC contractors. Express + SQLite backend, React + TypeScript + Tailwind frontend. Finds leads via OpenStreetMap, enriches them by scraping websites, manages them through a pipeline, and provides multi-channel outreach templates.

## Quick Start

```bash
# Backend (port 3001)
cd backend && npm run dev

# Frontend (port 5173, proxies /api → localhost:3001)
cd frontend && npm run dev
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend | Express 4, sql.js (SQLite), Cheerio, node-fetch |
| Frontend | React 19, TypeScript, Vite 7, Tailwind 3, React Query 5, Lucide icons |
| DB | SQLite file at `backend/data/leads.db`, auto-created on first run |
| API format | All responses: `{ success: true, data: ... }` or `{ success: false, error: "..." }` |

## Database Schema

### leads table
Core fields: `id`, `business_name`, `phone`, `email`, `website`, `address`, `city`, `state`, `zip`, `service_type`, `status`, `heat_score` (0-100), `estimated_value`, `notes`, `tags` (JSON array string)

Discovery fields: `osm_id`, `osm_type`, `google_place_id`, `rating`, `review_count`, `latitude`, `longitude`, `google_maps_url`

Tracking fields: `contact_count`, `last_contacted_at`, `next_followup_at`, `source` (manual|osm_finder|csv_import|google_places)

Enrichment fields: `enrichment_data` (JSON), `enriched_at`, `has_website`, `website_live`

Timestamps: `created_at`, `updated_at`

### activities table
`id`, `lead_id` (FK), `type`, `title`, `description`, `metadata`, `created_at`

### templates table
`id`, `name`, `channel` (email|sms|call_script), `status_stage`, `step_order` (1-7), `subject`, `body`, `is_default`, `created_at`, `updated_at`

Seeded with 54 default templates across 7 outreach steps.

## Enums / Constants

- **LeadStatus**: `new`, `contacted`, `qualified`, `proposal_sent`, `booked`, `lost`, `closed_won`
- **ServiceType**: `hvac`, `plumbing`, `electrical`, `roofing`, `landscaping`, `pest_control`, `general`
- **ActivityType**: `status_change`, `note`, `call_attempt`, `email_sent`, `sms_sent`, `heat_update`, `import`, `enrichment`
- **TemplateChannel**: `email`, `sms`, `call_script`

## Backend Structure

```
backend/src/
├── server.js              — Express app, mounts routes, serves frontend dist
├── db.js                  — sql.js init, schema creation, template seeding
├── middleware/
│   └── errorHandler.js    — Global error handler
├── routes/
│   ├── leads.js           — Lead CRUD, bulk ops, CSV import/export, follow-ups, snooze
│   ├── finder.js          — OSM search (POST /search) + bulk import (POST /import)
│   ├── stats.js           — Dashboard aggregates (GET /stats)
│   └── templates.js       — Template CRUD + preview rendering
└── services/
    ├── heatScoreService.js    — computeInitialHeatScore(), recomputeHeatScore()
    ├── overpassService.js     — OSM Nominatim geocoding + Overpass queries
    ├── enrichService.js       — Website validation, phone normalization
    ├── scrapeService.js       — Cheerio: emails, team names, services, tech stack
    └── templateService.js     — Variable rendering ({business_name}, {city}, etc.)
```

### DB helpers (from db.js)
- `db.all(sql, params)` — Returns array of rows
- `db.get(sql, params)` — Returns single row or undefined
- `db.run(sql, params)` — Execute statement, returns `{ lastInsertRowid }`, auto-saves to disk

### API Endpoints

**Leads** (`/api/leads`):
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Paginated list with filters (status, service_type, search, tag, sort, order, page, limit) |
| POST | `/` | Create lead |
| PUT | `/:id` | Update lead (updatable fields whitelist) |
| GET | `/:id` | Single lead + activities array |
| DELETE | `/:id` | Delete lead + activities |
| PATCH | `/:id/status` | Change status + log activity + auto heat score |
| PATCH | `/:id/heat-score` | Manual heat score override |
| PATCH | `/:id/snooze` | Snooze follow-up by N days |
| POST | `/:id/enrich` | Scrape website for intel |
| POST | `/:id/activities` | Log activity (note, call, email) |
| PATCH | `/bulk` | Bulk status/delete/export |
| POST | `/bulk/export` | Bulk CSV download |
| GET | `/export` | Filtered CSV download |
| POST | `/import-csv` | Import from CSV string |
| GET | `/followups/today` | Returns `{ overdue: Lead[], due_today: Lead[] }` |

**IMPORTANT**: `/followups/today`, `/export`, `/bulk`, `/import-csv` are all registered BEFORE `/:id` to avoid Express matching them as an `:id` param.

**Finder** (`/api/finder`):
| POST | `/search` | Search OSM by service_type, city, state, radius |
| POST | `/import` | Bulk import finder results into leads |

**Stats** (`/api/stats`):
| GET | `/` | Dashboard aggregates (total, by_status, by_service, pipeline_value, hot_leads_count, conversion_rate, recent_activities) |

**Templates** (`/api/templates`):
| GET | `/` | List (filter by channel, status_stage) |
| GET | `/variables` | Available template variables |
| GET | `/:id` | Single template |
| POST | `/` | Create template |
| PUT | `/:id` | Update template |
| DELETE | `/:id` | Delete (blocks defaults) |
| POST | `/:id/preview` | Render with lead data |

## Frontend Structure

```
frontend/src/
├── main.tsx                    — React entry, QueryClient, ToastProvider
├── App.tsx                     — React Router (/, /finder, /leads, /templates)
├── index.css                   — Tailwind directives + custom utilities
├── types/index.ts              — All TS interfaces + enum constants + tag colors
├── lib/
│   ├── api.ts                  — All fetch functions + request<T>() helper
│   ├── utils.ts                — cn(), formatCurrency(), formatRelativeTime(), formatDate()
│   └── toast.tsx               — Toast context + provider
├── hooks/
│   ├── useLeads.ts             — useLeads, useLead, useCreateLead, useUpdateLead, usePatchStatus,
│   │                             usePatchHeatScore, useLogActivity, useEnrichLead, useSnoozeLead,
│   │                             useFollowups, useBulkUpdateLeads, useDeleteLead
│   ├── useFinder.ts            — useFinderSearch, useImportLeads
│   └── useTemplates.ts         — useTemplates, usePreviewTemplate, useCreate/Update/DeleteTemplate
├── pages/
│   ├── Dashboard.tsx           — KPI cards, status chart, follow-ups widget, activity timeline
│   ├── Finder.tsx              — OSM search form + result list
│   ├── Leads.tsx               — Lead table + filters + CSV import/export
│   └── Templates.tsx           — Template editor by step/channel
└── components/
    ├── layout/
    │   ├── AppLayout.tsx       — Header + sidebar + Outlet
    │   └── Sidebar.tsx         — Nav links + branding
    ├── leads/
    │   ├── LeadsTable.tsx      — Sortable table, bulk select, inline filters
    │   ├── LeadDrawer.tsx      — Detail panel: status, heat, tags, enrichment, notes, activities, follow-up date picker
    │   └── TemplatePreviewModal.tsx — Template selection + live preview + copy
    └── shared/
        ├── StatusBadge.tsx     — Colored status indicator
        ├── HeatScore.tsx       — Heat bar + flame icon
        └── EmptyState.tsx      — Placeholder UI
```

### Key Patterns

- **API helper**: `request<T>(path, init?)` in `api.ts` — fetches `/api` + path, parses JSON, unwraps `.data`
- **React Query**: All server state via `useQuery` / `useMutation` with query key invalidation
- **Mutations invalidate**: Most mutations invalidate `['leads']`, `['lead', id]`, `['stats']`, `['followups']` as appropriate
- **Toast notifications**: `useToast()` → `toast('message')` or `toast('error', 'error')`
- **Dark theme**: zinc-900/950 backgrounds, zinc-200-400 text, orange-500 accent, white/[0.04-0.08] borders
- **Styling**: Tailwind utility classes, `cn()` for conditional merging, `[color-scheme:dark]` for native inputs

## Heat Score Algorithm

**Initial score** (at import): has_website +20, website_live +15, phone +15, email +10, rating≥4.0 +15, reviews≥10 +10 → max 85

**Recomputed score** (on status/activity changes): above + contact_count≥1 +15, contact_count≥3 +10, status in [qualified, proposal_sent, booked] +15 → max 100

## Design Conventions

- Font: system default (Inter-like)
- Background: zinc-950 (page), zinc-900 (cards), zinc-800 (inputs)
- Borders: `border-white/[0.04]` to `border-white/[0.06]`
- Accent: orange-500, orange-400 hover
- Status colors: new=zinc, contacted=blue, qualified=violet, proposal_sent=amber, booked=emerald, lost=red, closed_won=emerald
- Shadows: `shadow-surface` custom utility
- Icons: Lucide React exclusively
- Cards: rounded-xl, p-5, shadow-surface
- Overline labels: `text-overline text-zinc-600` (custom utility class)
- Font data: `font-data` class for numeric/data displays

## Environment

- `.env` in backend root — currently only `GOOGLE_PLACES_API_KEY` (unused placeholder)
- No auth — single-user local tool
- SQLite DB auto-creates schema + seeds templates on first run
