## Puzzle Map – Chicago Neighborhood Jigsaw

An interactive jigsaw puzzle built from Chicago’s community areas, used as a prototype for the future chicago.com experience. The app is a small, focused **marketing + engagement** surface: users solve the map, see a short message about chicago.com, and can leave an email to get early access updates.

This repository is public and intentionally omits any secrets or environment-specific credentials.

---

## High-level architecture

### Frontend (React + Vite)

- **Framework**: React (TypeScript) built with Vite (`frontend/`).
- **Rendering**: Uses **SVG** + **d3-geo** to render each neighborhood as a draggable puzzle piece.
- **State & persistence**:
  - A per-visitor UUID is generated and stored in both a cookie and `localStorage`.
  - Puzzle progress (piece positions + completion state) is stored in `localStorage` keyed by that UUID.
- **Theming & layout**:
  - Mobile-first layout; puzzle dominates the viewport on phones, with sidebar copy on larger screens.
  - Light/dark mode respects `prefers-color-scheme` and offers a manual toggle.
  - Styling driven by design tokens via CSS variables (no hardcoded brand hex values).
- **Analytics (GA4)**:
  - GA4 `user_id` is set to the visitor UUID.
  - Custom events for puzzle lifecycle and email submission (no raw emails or PII sent to GA).
- **Email capture UI**:
  - When the puzzle is complete (or via an admin override), a modal appears:
    - Explains the chicago.com concept.
    - Provides an email input and CTA.
    - Pushes to the backend email capture API.

### Backend (Node + Express + Postgres)

- **Runtime**: Node.js with Express (`backend/`).
- **Primary responsibilities**:
  - Health check for observability: `GET /healthz`.
  - Email capture endpoint: `POST /api/early-access`.
  - CSV export utility (CLI) for exporting signups from Postgres.
- **Data store**: Railway Postgres (or any compatible Postgres instance).
  - Single table: `signups`.
- **Security / robustness (for this prototype)**:
  - TLS handled by the hosting platform (e.g., Railway).
  - Basic CORS scoping for the email endpoint.
  - Minimal in-memory rate limiting to reduce abuse on `/api/early-access`.

---

## Repository structure (conceptual)

- `frontend/`
  - `src/App.tsx` – main layout, theme, puzzle container, completion modal, GA4 wiring.
  - `src/components/PuzzleCanvas.tsx` – SVG puzzle, drag/snap/lock mechanics, persistence integration.
  - `src/analytics.ts` – GA4 initialization and custom event helpers.
  - `src/persistence.ts` – UUID generation, cookie + `localStorage` helpers, puzzle state load/save.
  - `public/chicago_neighborhoods.geojson` (or equivalent) – GeoJSON for Chicago neighborhoods.
- `backend/`
  - `index.js` – Express app, `/healthz`, `/api/early-access`, CORS, rate limiting.
  - `export-signups.js` – Node script to export `signups` as CSV.
  - `package.json` – backend scripts and dependencies.
- `docs/`
  - Product brief, design standards, rendering notes, and other reference material (not code).
  - **`docs/page-copy.md`** — single place to view and edit all page copy; after editing, update `frontend/src/content.ts` to match.

This separation lets engineering iterate on frontend and backend deployments independently while keeping product, design, and analytics decisions centralized in `docs/`.

### SEO and indexing

- **Current (pre-public):** Indexing is disallowed via `<meta name="robots" content="noindex, nofollow">` in `frontend/index.html` and `frontend/public/robots.txt` (`Disallow: /`). The page has SEO-friendly metadata (title, description, Open Graph, Twitter card) that teases chicago.com.
- **When going public:** Remove the `robots` meta tag (or set to `index, follow`) and update or remove `public/robots.txt` so crawlers can index the site. Optionally set `og:url` and a canonical URL once the production URL is fixed.

---

## Email capture API (for engineering)

### Endpoint

