# GJ AI Investor

A responsive, premium-style demo web app for a £500 paper portfolio with explainable market intelligence, a recommendation card, a heating oil tracker, and a wealth snapshot.

## What is included

- Dark banking-style UI with responsive layout
- Demo data clearly labelled as a prototype
- Recommendation card with confidence, risk, and exit-plan details
- Market cards for FTSE 100, S&P 500, NASDAQ, Bitcoin, gold, and Brent oil
- Heating oil tracker for postcode SA66 7UZ and 500 litres, including DJ Davies Fuels, BoilerJuice, and local suppliers
- GJ Wealth section for cash, investments, pensions, and property

## Files

- index.html — page structure and semantic content
- style.css — all visual styling
- script.js — demo data rendering and small interactions

## Run locally

Open index.html in a browser, or serve the folder with a simple static server such as:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Production deployment

The GitHub Pages build now uses a Cloudflare Worker proxy so the Twelve Data API key is never exposed in browser JavaScript.

1. Create a Cloudflare Worker from [worker.js](worker.js).
2. Add the `TWELVE_DATA_API_KEY` secret in the Worker settings.
3. Deploy the Worker and copy its public URL.
4. Update the `SECURE_PROXY_URL` constant in [marketDataService.js](marketDataService.js).
5. Publish the GitHub Pages site.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full step-by-step instructions.
