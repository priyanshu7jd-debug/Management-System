# Suraksha

An Assam disaster-intelligence platform: a React frontend and an
Express/MongoDB backend, wired together via the API client in
`frontend/src/lib/api.js`.

```
aapdasetu/
├── backend/     Express + MongoDB API (see backend/README.md)
└── frontend/    React + Vite app (see frontend/src/lib/api.js for the API client)
```

## Quick start (VS Code, two terminals)

**1. Backend** — needs Node 18+ and a MongoDB instance (local or Atlas).

```bash
cd backend
npm install
cp .env.example .env      # fill in every value - none are optional, see below
npm run seed               # populates sample data, prints seeded login credentials
npm run dev                 # http://localhost:5000
```

**2. Frontend**

```bash
cd frontend
npm install
cp .env.example .env      # set VITE_API_URL to your backend's URL + /api
npm run dev                 # http://localhost:8443
```

Open `http://localhost:8443`, then either log in with one of the seeded
accounts printed by `npm run seed`, or register a new one from the UI.
There is no login-free "explore mode" - every dashboard requires a real
account.

## Configuration

Every value below is required. Nothing has an in-code fallback: if a
variable is missing, the backend refuses to start (with a clear error
naming what's missing) and the frontend throws immediately on load,
rather than silently falling back to a guessed value.

- `backend/.env`:
  - `PORT` - port the API listens on.
  - `NODE_ENV` - `development` or `production`.
  - `MONGO_URI` - your MongoDB connection string (local or Atlas).
  - `JWT_SECRET` - a long, random secret (at least 16 characters) used to sign auth tokens.
  - `JWT_EXPIRES_IN` - how long issued tokens stay valid, e.g. `7d`.
  - `CLIENT_URL` - the frontend's URL, used for CORS. Must match the frontend's dev server URL (`http://localhost:8443` by default).
- `frontend/.env`:
  - `VITE_API_URL` - the backend's URL + `/api`, e.g. `http://localhost:5000/api`.

If you change the frontend's dev port (`frontend/vite.config.ts`), update
`CLIENT_URL` in `backend/.env` to match, or the backend will reject the
frontend's requests via CORS.

## What's wired up

The frontend's `src/lib/api.js` is a complete client for every backend
endpoint. Auth (login/register), disaster reporting/verification, shelters,
resources, volunteers, tasks, and alerts are connected end-to-end in the UI.
Emergency contacts, the donation "campaigns" view, and the NGO registry now
have real backend models too (`backend/src/models/EmergencyContact.js`,
`Campaign.js`, `NGO.js`, with routes mounted at `/api/contacts`, `/api/ngos`,
`/api/campaigns`). Wiring the frontend views in `DisasterManagementSystem.jsx`,
`DonationsView.jsx`, and `NGOView.jsx` to these endpoints (in place of their
remaining hardcoded arrays) is in progress — see the code comments there for
what's left.
