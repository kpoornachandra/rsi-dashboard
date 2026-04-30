# RSI Dashboard — NSE Stocks

Real-time RSI(14) dashboard for NSE stocks. Polls Yahoo Finance every 60 seconds and displays color-coded cards for each stock.

## Project Structure

```
rsi-dashboard/
├── server.js          # Express backend + RSI calculation
├── stocks.config.js   # Edit this to add/remove stock symbols
├── public/
│   └── index.html     # Frontend (single file, no build step)
├── package.json
├── Procfile
└── railway.json
```

## Adding / Removing Stocks

Edit `stocks.config.js` — no other files need changing:

```js
module.exports = [
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors' },
  // Add more NSE symbols here (suffix .NS)
];
```

## Run Locally

```bash
npm install
npm start
# Open http://localhost:3000
```

## Deploy to Railway

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/rsi-dashboard.git
git push -u origin main
```

### Step 2 — Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in (free tier works).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select your `rsi-dashboard` repository.
4. Railway auto-detects Node.js, runs `npm install`, and starts `node server.js`.
5. Click **Settings → Networking → Generate Domain** to get a public URL like:
   ```
   https://rsi-dashboard.up.railway.app
   ```
6. Open that URL from any device — no login required.

### Environment Variables

No required env vars. Railway automatically sets `PORT`; the server reads `process.env.PORT`.

## RSI Zones

| RSI Value | Zone       | Card Color  |
|-----------|------------|-------------|
| ≥ 70      | Overbought | Red tint    |
| 30–70     | Neutral    | Dark (default) |
| ≤ 30      | Oversold   | Green tint  |

RSI is calculated using **Wilder's smoothing method** over the last 45 calendar days (~30 trading days) of daily close prices, with a period of 14.
