const express = require('express');
const path = require('path');
const yahooFinance = require('yahoo-finance2').default;
const stocks = require('./stocks.config');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory cache: avoid hammering Yahoo Finance on every poll
let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 55 * 1000; // 55 seconds — just under the 60s frontend poll

// ── RSI Calculation (Wilder's smoothing, period=14) ──────────────────────────

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // Seed: simple average of first `period` changes
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Wilder's smoothing for the rest
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

// ── Fetch RSI for a single symbol ────────────────────────────────────────────

async function fetchRSI(symbol, name) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 45); // 45 days to ensure 30 trading days

  try {
    const result = await yahooFinance.historical(symbol, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    if (!result || result.length < 16) {
      return { symbol, name, error: 'Insufficient data' };
    }

    const closes = result.map(d => d.close);
    const currentPrice = closes[closes.length - 1];
    const rsi = calcRSI(closes, 14);

    let zone = 'Neutral';
    if (rsi !== null && rsi >= 70) zone = 'Overbought';
    else if (rsi !== null && rsi <= 30) zone = 'Oversold';

    return {
      symbol,
      name,
      price: parseFloat(currentPrice.toFixed(2)),
      rsi,
      zone,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[${symbol}] fetch error:`, err.message);
    return { symbol, name, error: err.message };
  }
}

// ── Data refresh ──────────────────────────────────────────────────────────────

async function refreshData() {
  console.log('Fetching RSI data for', stocks.length, 'symbols…');
  const results = await Promise.all(stocks.map(s => fetchRSI(s.symbol, s.name)));
  cache = { data: results, fetchedAt: Date.now() };
  console.log('RSI data cached at', new Date().toISOString());
  return results;
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/rsi', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
      return res.json({ data: cache.data, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true });
    }
    const data = await refreshData();
    res.json({ data, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: false });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`RSI Dashboard running on port ${PORT}`);
  // Warm cache on startup
  refreshData().catch(console.error);
});
