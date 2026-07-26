# Site: Haatzmaut Clinic Management

## 1. Vision
A Hebrew-first (RTL) clinic management platform built with the Clinical Clarity design system. Provides calendar scheduling, staff management, meetings, resource tracking, and issue reporting for healthcare providers.

**Live URL:** https://haatzmaut.lior-clinic.org  
**Local Dev:** `node build.mjs && python3 -m http.server 8080` in `dist/`  
**Tech Stack:** Vanilla JS (ES modules, bundled by esbuild), CSS custom properties, Express backend for cloud sync.

## 2. Architecture
- **Single-Page Application:** All functionality in `index.html` with tabbed navigation
- **Build:** `node build.mjs` bundles JS to `dist/app.min.js`, copies assets
- **Server:** `server/index.js` provides `/sync` endpoint for encrypted cloud save/load
- **Offline:** Service worker in `sw.js` for cached PWA mode

## 3. Stitch Project
- **Project ID:** N/A (designs generated externally; using extracted zip assets)
- **Device Type:** Desktop (also responsive to mobile)

## 4. Sitemap
- [x] index.html — Main SPA shell with all tabs (Clinical Clarity styled)
  - [x] dashboardTab — Calendar / scheduling board
  - [x] requestsTab — Change request queue
  - [x] staffTab — Staff directory with glass cards
  - [x] meetingsTab — Team meetings
  - [x] resourcesTab — Resource browser
  - [x] issuesTab — Issue tracking kanban
  - [x] adminTab — System settings, backups, audit
- [x] dashboard-prototype.html — Stitch dashboard design (standalone)
- [x] staff-prototype.html — Stitch staff management design (standalone)
- [x] stats-dashboard.html — Analytics page with KPIs, charts, heatmap
- [x] display.html — Public-facing live display
- [x] accessibility.html — Accessibility statement

## 5. Roadmap
1. ~~Phase 1: Apply Clinical Clarity design system~~ ✓
2. ~~Phase 2: Update CSS tokens, sidebar, header~~ ✓
3. Phase 3: Recreate dashboard calendar view as Stitch-inspired component
4. ~~Phase 4: Redesign staff directory cards with glass-card style~~ ✓
5. ~~Phase 5: Add stats dashboard with visual charts~~ ✓
6. ~~Phase 6: Add mobile-responsive bottom nav bar~~ ✓ done

## 6. Creative Freedom (ideas for new pages)
- A dedicated "Daily Brief" landing page showing today's schedule + KPIs
- An "Emergency Mode" page for critical incidents
- A "Patient Intake" flow page
- A "Reports & Analytics" dashboard page (stats-dashboard done)
