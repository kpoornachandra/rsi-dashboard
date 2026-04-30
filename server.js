const express = require('express');
const path = require('path');
const yahooFinance = require('yahoo-finance2').default;
const stocks = require('./stocks.config');

const app = express();
const PORT = process.env.PORT || 3000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Per-symbol cache
const symbolCache = {};
const CACHE_TTL_MS = 55 * 1000;

// ── RSI Calculation (Wilder's smoothing, period=14) ──────────────────────────

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * 13 + (change > 0 ? change : 0)) / 14;
    avgLoss = (avgLoss * 13 + (change < 0 ? Math.abs(change) : 0)) / 14;
  }

  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
}

// ── Fetch RSI for a single symbol ────────────────────────────────────────────

async function fetchRSI(symbol, name, retries = 2) {
  // Return cache if fresh
  const cached = symbolCache[symbol];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 45);

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

    const data = {
      symbol, name,
      price: parseFloat(currentPrice.toFixed(2)),
      rsi, zone,
      updatedAt: new Date().toISOString(),
    };

    symbolCache[symbol] = { data, fetchedAt: Date.now() };
    return data;

  } catch (err) {
    if (retries > 0 && (err.message.includes('Too Many Requests') || err.message.includes('429'))) {
      console.warn(`[${symbol}] rate limited, retrying in 3s…`);
      await sleep(3000);
      return fetchRSI(symbol, name, retries - 1);
    }
    console.error(`[${symbol}] fetch error:`, err.message);
    return { symbol, name, error: err.message };
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// Return configured stock list (no RSI data)
app.get('/api/stocks', (req, res) => {
  res.json(stocks);
});

// Fetch RSI for a single symbol
app.get('/api/rsi/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const stock = stocks.find(s => s.symbol.toUpperCase() === symbol);
  if (!stock) return res.status(404).json({ error: 'Symbol not configured' });

  try {
    const data = await fetchRSI(stock.symbol, stock.name);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch RSI for all symbols sequentially
app.get('/api/rsi', async (req, res) => {
  try {
    const results = [];
    for (const s of stocks) {
      results.push(await fetchRSI(s.symbol, s.name));
      await sleep(400);
    }
    res.json({ data: results, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RSI Dashboard running on port ${PORT}`);
});
