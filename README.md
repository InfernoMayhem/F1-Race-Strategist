# F1 Race Strategist

An interactive F1 race strategy sandbox. Enter race parameters (laps, fuel load, tyre/pit info, rainfall) and the app simulates tyre degradation, fuel burn benefits, and enumerates pit stop strategies to highlight an optimal approach.

## Features
- Dynamic lap time modeling with tyre wear and fuel burn.
- Strategy enumeration (1–3 stops) with pit lap visualization.
- Interactive charts (lap time, fuel load, tyre wear) using Chart.js.
- Save & Load race configurations to a local SQLite database.
- Responsive, dark glassmorphism UI.

## Getting Started

Install dependencies (includes SQLite driver `better-sqlite3` and Vite + React):

```sh
npm install
```

Development (run backend + Vite dev server with proxy to /api):

```sh
npm run dev
```

This starts:
- Backend on http://localhost:5000 (auto-fallback if busy)
- Vite dev on http://localhost:5173 (proxies /api to the backend)

Alternatively, run them separately:

```sh
npm run dev:server
npm run dev:client
```

## Saving a Configuration
1. Fill out the race setup form.
2. Click "Save Config".
3. Enter a unique name (e.g. `Monza Dry 50L`).
4. The config is stored in `data/savedConfigs.db` (SQLite). Duplicate names are prevented.

## Loading a Configuration
1. Click "Load Config".
2. Select a previously saved name from the list (newest first).
3. The form repopulates; you can immediately rerun the simulation.

## API Endpoints
- `POST /api/race-config` – Save last-run config (legacy JSON file storage for latest).
- `POST /api/calculate-laps` – Lap time array from provided or latest config.
- `POST /api/generate-strategies` – Enumerate & simulate strategies.
- `POST /api/configs` – Save a named configuration `{ name, config }`.
- `GET /api/configs` – List saved configs names + timestamps.
- `GET /api/configs/:name` – Retrieve a specific saved config.

## Data Storage
- Named configs stored in `data/savedConfigs.db` (SQLite, WAL mode for safety & performance).

## Tech Stack
- Backend: Node.js + Express + better-sqlite3
- Frontend: Vanilla JS, Chart.js, CSS

## Notes
- If `better-sqlite3` build fails on some systems, ensure you have a working build toolchain (Node headers). On macOS with Xcode command line tools this should be seamless.
- Port auto-increment prevents clashes with other processes.

## Future Improvements
- Add delete/rename for saved configs.
- Export/import configs (JSON).
- More sophisticated weather evolution model.
- Tyre compound customization via UI.

---
Enjoy experimenting with strategy trade-offs!