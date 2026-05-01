require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const path    = require('path');
const stocks  = require('./stocks.config');

const app  = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.MASSIVE_API_KEY;

const MASSIVE_BASE = 'https://data.massive.com';
const CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const REFRESH_COOLDOWN_MS = 60 * 1000; // 1 minute

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = {
  data: null,
  fetchedAt: 0,
  lastRefreshAt: 0,
};

// ── RSI (Wilder's smoothing, period = 14) ─────────────────────────────────────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
}

// ── Fetch one symbol from Massive ─────────────────────────────────────────────
async function fetchOne(symbol, name) {
  const to   = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 45); // 45 cal days ≈ 30+ trading days

  const fmt = d => d.toISOString().slice(0, 10);

  try {
    const { data } = await axios.get(
      `${MASSIVE_BASE}/v2/aggs/ticker/${symbol}/range/1/day/${fmt(from)}/${fmt(to)}`,
      {
        params: { adjusted: 'true', limit: 50, sort: 'asc', apiKey: API_KEY },
        timeout: 10000,
      }
    );

    // results array may be keyed differently — handle both shapes
    const bars = data.results ?? data.Results ?? [];

    if (!bars || bars.length < 15) {
      console.warn(`[${symbol}] insufficient bars: ${bars?.length ?? 0}`);
      return { symbol, name, error: 'Data unavailable' };
    }

    const closes = bars.map(b => b.c);
    const price  = closes[closes.length - 1];
    const rsi    = calcRSI(closes, 14);

    let zone = 'Neutral';
    if (rsi >= 70) zone = 'Overbought';
    else if (rsi <= 30) zone = 'Oversold';

    return {
      symbol,
      name,
      price:     parseFloat(price.toFixed(2)),
      rsi,
      zone,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).slice(0, 120)}`
      : err.message;
    console.error(`[${symbol}] fetch error: ${msg}`);
    return { symbol, name, error: 'Data unavailable' };
  }
}

// ── Refresh all symbols in parallel ──────────────────────────────────────────
async function refreshAll() {
  console.log(`[${new Date().toISOString()}] Refreshing ${stocks.length} symbols…`);
  const results = await Promise.all(stocks.map(s => fetchOne(s.symbol, s.name)));
  cache.data      = results;
  cache.fetchedAt = Date.now();
  console.log(`[${new Date().toISOString()}] Cache updated.`);
  return results;
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/rsi — return cached data (auto-refresh if stale)
app.get('/api/rsi', async (req, res) => {
  try {
    if (!cache.data || Date.now() - cache.fetchedAt >= CACHE_TTL_MS) {
      await refreshAll();
    }
    res.json({
      data:      cache.data,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      cached:    true,
    });
  } catch (err) {
    console.error('GET /api/rsi error:', err.message);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// POST /api/refresh — force refresh (with 1-min cooldown)
app.post('/api/refresh', async (req, res) => {
  const since = Date.now() - cache.lastRefreshAt;
  if (since < REFRESH_COOLDOWN_MS) {
    const wait = Math.ceil((REFRESH_COOLDOWN_MS - since) / 1000);
    return res.status(429).json({ error: `Cooldown active. Try again in ${wait}s.`, wait });
  }
  try {
    cache.lastRefreshAt = Date.now();
    await refreshAll();
    res.json({ ok: true, fetchedAt: new Date(cache.fetchedAt).toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks — configured stock list
app.get('/api/stocks', (req, res) => {
  res.json(stocks);
});

// GET / — serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`RSI Dashboard running on port ${PORT}`);
  if (!API_KEY) {
    console.warn('⚠  MASSIVE_API_KEY not set — API calls will fail!');
  }
  refreshAll().catch(console.error);
});
