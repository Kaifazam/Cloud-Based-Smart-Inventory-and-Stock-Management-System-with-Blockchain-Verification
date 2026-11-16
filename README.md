# Stockwise — Phase 1

Cloud-Based Smart Inventory and Stock Management System with Blockchain Verification.

A responsive React + Vite frontend and Python Flask API. This phase runs locally with sample inventory persisted in SQLite. Firebase Authentication, Firestore, cloud deployment, and blockchain verification are future phases; none are represented as connected services.

## Run on Windows

Open two terminals in VS Code inside your existing `cloud project` folder.

Backend terminal (PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Frontend terminal:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open the Local URL printed by Vite (normally http://127.0.0.1:5173). Flask runs at http://127.0.0.1:5000. Vite proxies `/api` to Flask, so keep both terminals running. Stop either service with Ctrl+C. The commands use the virtual environment directly and `npm.cmd`, avoiding PowerShell script execution policy changes. On subsequent starts, skip environment creation and installation.

Requires Python 3.10+ and Node.js 20.19+ or 22.12+ (tested here with Python 3.12 and Node 24).

## Demo login

Use `admin@stockwise.demo` / `demo123`, or any valid email and password with at least six characters. This is a **demo entry screen, not authentication**. API routes have no authorization and are intended for localhost use. A browser-session flag keeps the demo screen open until sign-out. Replace this with verified Firebase ID tokens and backend authorization in Phase 2 before exposing the API.

## Features

- Dashboard with inventory value, sales revenue, product totals, low-stock counts, seven-day sales chart, and category distribution.
- Search and category filters, create/edit/delete products, unique SKUs, configurable reorder levels.
- Stock in/out and sales with atomic stock updates and insufficient-stock protection. Sales use the product price at transaction time.
- Transaction history; products with history cannot be deleted. Existing stock is adjusted through movements rather than product editing.
- Low-stock alerts, including products with zero stock; current valuation reports and CSV export.
- Responsive sidebar, mobile navigation, accessible form labels, empty/error/success feedback.

Currency is INR; prices are stored as integer paise and displayed with paise when present. Inventory valuation uses selling prices, not accounting cost. Revenue includes the seeded demo sales. Seed sales are illustrative historical records; seeded stock represents current stock rather than an opening balance reconstructed from those sales. Chart dates and sales history use the browser's local timezone. Sample sales are dated relative to the first database creation; they naturally leave the seven-day chart as time passes. Google Fonts is optional: system fonts work offline.

## Data and structure

```text
frontend/                 React application
  src/main.jsx            Screens, forms, charts, API integration
  src/styles.css          Responsive dashboard and login design
  vite.config.js          Local API proxy
backend/
  app.py                  Flask routes, validation, SQLite setup
  requirements.txt        Python dependency
  test_app.py             API workflow tests using a temporary database
```

`backend/inventory.db` is created and seeded on first backend start and ignored by Git. Data survives restarts. To restore samples, stop Flask, remove only that database file, and restart Flask. No real credentials are required. `INVENTORY_DATABASE` can override the database path. The API layer in the frontend and data access in `app.py` provide boundaries for the next integration phase.

## Checks

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest -v
```

```powershell
cd frontend
npm.cmd run build
```

The production frontend output is `frontend/dist`. After building, `npm.cmd run preview` serves the compiled frontend (normally http://127.0.0.1:4173) and proxies `/api` to Flask on port 5000, just like the development server. Keep Flask running for either mode. `API_PROXY_TARGET` optionally overrides the proxy destination. Flask's built-in server and Vite preview are for local verification; a cloud production deployment still needs deployment and reverse-proxy configuration.

Frontend logic and full browser tests (run from `frontend`):

```powershell
npm.cmd test
npm.cmd run test:e2e
```

Browser tests use installed Microsoft Edge in headless mode on Windows. If needed, choose installed Chrome with `$env:PLAYWRIGHT_CHANNEL = 'chrome'`. On a machine without a supported installed browser, install Playwright Chromium with `npx.cmd playwright install chromium` and set `$env:PLAYWRIGHT_CHANNEL = 'chromium'`.

The browser suite starts and stops its own Flask/Vite servers on ports 5001/5174 and uses a temporary seeded database; it never edits your `backend/inventory.db`. Keep those test ports free. To test the compiled app, build first, then run `$env:E2E_PREVIEW = '1'; npm.cmd run test:e2e`. Remove that setting afterward with `Remove-Item Env:E2E_PREVIEW` to resume testing the development server. Screenshots and failure traces are saved under ignored `frontend/test-results/`.

## Phase 1 review

Verified in headless Microsoft Edge on Windows: demo login validation/session/sign-out, seeded dashboard totals, product search/category filters, create/edit/delete, duplicate SKU feedback, protected transaction history, stock in/out, insufficient-stock rejection, sales totals and stock synchronization, low-stock/restocking transitions, charts, CSV downloads, mobile sidebar/navigation, API outage/retry recovery, and empty inventory states.

Corrections include fractional-currency display, sales chart timezone grouping, accessible movement selector names, mobile table overflow, consistent JSON errors and bounded API validation, preserving deliberately empty inventory after restart, clearer save/reload feedback, and the missing API proxy in Vite production preview. The original dashboard design is preserved.

Automated checks: six backend test cases (including concurrent oversell protection), two frontend logic tests (also checked in Asia/Kolkata), and five end-to-end browser scenarios. Build succeeds; Vite reports a non-blocking bundle-size warning because charts are bundled with the application. Optional future work is splitting chart code to reduce initial download size.

Still pending by design: real authentication/authorization, Firebase Authentication, Firestore, cloud hosting configuration, and blockchain verification. The local demo login deliberately accepts any valid email and password of six or more characters; it does not authenticate against Flask. Inventory and sales screens are connected to Flask.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Startup health |
| GET | `/api/inventory` | Products and transaction history |
| POST | `/api/products` | Add product (price in rupees) |
| PUT | `/api/products/<id>` | Edit metadata, price, reorder level |
| DELETE | `/api/products/<id>` | Delete a product without history |
| POST | `/api/movements` | Record `in`, `out`, or `sale` |

Movement bodies contain `product_id`, `kind`, positive integer `quantity`, and optional `note`. Read responses express prices/totals in paise. Firebase and blockchain functionality will require new integration work, security rules, and deployment configuration in later phases.
