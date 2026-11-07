# 🏫 CampusOps Digital Twin

> A real-time 3D digital twin of SRM Easwari Engineering College, fused with an AI-powered campus operations dashboard — built for a hackathon, improved solo afterwards.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-0.186-black?logo=threedotjs)](https://threejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)](https://vitejs.dev)

---

## What Is This?

**CampusOps** combines two things:

1. **3D Digital Twin** — a navigable 3D campus scene built from real OpenStreetMap footprints of SRM Easwari's buildings, roads, and grounds. Click any building to enter a cutaway view; click a room to see its live status.

2. **Operations Dashboard** — a role-based complaint/work-order system (Student → Worker → Admin) with an AI intake assistant that understands free-text complaints, extracts location, and routes work orders to the right technician.

Both run from a **single `npm run dev`** on a single localhost port.

---

## Screenshots

| 3D Campus View | Operations Dashboard | AI Complaint Intake |
|---|---|---|
| *Real OSM footprints, procedural broadleaf trees, 144 FPS* | *Role portals: Student / Worker / Admin* | *Slot-filling clarification loop* |

> Screenshots in `docs/screenshots/` — run the app to see it live.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              localhost:5174  (Unified Host)          │
│                                                     │
│  ┌──────────────────┐    ┌────────────────────────┐ │
│  │   3D Twin (R3F)  │◄──►│  Dashboard (React/TW)  │ │
│  │  Three.js scene  │    │  Student | Worker | Admin│ │
│  │  OSM geodata     │    │  AI intake assistant    │ │
│  │  Projector FSM   │    │  Real-time work orders  │ │
│  └────────┬─────────┘    └───────────┬────────────┘ │
│           │  dashboardBridge.ts      │              │
│           └──────────────┬───────────┘              │
│                          ▼                          │
│              Mock API (Vite plugin)                 │
│              FastAPI backend (optional, Docker)     │
└─────────────────────────────────────────────────────┘
```

---

## Features

### 🌐 3D Digital Twin
- Real building footprints and roads from OpenStreetMap (SRM Easwari, Ramapuram)
- OSM height tags used where available; estimated elsewhere
- Navigable: Campus → Cutaway → Room Interior → Diorama
- Procedural broadleaf trees (EZ-Tree), PBR materials, ACES filmic tone mapping
- Bloom, vignette, N8AO ambient occlusion
- Runs at 144 FPS on campus view

### 🤖 AI Complaint Intake
- Student submits a free-text complaint ("AC is leaking in the lab")
- AI extracts: **category** (HVAC), **location** (block + room if mentioned)
- If location is missing → AI asks a targeted clarification question
- Student replies → structured ticket is created and routed to the right technician

### 🏢 Operations Dashboard
- **Student Portal** — submit complaints, track ticket status in real time
- **Worker Portal** — see assigned work orders, mark tasks complete
- **Admin Portal** — full work order overview, approve/reject, view audit trail
- Real-time sync: completing a task updates all portals within 3 seconds

### 🔮 Projector Failure Predictor
- Deterministic finite-state machine (`projectorSim.ts`) models projector health
- Predicts failure probability based on usage cycles and thermal state
- Work orders pre-generated before failure actually occurs

### 🔗 Cyber-Physical Bridge
- `dashboardBridge.ts` polls work orders every 5 seconds
- Failed/at-risk rooms get a live 3D marker overlaid on the campus scene
- Clicking the marker opens the work order in the dashboard

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/developerHarish2007/campus-twin-ops.git
cd campus-twin-ops

# 2. Install root dependencies
npm install

# 3. Install dashboard dependencies
npm install --prefix dashboard/frontend

# 4. Copy env config
cp .env.example .env.local

# 5. Run everything (single command, single port)
npm run dev
```

Open **http://localhost:5174** — that's it. No backend required for the demo (mock API is built in).

### With the Full Backend (optional)

Requires Docker and PostgreSQL:
```bash
docker compose -f dashboard/docker-compose.yml up -d postgres
python dashboard/scripts/setup_db.py
python dashboard/scripts/seed_demo.py
```
Then set `VITE_MOCK_MODE=false` in `.env.local` and restart.

---

## Tech Stack

| Layer | Technology |
|---|---|
| 3D Rendering | Three.js 0.186, React Three Fiber 9, Drei 10 |
| Postprocessing | ACES tone mapping, N8AO, Bloom, Vignette |
| Procedural Trees | `@dgreenheck/ez-tree` |
| Geodata | OpenStreetMap (ODbL), locally packaged |
| Frontend | React 19, TypeScript 7, Vite 8 |
| Dashboard UI | React 18, Tailwind CSS, Lucide React |
| Backend | FastAPI 0.115, PostgreSQL 16, pgvector |
| DB Invariants | 6 PostgreSQL-level constraints (FSM, inventory, audit ledger) |
| State | Zustand, React Context |
| Build | Vite 8, Rolldown |

---

## Project Background

Built for the **Overclock Hackathon** at Easwari Engineering College. We didn't win — but the architecture was solid enough that I kept working on it after the event: added the AI intake clarification loop, the real-time cross-portal sync, the unified single-host setup, and the procedural tree system.

The backend contract (`BACKEND_CONTRACT.md`) describes the full FastAPI API surface. The mock API (embedded in Vite's plugin system) covers all endpoints needed to demo the app without any backend.

---

## Known Limitations / Tech Debt

- `src/views/CampusWorld.tsx` is a large file (~2500+ lines) — works well, but would benefit from splitting into sub-components
- Backend requires Docker to run with real data; the Vite mock covers all demo scenarios
- No automated unit tests in the main app (Playwright integration tests exist in `work/`)

---

## License

MIT — see `LICENSE`.

Campus geodata: © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/).  
Tree assets: CC0 — see `docs/ASSET_CREDITS.md`.

---

> *SRM Easwari Engineering College campus, Ramapuram, Chennai — 13.0324° N, 80.1810° E*
