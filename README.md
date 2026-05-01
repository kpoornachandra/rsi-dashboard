# RSI Dashboard — US Stocks

Real-time RSI(14) dashboard for US stocks powered by the **Massive Market Data API**.
Auto-refreshes every 5 minutes. Mobile-first, no framework.

## Stack
- **Backend**: Node.js + Express + Axios
- **Frontend**: Plain HTML/CSS/JS (single file, no build step)
- **Data**: Massive Market Data API (historical daily OHLC)
- **Hosting**: Railway

## Project Structure

```
rsi-dashboard/
├── server.js          # Express backend + RSI calculation
├── stocks.config.js   # Edit to add/remove symbols
├── public/
│   └── index.html     # Full frontend
├── .env.example       # Copy to .env and fill in your key
├── package.json
├── Procfile
└── railway.json
```

## Get a Massive Market Data API Key

1. Go to [massive.com](https://massive.com) and sign up (free tier available)
2. Go to your dashboard → API Keys → Create key
3. Copy the key — you'll use it as `MASSIVE_API_KEY`

## Run Locally

```bash
cp .env.example .env
# Edit .env and set your MASSIVE_API_KEY
npm install
npm start
# Open http://localhost:3000
```

## Add / Remove Stocks

Edit `stocks.config.js` — no other files need changing:

```js
module.exports = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'SHOP', name: 'Shopify' },  // ← add any US ticker
];
```

## Deploy to Railway

### Step 1 — Push to GitHub

```bash
git add .
git commit -m "Update to Massive Market Data API"
git push origin main
```

### Step 2 — Set environment variable on Railway

1. Open your project on [railway.app](https://railway.app)
2. Click your service → **Variables** tab
3. Add: `MASSIVE_API_KEY` = your key from massive.com
4. Railway will redeploy automatically

### Step 3 — Get your public URL

Settings → Networking → Generate Domain →
```
https://rsi-dashboard-production.up.railway.app
```

## RSI Zones

| RSI     | Zone       | Card colour |
|---------|------------|-------------|
| ≥ 70    | Overbought | Red tint    |
| 30–70   | Neutral    | Dark        |
| ≤ 30    | Oversold   | Green tint  |

RSI is calculated using **Wilder's smoothing** over the last 45 calendar days
(~30 trading days) of daily close prices, period = 14.
