# XpenseAI 💳

AI-powered expense tracker for India. Parse bank SMS messages instantly, track across multiple accounts and credit cards.

## Features
- 📩 Auto-parse Axis Bank / UPI SMS messages
- ✏️ Manual transaction entry
- 🏦 Multiple accounts (savings + credit cards)
- 🔗 Shared credit limit pools
- 📊 Dashboard with net balance, cash flow, card dues
- 🔍 Monthly insights with category charts
- 💳 Statement period tracking per card
- 📤 Export to XLSX/CSV

## Deploy to GitHub Pages

### Option A — GitHub Actions (recommended, auto-deploys on every push)

1. Fork or upload this repo to GitHub
2. Go to **Settings → Pages**
3. Under "Source" select **GitHub Actions**
4. Push any change to `main` — it deploys automatically

### Option B — Manual (no Actions needed)

1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **/ (root)**
4. Click **Save** — live in ~1 minute

### Your app URL
`https://YOUR_USERNAME.github.io/xpenseai/`

## Install as PWA on phone

**iPhone (Safari):** Share button → Add to Home Screen → Add  
**Android (Chrome):** Menu → Install App / Add to Home Screen

Once installed, data persists in `localStorage` — survives app restarts.

## Data storage
All data is stored locally in your browser's `localStorage` under keys:
- `xpenseai_expenses_v1`
- `xpenseai_accounts_v1`

Use the **🔧 Backup & Restore** button in Settings to export your data.
