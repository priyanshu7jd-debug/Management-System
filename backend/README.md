# Suraksha Backend

Backend API for **Suraksha** - an Assam disaster intelligence platform that
coordinates disaster reporting, relief shelters, resources, volunteers,
tasks, donations and public safety alerts across four roles: **Citizen**,
**Volunteer**, **Authority**, and **Admin**.

Built with Node.js, Express and MongoDB (Mongoose).

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Seeding demo data](#seeding-demo-data)
- [API documentation](#api-documentation)
- [Roles and access](#roles-and-access)
- [Data model overview](#data-model-overview)
- [Geo-aware "nearby" queries](#geo-aware-nearby-queries)
- [Error handling and response shape](#error-handling-and-response-shape)
- [Security middleware](#security-middleware)
- [Available npm scripts](#available-npm-scripts)

## Features

- **Auth** - registration/login with JWTs, self-service profile and password
  updates.
- **Disasters** - citizens report incidents; authorities verify, assign a
  team, and track status through resolution. Supports photo evidence
  uploads and location-based "nearby" search.
- **Shelters** - relief camp directory with live occupancy, resource
  availability flags, photos, and "nearby" search. Shelter listing and
  detail are public (no login) so affected residents can find help.
- **Resources** - inventory tracking per shelter/disaster with automatic
  low-stock/depleted status and quantity adjustment endpoints.
- **Volunteers** - self-registration, approval workflow, and assignment to
  a disaster and/or shelter.
- **Tasks** - work items assigned to volunteers/authorities with due dates,
  priority, and status tracking.
- **Donations** - cash and in-kind donation logging linked to a disaster
  and/or shelter, with status tracking (Pending -> Received -> Utilized).
- **Alerts** - public emergency alerts, viewable without login.
- **Dashboard** - cross-module aggregated counts and daily trend series for
  Authority/Admin views.
- **Notifications** - a per-user feed combining direct and broadcast
  notifications, with unread counts.

## Tech stack

| Concern            | Library                                          |
| ------------------ | ------------------------------------------------- |
| HTTP framework      | Express                                          |
| Database / ODM      | MongoDB via Mongoose                             |
| Auth                | jsonwebtoken + bcryptjs                          |
| Validation          | express-validator                                |
| File uploads        | multer                                           |
| Security hardening  | helmet, express-mongo-sanitize, hpp, cors        |
| Rate limiting       | express-rate-limit                               |
| Logging             | morgan                                           |
| API docs            | swagger-ui-express + a static OpenAPI 3.0 spec   |

## Project structure

```
aapdasetu-backend/
├── server.js                  # entry point: connects DB, starts the HTTP server
├── .env.example                # documented list of required environment variables
├── src/
│   ├── app.js                  # Express app: middleware, routes, error handlers, Swagger
│   ├── config/
│   │   ├── db.js               # Mongoose connection
│   │   └── validateEnv.js      # fails startup loudly if required env vars are missing
│   ├── controllers/            # one file per resource; request handling + business logic
│   ├── docs/
│   │   └── openapi.yaml        # OpenAPI 3.0 spec served at /api/docs
│   ├── middleware/
│   │   ├── authMiddleware.js   # protect (JWT) + authorize (role check)
│   │   ├── validate.js         # express-validator error collector
│   │   ├── uploadMiddleware.js # multer config for disaster/shelter photos
│   │   ├── rateLimiter.js      # apiLimiter + stricter authLimiter
│   │   └── errorMiddleware.js  # notFound + centralized errorHandler
│   ├── models/                 # Mongoose schemas (User, Disaster, Shelter, ...)
│   ├── routes/                 # one router per resource, mounted in app.js
│   ├── seed/
│   │   └── seed.js             # wipes + repopulates the DB with demo data
│   ├── utils/
│   │   ├── generateToken.js
│   │   └── notify.js
│   └── validators/             # express-validator rule sets per resource
└── uploads/                     # multer's disk destination for uploaded images (gitignored)
```

## Getting started

**Prerequisites:** Node.js 18+, and a MongoDB instance (local or Atlas).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# then edit .env - every variable is required, none have an in-code default;
# the server refuses to start (with a clear error) if any is missing

# 3. (optional but recommended) populate the database with demo data
npm run seed

# 4. Start the server
npm run dev     # nodemon, auto-restarts on file changes
# or
npm start       # plain node
```

By default the API listens on `http://localhost:5000`. Confirm it's up:

```bash
curl http://localhost:5000/api/health
```

## Environment variables

See `.env.example` for the full list with inline comments. All of them are
required - `src/config/validateEnv.js` checks for each at startup and exits
with a clear error (naming exactly what's missing) instead of the app
silently falling back to a default.

| Variable          | Description                                                      |
| ------------------ | ----------------------------------------------------------------- |
| `PORT`             | HTTP port to listen on                                            |
| `NODE_ENV`         | `development` or `production` (disables verbose logging/stack traces in production) |
| `MONGO_URI`        | MongoDB connection string                                        |
| `JWT_SECRET`       | Secret used to sign auth tokens - a long, random value (at least 16 characters) |
| `JWT_EXPIRES_IN`   | Token lifetime, e.g. `7d`                                        |
| `CLIENT_URL`       | Allowed CORS origin for your frontend                            |

## Seeding demo data

```bash
npm run seed           # clears seeded collections, then repopulates them
npm run seed:destroy   # clears seeded collections only, leaves the DB empty
```

The seed script creates one user per role plus a couple of extras, several
disasters/shelters/resources/tasks/volunteers/donations/alerts/notifications
around real Assam locations (Guwahati, Dibrugarh, Silchar, Haflong), and
prints demo login credentials to the console when it finishes. All seeded
users share the password `Password123`; check the console output for the
matching emails per role.

> The script only touches the collections it seeds (`User`, `Disaster`,
> `Shelter`, `Resource`, `Task`, `Volunteer`, `Donation`, `Alert`,
> `Notification`). Run it against a dedicated development database, not
> production data.

## API documentation

Interactive Swagger UI is served once the server is running:

```
http://localhost:5000/api/docs
```

The raw OpenAPI 3.0 spec (useful for importing into Postman/Insomnia or for
codegen) is available at:

```
http://localhost:5000/api/docs.json
```

or directly in the repo at `src/docs/openapi.yaml`.

To authenticate in Swagger UI: call `POST /api/auth/login` (or `/register`)
in the docs, copy the returned `token`, click **Authorize**, and paste it in
as `Bearer <token>`.

## Roles and access

| Role         | Can do                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| **Citizen**   | Report disasters, view public shelters/alerts, donate, register as a volunteer |
| **Volunteer** | Everything a Citizen can, plus manage own volunteer profile and assigned tasks |
| **Authority** | Verify/manage disasters, shelters, resources, tasks, donations, alerts, volunteers within their scope |
| **Admin**     | Everything, plus user management and hard deletes across all resources  |

Authorization is enforced with two middleware layers:
`protect` (valid, non-expired JWT for a non-blocked user) and
`authorize(...roles)` (role allow-list per route). See
`src/middleware/authMiddleware.js`.

Some endpoints are intentionally public: viewing active alerts, browsing
shelters (including "nearby"), and viewing a single alert/shelter, since
this information should be reachable without an account during an emergency.

## Data model overview

All resources share a similar shape: a human-friendly auto-generated ID
(e.g. `DR-1001` for disasters, `SH-501` for shelters, `TK-901` for tasks),
timestamps, and a reference back to the user who created/owns the record.

- **User** - name, email, hashed password, role, district, phone, status (Active/Blocked)
- **Disaster** - type, location + coordinates, severity, status lifecycle (Pending → Verified → In Progress → Resolved/Rejected), reporter, verifier, team, images
- **Shelter** - name, location + coordinates, capacity/occupancy (status auto-flips to Full), resource availability flags, contact info, images
- **Resource** - name, category, quantity, unit, low-stock threshold (status auto-recalculates: Available/Low/Depleted), optional shelter/disaster link
- **Task** - title, category, priority, status, assignee/assigner, optional disaster/shelter link, due date, completion timestamp
- **Volunteer** - one profile per user, skills, district, availability, approval status, optional disaster/shelter assignment
- **Donation** - donor info, Cash or Kind, amount/payment details or item/quantity, optional disaster/shelter link, status lifecycle
- **Alert** - title, type, location, priority, active flag, optional related disaster
- **Notification** - direct (to one user) or broadcast (recipient `null`), typed, with `readBy` tracking and optional links back to the related record

## Geo-aware "nearby" queries

`Disaster` and `Shelter` each keep a GeoJSON `geo` field (`{ type: "Point",
coordinates: [lng, lat] }`) automatically in sync with their plain
`coordinates: { lat, lng }` field via a pre-save hook, and index it with a
`2dsphere` index. `GET /api/disasters/nearby` and `GET /api/shelters/nearby`
use MongoDB's `$geoNear` aggregation stage against that index to return
results ordered by distance (each result gets a `distanceMeters` field),
capped at a configurable search radius (`maxDistance`, in meters, max
200km).

## Error handling and response shape

Every successful response follows `{ "success": true, "data": ... }` (list
endpoints add `count`, `total`, `page`, `pages`). Every error follows
`{ "success": false, "message": "..." }`, with a `stack` field included
outside of production. This is enforced centrally in
`src/middleware/errorMiddleware.js`, which also normalizes Mongoose cast
errors, duplicate-key errors, validation errors, and Multer upload errors
into that same shape. Request-body/query validation itself is handled per
route by `express-validator` rule sets in `src/validators/`, funneled
through `src/middleware/validate.js`.

## Security middleware

- `helmet` - sensible security headers
- `cors` - restricted to `CLIENT_URL`
- `express-mongo-sanitize` - strips `$`/`.` operators from user input to block NoSQL injection
- `hpp` - guards against HTTP parameter pollution
- `express-rate-limit` - a stricter limiter on `/api/auth` (brute-force protection) and a general cap on the rest of `/api`
- Passwords hashed with `bcryptjs`; password hashes are never returned by default (`select: false` on the schema field)

## Available npm scripts

| Script               | Purpose                                      |
| --------------------- | --------------------------------------------- |
| `npm start`           | Run the server with plain `node`             |
| `npm run dev`         | Run the server with `nodemon` (auto-restart) |
| `npm run seed`        | Wipe and repopulate the database with demo data |
| `npm run seed:destroy`| Wipe seeded collections without repopulating |
