# LandscapeIQ PWA — Setup Guide

## Files in this package

```
landscapeiq-pwa/
├── index.html       ← Main app (open this in a browser or serve it)
├── sw.js            ← Service worker (offline + sync)
├── manifest.json    ← PWA install manifest
├── icons/           ← Add your app icons here (see below)
└── README.md        ← This file
```

---

## Running locally (web + offline)

The app **must be served over HTTPS or localhost** for the service worker to register. Do NOT open `index.html` directly as a file (`file://`) — the SW won't activate.

### Option A — Python quick server
```bash
cd landscapeiq-pwa
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option B — Node / npx
```bash
npx serve landscapeiq-pwa
```

### Option C — Any static host (Netlify, Vercel, Cloudflare Pages, etc.)
Upload the folder contents. HTTPS is provided automatically.

---

## Installing as a phone app (PWA)

### Android (Chrome)
1. Open the URL in Chrome.
2. Tap the three-dot menu → **Add to Home Screen**.
3. Or wait for the automatic install banner that appears in the app header.

### iOS (Safari)
1. Open the URL in Safari.
2. Tap the Share icon → **Add to Home Screen**.
3. (iOS doesn't support automatic install prompts — manual only.)

### Desktop (Chrome / Edge)
1. Click the install icon in the address bar, or
2. tap the **Install** banner that appears at the top of the app.

---

## App Icons

You need PNG icons at the following sizes. Place them in the `icons/` folder:

| File | Size |
|------|------|
| icon-72.png   | 72×72   |
| icon-96.png   | 96×96   |
| icon-128.png  | 128×128 |
| icon-144.png  | 144×144 |
| icon-152.png  | 152×152 |
| icon-192.png  | 192×192 |
| icon-384.png  | 384×384 |
| icon-512.png  | 512×512 |

**Quick way:** Use https://realfavicongenerator.net or https://www.pwabuilder.com
to generate all sizes from a single 512×512 source image.

---

## Connecting your API

Open the app → click the ⚙ gear in the top-right corner.

| Field | Description |
|-------|-------------|
| **API Base URL** | Root URL of your back-end, e.g. `https://api.mysite.com/v1` |
| **API Key** | Bearer token sent as `Authorization: Bearer <key>` |
| **Org / Team ID** | Optional `X-Org-Id` header for multi-tenant systems |

### Expected API endpoints

The app calls these endpoints — implement them on your back-end:

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/health` | Connection test (return any 200) |
| `POST` | `/plots`  | Save/sync a plot + service estimate |

### Plot sync payload (POST /plots)
```json
{
  "id": "plot_1718200000000",
  "generated": "2026-06-01T12:00:00.000Z",
  "location": { "lat": 30.2672, "lng": -97.7431 },
  "plot": {
    "platArea": 8500,
    "dimensions": { "w": 85, "d": 100 }
  },
  "services": [
    { "name": "Mow", "area": "6200 sq ft", "time": "22 min", "notes": "..." }
  ],
  "drawings": 3,
  "catalogue": [
    { "name": "Live Oak", "cat": "trees", "price": "$250/ea" }
  ],
  "notes": "NE corner retaining wall",
  "fieldPhotos": 2
}
```

---

## Offline behavior

| Scenario | Behavior |
|----------|----------|
| App shell (UI) | Served from cache — works fully offline |
| Map data | Cached when "Download Map" is tapped in API settings |
| API writes (sync) | Queued in IndexedDB; flushed automatically on reconnect |
| Map tiles | Cached by service worker after first load (by default) |

The header shows **Online / Offline** status in real-time.  
A sync badge appears while background sync is in progress.

---

## Customizing the API sync

Edit `index.html` in the `syncToAPI()` and `apiRequest()` functions to:
- Add custom headers (auth tokens, versioning)
- Change the endpoint paths
- Add additional data to the sync payload
- Handle server-returned validation errors

The service worker (`sw.js`) handles background sync via the **Background Sync API** when supported (Android Chrome), and falls back to flush-on-reconnect for iOS and desktop.

---

## Map tile caching for offline use

To cache actual map tiles offline, you would integrate a tile provider (Mapbox, OpenStreetMap, etc.) and the service worker's tile cache logic is already wired up at:

```javascript
// sw.js — line 27-32
if (url.hostname.includes('tile') || url.pathname.includes('tiles')) {
  event.respondWith(cacheFirstWithNetwork(event.request, 'map-tiles-v1'));
  return;
}
```

Just point your tile requests at your provider and they will be cached automatically on first load.

---

## Production checklist

- [ ] Add real app icons in `icons/`
- [ ] Serve over HTTPS
- [ ] Set `API_BASE_URL` and configure auth
- [ ] (Optional) Integrate real map tile provider (Mapbox, OSM)
- [ ] (Optional) Add push notification VAPID keys
- [ ] Test offline behavior: load plot, kill network, reopen app