- **Method**: `POST`
- **Path**: `/api/early-access`
- **Base URL**:
  - **Production**: `https://<your-backend-host>/api/early-access`
  - **Local**: `http://localhost:<backend-port>/api/early-access`

The frontend usually sets a `VITE_BACKEND_URL` such as:

```text
VITE_BACKEND_URL=https://<your-backend-host>
```

and then calls `VITE_BACKEND_URL + /api/early-access`.

### Request payload

JSON body:

```json
{
  "uuid": "4f8c8e65-2c9f-4cb7-8a85-61c276c45716",
  "email": "user@example.com",
  "completed_at": "2026-03-13T18:45:00.000Z",
  "user_agent": "Mozilla/5.0 ...",
  "referrer": "https://example.com/",
  "utm_source": "newsletter",
  "utm_medium": "email",
  "utm_campaign": "launch"
}
```

- **Required fields**:
  - `uuid` – client-generated UUIDv4 for this visitor (string, non-empty).
  - `email` – user’s email (string, non-empty, basic email format validation).
- **Optional fields**:
  - `completed_at` – ISO timestamp for when the puzzle was completed.
    - If omitted or empty, the backend fills with `new Date().toISOString()`.
  - `user_agent` – `navigator.userAgent` from the client (string).
  - `referrer` – HTTP referrer or equivalent (string, may be empty).
  - `utm_source`, `utm_medium`, `utm_campaign` – marketing attribution strings from query parameters.

### Responses

- **201 Created** (success):

  ```json
  {
    "ok": true,
    "id": 123
  }
  ```

  - `id` is the primary key of the new row in `signups`.

- **4xx client errors**:
  - `400` – validation errors such as:
    - Missing `uuid`, missing `email`, or badly formatted `email`.
  - `429` – too many requests (in-memory rate limit exceeded) for a given IP/UUID tuple within a short window:

    ```json
    { "error": "Too many requests. Please slow down." }
    ```

- **5xx server errors**:
  - `500` – misconfiguration (e.g., missing `DATABASE_URL`) or database failure:

    ```json
    { "error": "Service not configured; missing DATABASE_URL." }
    ```

    or

    ```json
    { "error": "Failed to save signup." }
    ```

### CORS / access pattern

- The backend sets CORS headers **only** for the email endpoint:

  - `Access-Control-Allow-Origin`: value of `ALLOWED_ORIGIN` env (or `*` if not set).
  - `Access-Control-Allow-Methods`: `POST, OPTIONS`.
  - `Access-Control-Allow-Headers`: `Content-Type`.

- For production use:
  - `ALLOWED_ORIGIN` should be set to the **frontend’s origin** (e.g., `https://<frontend-host>`).
  - Frontend calls the backend over HTTPS using `fetch` with `Content-Type: application/json`.

No authentication token is required for this prototype; the main guardrails are origin scoping and rate limiting.

---

## Data model: `signups` table

The backend assumes a Postgres table like:

```sql
CREATE TABLE IF NOT EXISTS signups (
  id SERIAL PRIMARY KEY,
  uuid TEXT NOT NULL,
  email TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT
);

CREATE INDEX IF NOT EXISTS idx_signups_created_at ON signups (created_at DESC);
```

- **uuid** – visitor UUID from the frontend (non-PII identifier).
- **email** – email address submitted via the modal.
- **completed_at** – when the puzzle was (reported) completed.
- **created_at** – when the signup record was written.
- **user_agent**, **referrer**, **utm\_*** – optional context for analytics and downstream segmentation.

All credentials for connecting to Postgres are provided via environment variables (e.g., `DATABASE_URL`) and are **not** committed in this repo.

---

## Exporting signups to CSV (engineering / data)

There is a small Node script to export signups as CSV from Postgres for downstream tools (e.g., CRM, analytics):

### Script

- File: `backend/export-signups.js`
- NPM script: in `backend/package.json`:

```json
"scripts": {
  "export:signups": "node export-signups.js"
}
```

### Usage example

From the `backend/` directory, with `DATABASE_URL` set in your shell:

