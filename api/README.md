# LandscapeIQ API

Minimal Express API for LandscapeIQ sync.

## Endpoints

- `GET /health` - health check used by the app's "Test Connection" button
- `POST /plots` - accepts plot payload from "Sync to Web"
- `GET /plots` - lists saved plots (debug endpoint)
- `GET /plots/:id` - returns one plot (debug endpoint)

All endpoints require:

- `Authorization: Bearer <API_KEY>`
- `X-Org-Id: <org>` only when `REQUIRE_ORG_ID=true`

## Quick Start

1. Copy env file and set values:

```bash
cd api
cp .env.example .env
```

2. Install and run:

```bash
npm install
npm run dev
```

3. In the web app API modal, set:

- API Base URL: `http://localhost:8787`
- API Key: same as `API_KEY` in `.env`
- Org/Team ID: optional unless `REQUIRE_ORG_ID=true`

## Notes

- Saved records are written to `api/data/plots.json`.
- This is a development backend. For production, use a database and HTTPS.
