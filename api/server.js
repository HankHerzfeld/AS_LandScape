const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8787);
const apiKey = process.env.API_KEY || '';
const requireOrgId = String(process.env.REQUIRE_ORG_ID || 'false').toLowerCase() === 'true';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const dataDir = path.join(__dirname, 'data');
const plotsPath = path.join(dataDir, 'plots.json');

app.use(express.json({ limit: '2mb' }));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by CORS'));
    },
  })
);

function jsonError(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function requireAuth(req, res, next) {
  if (!apiKey) {
    return jsonError(res, 500, 'Server API_KEY is not configured');
  }

  const authHeader = req.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) return jsonError(res, 401, 'Missing bearer token');
  if (token !== apiKey) return jsonError(res, 403, 'Invalid API key');

  if (requireOrgId && !req.get('x-org-id')) {
    return jsonError(res, 400, 'Missing required X-Org-Id header');
  }

  next();
}

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(plotsPath);
  } catch {
    await fs.writeFile(plotsPath, '[]\n', 'utf8');
  }
}

async function readPlots() {
  await ensureDataFile();
  const text = await fs.readFile(plotsPath, 'utf8');
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePlots(plots) {
  await ensureDataFile();
  await fs.writeFile(plotsPath, `${JSON.stringify(plots, null, 2)}\n`, 'utf8');
}

app.get('/health', requireAuth, async (req, res) => {
  const count = (await readPlots()).length;
  res.json({
    success: true,
    status: 'ok',
    service: 'landscapeiq-api',
    timestamp: new Date().toISOString(),
    plotsStored: count,
  });
});

app.post('/plots', requireAuth, async (req, res) => {
  const payload = req.body;

  if (!payload || typeof payload !== 'object') {
    return jsonError(res, 400, 'Body must be valid JSON');
  }

  if (!payload.id || typeof payload.id !== 'string') {
    return jsonError(res, 400, 'Missing required field: id');
  }

  if (!payload.generated || typeof payload.generated !== 'string') {
    return jsonError(res, 400, 'Missing required field: generated');
  }

  const plots = await readPlots();
  const now = new Date().toISOString();
  const index = plots.findIndex((plot) => plot.id === payload.id);

  const record = {
    ...payload,
    orgId: req.get('x-org-id') || null,
    updatedAt: now,
    createdAt: index >= 0 ? plots[index].createdAt : now,
  };

  if (index >= 0) {
    plots[index] = record;
  } else {
    plots.push(record);
  }

  await writePlots(plots);

  res.status(index >= 0 ? 200 : 201).json({
    success: true,
    saved: true,
    id: payload.id,
    upserted: index >= 0,
  });
});

app.get('/plots/:id', requireAuth, async (req, res) => {
  const plots = await readPlots();
  const match = plots.find((plot) => plot.id === req.params.id);
  if (!match) return jsonError(res, 404, 'Plot not found');
  return res.json({ success: true, plot: match });
});

app.get('/plots', requireAuth, async (req, res) => {
  const plots = await readPlots();
  res.json({ success: true, count: plots.length, plots });
});

app.use((err, req, res, next) => {
  if (err && err.message === 'Origin not allowed by CORS') {
    return jsonError(res, 403, err.message);
  }
  console.error('[api-error]', err);
  return jsonError(res, 500, 'Internal server error');
});

app.listen(port, () => {
  console.log(`LandscapeIQ API listening on http://localhost:${port}`);
});