```bash
cd backend

# Example: export to a CSV file
DATABASE_URL="postgres://..." npm run export:signups > signups.csv
```

The script:

- Connects to Postgres using `DATABASE_URL`.
- Selects all rows from `signups`, ordered by `created_at DESC`.
- Prints a CSV header row:

```text
id,uuid,email,completed_at,created_at,user_agent,referrer,utm_source,utm_medium,utm_campaign
```

- Writes one line per signup, with proper CSV escaping for commas, quotes, and newlines.

Access to the database is controlled by your infrastructure (e.g., Railway); the repo itself does not contain any connection strings.

---

## Hidden admin override (for internal demos)

The product spec includes a hidden override that lets internal users jump directly to the “completed puzzle + email prompt” state for demos and QA.

### How it works (conceptually)

- Trigger: clicking the main H1 title **5 times within ~3 seconds**.
- Behavior:
  - Snaps **all** pieces into their correct positions and marks them locked.
  - Marks the puzzle as completed in the same way as a legitimate solve.
  - Opens the same completion/email modal.
  - Emits a GA4 event `override_jump_to_complete` with:
    - `device_type`
    - `orientation`
    - `admin_override: true`

This behavior is designed to be unobtrusive and difficult to discover accidentally, but convenient for internal testing.

---

## Analytics overview (for product & analytics teams)

The app uses GA4 with a consistent event schema. Events are sent via the frontend only; **no email or direct PII is sent to GA**.

Key points:

- **Identity:**
  - A random UUID is generated on first visit and stored in a cookie and `localStorage`.
  - GA4 `user_id` is set to this UUID.
- **Core events** (non-exhaustive):
  - `puzzle_view` – on page load:
    - `device_type`, `orientation`, `returning_user`, `puzzle_completed`.
  - `puzzle_started` – when the user first moves any piece:
    - `device_type`, `orientation`, `time_from_load_ms`.
  - `puzzle_completed` – when all pieces are locked:
    - `device_type`, `orientation`, `duration_ms`, `moves_count`.
  - `email_submit_attempt` – when the user submits the email form:
    - `device_type`, `has_completed_puzzle`.
  - `email_submit_success` – on successful backend response:
    - `device_type`, `has_completed_puzzle`.
  - `email_submit_failure` – on validation/network/server error:
    - `device_type`, `error_type` (`validation`, `network`, `server`).
  - `override_jump_to_complete` – when internal override is used:
    - `device_type`, `orientation`, `admin_override: true`.

This gives enough signal to understand funnel performance (view → start → complete → email) and to separate organic behavior from internal demo traffic.

---

## Local development (high-level)

This repository is set up so engineers can run both frontend and backend locally, using environment variables for external services.

### Prerequisites

- Node.js (LTS).
- Postgres (local or remote; env-configured).
- GA4 Measurement ID (optional for local testing).

### Frontend (local)

```bash
cd frontend
npm install
npm run dev
```

- Dev server by default on `http://localhost:5173/` (Vite default).
- The frontend **expects**:
  - `VITE_BACKEND_URL` for the email endpoint (e.g., `http://localhost:4000` for local dev).
  - `VITE_GA_MEASUREMENT_ID` if you want GA4 tracking in local builds (not required).

### Backend (local)

```bash
cd backend
npm install
export DATABASE_URL="postgres://..."
npm run dev
```

- Local backend serves:
  - `GET /healthz` → `{ status: 'ok' }`
  - `POST /api/early-access` → writes to your configured Postgres.
- Default port is `4000` unless `PORT` is set.

Frontends running locally can point to `http://localhost:4000` via `VITE_BACKEND_URL`.

---

## Security and privacy notes

- **No secrets in this repo**:
  - Database URLs, GA4 Measurement IDs, and any other secrets are passed via environment variables and are not committed.
- **PII handling**:
  - Emails are stored only in Postgres under your control.
  - GA4 events never include email or other direct PII.
