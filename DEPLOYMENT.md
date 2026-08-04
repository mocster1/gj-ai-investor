# Secure production deployment for Twelve Data

## Overview

This project now uses a serverless proxy for production deployments so the Twelve Data API key never needs to be shipped to the browser.

- Localhost uses the existing local config.js workflow.
- GitHub Pages uses the Cloudflare Worker endpoint.
- The browser only calls the public worker URL with an approved symbol.

## 1) Create the Cloudflare Worker

1. Sign in to Cloudflare and open Workers & Pages.
2. Create a new Worker.
3. Replace the starter code with the contents of [worker.js](worker.js).
4. Save and deploy the Worker.

## 2) Create the environment secret

In the Cloudflare dashboard for your Worker:

1. Open Settings > Variables and Secrets.
2. Add a secret named `TWELVE_DATA_API_KEY`.
3. Paste your Twelve Data API key as the value.
4. Save the secret.

## 3) Deploy the Worker

1. Click Deploy.
2. Copy the deployed Worker URL, for example:
   `https://market-data-proxy.<your-subdomain>.workers.dev/quote`

## 4) Update the production endpoint in the app

In [marketDataService.js](marketDataService.js), update the `SECURE_PROXY_URL` constant to your deployed Worker URL.

Example:

```js
const SECURE_PROXY_URL = 'https://market-data-proxy.your-subdomain.workers.dev/quote';
```

## 5) Commit and publish the site

1. Commit the updated files.
2. Push to GitHub.
3. Publish the GitHub Pages site from the repository.

## 6) Local development

For local development, keep the key in [config.js](config.js) and run the app locally. The app will use the direct Twelve Data request path on localhost.

## Security notes

- The browser never receives the API key.
- The worker only accepts the approved symbols.
- The worker returns sanitised JSON and adds CORS headers for `https://mocster1.github.io`.
- Unknown symbols are rejected with `400`.