- **Access control**:
  - The backend endpoint is intentionally simple; environments are expected to be protected and monitored via your hosting platform (e.g., Railway) and network-level configurations.
  - Rate limiting is present but intentionally lightweight and should be treated as a safeguard for this prototype, not a full security layer.

This README is intended to give **engineering** a clear path to integrate, deploy, and extend the system, and to give **product / analytics** a conceptual understanding of how user interactions, data, and events flow through the app, without exposing any environment-specific credentials.

---

## Data attribution

Neighborhood boundary data used in this project is derived from the City of Chicago’s official neighborhoods dataset, published on the Chicago Data Portal as **“Boundaries – Neighborhoods”** (`bbvz-uum9`).  
Source: [City of Chicago – Boundaries – Neighborhoods](https://data.cityofchicago.org/Facilities-Geographic-Boundaries/Boundaries-Neighborhoods/bbvz-uum9)

---

## Demo guide

This section describes how to walk through the live Railway deployment for demos.

- **Production URL**
  - Frontend: `https://<your-frontend-host>` (e.g., a `railway.app` or custom domain).
  - Backend: `https://<your-backend-host>` (used by the frontend via `VITE_BACKEND_URL`).

Confirm with engineering/ops which exact domains are currently live and configured.

### 1. Pre-demo checks

- **Health**
  - Visit `https://<your-backend-host>/healthz` and confirm it returns `{"status":"ok"}`.
- **Frontend load**
  - Open the frontend URL on:
    - A recent mobile phone (portrait).
    - A desktop browser (wider viewport).
  - Verify the puzzle loads within a few seconds and neighborhood shapes render clearly.
- **Environment**
  - Ensure `VITE_BACKEND_URL` and `ALLOWED_ORIGIN` are configured so email capture works end‑to‑end.
  - Optionally, confirm GA4 events are visible in the GA4 debug view for the Measurement ID in use.

### 2. Standard demo path (normal user)

1. **Landing**
   - Load the frontend URL.
   - Point out the headline and subheadline (e.g. “Let’s build a better Chicago together.”).
   - Toggle between light and dark themes using the `Theme` toggle to show theming.
2. **Play the puzzle**
   - Drag a few neighborhoods into place.
   - Highlight:
     - Pieces snapping into the city outline when close.
     - The subtle drop shadow and drag feedback.
     - The “You last tapped …” line when tapping pieces.
3. **Complete the puzzle**
   - Finish placing the remaining pieces.
   - Note the completion caption below the puzzle.
4. **Completion modal + email capture**
   - When the completion modal appears:
     - Read the “You mapped Chicago.” title and short description.
     - Enter a test email (e.g., `demo+timestamp@example.org`) and click **Get early access updates**.
     - Show the success confirmation copy.
   - Explain that:
     - The email is stored in Postgres via `/api/early-access`.
     - GA4 events capture `email_submit_attempt` / `email_submit_success` without sending the email itself.

### 3. Admin override path (fast demo)

Use this when you want to skip directly to the “completed puzzle + email prompt” state.

1. Load the frontend URL.
2. Click/tap the main H1 title (the main headline) **5 times within ~3 seconds**.
3. Observe:
   - All pieces snap into place.
   - The app treats the puzzle as completed in local state.
   - The completion/email modal opens automatically.
4. Explain that:
   - GA4 receives an `override_jump_to_complete` event with `admin_override: true`.
   - This lets internal demo traffic be segmented from organic user behavior.

### 4. Verifying email capture and export

- **Backend write**
  - After a test submission, confirm that a row appears in the `signups` table in Postgres (via your usual DB console or Railway UI).
- **CSV export**
  - From the `backend/` directory with `DATABASE_URL` set:
    - Run `npm run export:signups > signups.csv`.
  - Open `signups.csv` to confirm columns and values are as expected for downstream CRM import.

With these steps, a non-technical stakeholder can reliably demo the experience and understand how it connects to analytics and email capture, while engineers have clear pointers for verifying end‑to‑end behavior.

