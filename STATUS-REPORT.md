# AapdaSetu — Fix Progress Report

Compiled against `AapdaSetu-Complete-Function-Reference.pdf` (Sections 3.1–3.17).
This is a running log — I'll keep appending a new "Phase" section each time
you ask me to continue, so this file is always the single source of truth for
what's done, what's left, and what to test.

---

## ✅ DONE — Phase 1: Notifications (§3.15) + Incident Evidence Upload (§3.3 #13–14)

### What I found when I read the code
- **Notifications bell had no `onClick` at all.** It only fetched an unread
  count for the badge. `api.notifications.list / markRead / markAllRead /
  remove` existed as client methods but were never called anywhere in the UI.
- **No frontend upload capability existed for incidents.** The backend has a
  fully working `POST /api/disasters/:id/images` (multer, field name
  `images`, 5MB/file, JPEG/PNG/WEBP/GIF, max 5 files) and `DELETE
  /api/disasters/:id/images`, but `lib/api.js` had **zero methods** for
  either endpoint, and the "Upload Photo / Video" button on the citizen
  report form had no `onClick` handler — pure decoration.
- The generic `request()` helper in `api.js` always sends
  `Content-Type: application/json` and `JSON.stringify(body)`, which cannot
  do a real file upload — a new helper was needed.
- `adapt.disaster()` didn't even map the backend's `images` array onto the
  row objects the UI uses, so there was no way to display uploaded evidence
  even if it existed.

### What I built
**`frontend/src/lib/api.js`**
- New `uploadRequest()` helper — sends real `multipart/form-data` (no
  `Content-Type` header set manually, so the browser adds the correct
  boundary; this is what multer needs).
- `disasters.uploadImages(token, id, files)` and
  `disasters.deleteImage(token, id, imageUrl)`.
- `notifications.remove(token, id)`.
- `adapt.disaster()` now includes `images: d.images || []`.
- Exported `API_ORIGIN` (backend origin without the `/api` suffix) so
  `<img src={API_ORIGIN + url}>` resolves the relative `/uploads/...` paths
  the backend returns.

**`frontend/src/DisasterManagementSystem.jsx`**
- `NotificationsPanel` — real dropdown off the bell: list, unread styling,
  click-to-mark-read, "mark all read," delete (Authority/Admin only, per the
  PDF's permission table). Wired to the bell button, which previously did
  nothing.
- `EvidenceManager` — reusable upload/delete widget (file picker → real
  multipart upload → thumbnail grid → per-image delete).
- `EvidenceModal` — popup wrapper around `EvidenceManager`, used from the
  Authority/Admin incident table.
- Citizen "Report a Disaster" form: the dead upload button is gone; after a
  report is submitted, an "Evidence" card appears where the citizen can
  actually upload/delete photos against their own report.
- Authority/Admin "All Disaster Reports" table: the inert "View" (eye) icon
  is now a working "Evidence" button that opens the modal to manage that
  incident's photos.

### Verified
- No `npm install` was possible in this sandbox (no network access for
  `bash_tool`), so I could not run `npm run dev` or a full Vite build.
- I **did** syntax-validate both changed files with `esbuild` (JSX/ESM
  parse + transform, no bundling) — both compile cleanly with zero errors.
- I have **not** run this against a live backend/DB, so runtime behavior
  (actual network calls, multer field-name matching, CORS, etc.) is unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. Log in as Citizen → Report a Disaster → submit → upload a photo → confirm
   it appears as a thumbnail → delete it.
2. Log in as Authority or Admin → All Disaster Reports → click "Evidence" on
   any row → upload/delete photos there too.
3. Click the bell icon in the top bar → confirm the notification list loads,
   mark-as-read and mark-all-read work → (as Authority/Admin) confirm delete
   works.

---

## ✅ DONE — Phase 2: Shelter Management (§3.4)

### What I found when I read the code
- Backend (`shelterController.js` / `shelterRoutes.js`) already fully
  implemented **every** action in the PDF's Shelter table — add/edit/delete/
  approve, occupancy, images, occupants (assign/check-in/check-out/transfer),
  supplies, facilities, volunteer assignment, shelter tasks, problems,
  alerts, and audit history. None of it needed backend changes.
- `frontend/src/lib/api.js` only had `shelters.list/getById/create/update/
  updateOccupancy/remove` — every other endpoint above had zero client method.
- `SheltersView` was read-only (map + table) plus a delete icon for Admin.
  There was no way to actually manage a shelter from the UI at all.
- `adapt.shelter()` dropped `images`, `approvalStatus`, `managedBy`,
  `deletionRequested`, and the `resources` facility flags — so even if a
  screen existed, it had nothing to show for those fields.

### What I built
**`frontend/src/lib/api.js`**
- Added the full set of missing `api.shelters.*` methods: `uploadImages`,
  `deleteImage`, `approve`, `requestDeletion`, `stats`, `getOccupants`,
  `assignCitizen`, `checkIn`, `checkOut`, `transferCitizen`, `getResources`,
  `addResource`, `updateResource`, `updateFacilities`, `assignVolunteer`,
  `getVolunteers`, `getTasks`, `createTask`, `getProblems`, `reportProblem`,
  `resolveProblem`, `sendAlert`, `getAudit`.
- `adapt.shelter()` now carries `images`, `contactPerson`/`contactPhone`
  separately (for edit forms), `approvalStatus`, `managedBy`,
  `deletionRequested`, and the four `resources` facility flags.

**`frontend/src/DisasterManagementSystem.jsx`**
- `SheltersView` — added an "Add Shelter" button (Authority/Admin, via
  `AddShelterModal`) and turned the row action into "Manage," opening a new
  **`ShelterManageModal`** with tabs:
  - **Details** — edit name/location/capacity/contact, toggle
    food/water/medical/bedding facility flags, upload/delete shelter photos
    (`ShelterEvidenceManager`, same pattern as the Phase 1 incident evidence
    widget), approve/reject a Pending shelter (Admin), and delete (Admin,
    direct) or request deletion (Authority) — all gated per
    `shelterPermissions.js`'s FULL/REQUEST/NONE scopes.
  - **Occupants** — assign a citizen, check in/out, transfer to another
    shelter, and see the occupant roster.
  - **Supplies** — add a food/water/medical item and adjust its quantity.
  - **Volunteers** — assign an approved Volunteer to the shelter and see who's
    currently assigned.
  - **Problems** — report a problem and (Admin/Authority) mark it In
    Progress/Resolved.
  - **Alerts** — send a shelter-specific alert to its checked-in occupants
    and assigned volunteers.
  - **Audit** — view the shelter's activity log (Admin full, Authority
    limited to shelters they manage, matching the backend scope).
- Every tab's action buttons are shown/hidden using
  `shelterPermissionsFor(role, [...])` against the existing
  `lib/shelterPermissions.js` table, so an Authority user sees exactly the
  REQUEST/ASSIGNED-scoped actions they're allowed and nothing more.

### Verified
- Still no network access in this sandbox, so `npm install` / `npm run dev`
  wasn't possible — same limitation as Phase 1.
- Syntax-validated both changed files with `esbuild` (found a copy bundled
  inside an installed `tsx` package's `node_modules` since none was
  installed directly) — both compile cleanly with zero errors.
- Not run against a live backend/DB — runtime behavior is unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. Log in as Authority → Shelter Management → "Add Shelter" → fill the form
   → confirm it appears (Pending, since Authority-created shelters start
   Pending) → open "Manage" on it → confirm you only see Request Deletion,
   not Delete, and no Approve/Reject.
2. Log in as Admin → open that same shelter → confirm Approve/Reject shows
   up and works → try each tab (Occupants, Supplies, Volunteers, Problems,
   Alerts, Audit) against a real citizen/volunteer ID.
3. Upload/delete a shelter photo from the Details tab.
4. Confirm the facility toggle buttons (food/water/medical/bedding) persist
   after a refresh.

### Known shortcut, flagged honestly
Occupant assign/check-in/check-out/transfer use a plain "citizen user ID"
text field instead of a citizen search/picker — there's no citizen-search
endpoint on the backend yet. It works, but it's not great UX; worth a
dedicated pass later if this becomes a real workflow rather than an
Admin/Authority typing in an ID they already have on hand.

---

## ✅ DONE — Phase 3: Resource Management (§3.5)

### What I found when I read the code
- Backend (`resourceController.js` / `resourceRoutes.js`) already fully
  implemented create/edit/adjust-quantity/delete, with `PUT /resources/:id`
  and `PATCH /resources/:id/quantity` open to both Authority and Admin, and
  `DELETE /resources/:id` restricted to Admin only — matching the PDF.
- `frontend/src/lib/api.js` already had `resources.list/create/update/
  adjustQuantity/remove` — Phase 1/2 had already covered this client-side,
  so no `api.js` changes were needed here.
- `ResourcesView` (used by Authority) was read-only: a chart plus a plain
  table, no actions at all.
- Admin's dashboard had its own separate "Add Resource" card wired to
  `POST /resources` — but **not** to Edit, Adjust Quantity, or Delete, so
  Admin could only ever add, never fix a typo or restock/consume.
- **Bug found and fixed in passing:** the existing Admin "Add Resource" form's
  category dropdown offered `Medicine`, `Relief`, `Shelter` — none of which
  are in the backend's actual category enum (`Food, Water, Medical, Clothing,
  Bedding, Equipment, Other`, enforced by `resourceValidators.js`). Any
  resource added with those categories would have been rejected by the
  backend with a 400. Fixed by using the real enum everywhere.

### What I built
**`frontend/src/lib/api.js`**
- Extended `adapt.resource()` with `_id`, `unit`, and `notes` (needed by the
  new edit form) — the create/update/adjust/remove methods themselves
  already existed.

**`frontend/src/DisasterManagementSystem.jsx`**
- `ResourcesView` is now a full management screen for both Authority and
  Admin (backend permits both to add/edit/adjust; Authority just can't
  delete):
  - "Add Resource" button opens `ResourceFormModal` (also reused for
    editing) with the corrected category list.
  - Each inventory row gets inline **-  / +** buttons that call
    `PATCH /resources/:id/quantity` directly (restock/consume by 1 at a
    time), an **Edit** icon (full field edit via the same modal), and for
    Admin only a **Delete** icon.
- Removed the old Admin-only "Add Resource" card and its now-redundant
  `newRes`/`addResource` state — folded into the shared `ResourcesView` so
  Authority gets the same capability the backend already allowed it.

### Verified
- Same sandbox limitation as Phases 1–2: no network access, so
  `npm install`/`npm run dev` wasn't possible.
- Syntax-validated both changed files with `esbuild` — both compile cleanly.
- Not run against a live backend/DB — runtime behavior is unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. Log in as Authority → Resource Management → Add Resource → confirm it
   saves with a valid category → edit it → adjust quantity with +/- →
   confirm no Delete icon appears for Authority.
2. Log in as Admin → same screen → confirm Delete icon appears and works.
3. Try adjusting a quantity down to 0 and below — confirm the backend's
   "cannot go negative" guard surfaces as a toast, not a silent failure.

---

## ✅ DONE — Phase 4: Relief Fund - Campaigns & Donations (§3.10)

### What I found when I read the code
- The backend (`campaignController.js` / `donationController.js` /
  `fundController.js`) already fully implemented every action in the PDF's
  Relief Fund table — campaign CRUD, approve/close/suspend, donation
  status/verify, fund balance/adjustment, utilization, transaction ledger,
  reports (JSON + CSV export), donor notifications, misuse reports, and a
  scoped audit log.
- More surprisingly, `frontend/src/lib/api.js` **already had every one of
  those client methods wired** (`campaigns.*`, `donations.*`, `funds.*`) —
  this must have been built in an earlier pass but never actually called
  from any screen. No `api.js` changes were needed for this phase either.
- `features/DonationsView.jsx` (the one screen covering donations for all
  three roles) only ever called `campaigns.list`, `donations.list/mine`,
  `donations.create`, and `donations.verify`. Everything else in the module
  — creating a campaign, approving one, adjusting a balance, sending donor
  notifications, misuse reports, the transaction ledger, reports — had no
  UI at all, matching what the prior report said.

### What I built
All within `frontend/src/features/DonationsView.jsx` (no other file needed
changes for this phase):
- **`CampaignFormModal`** — create or edit a campaign: title, NGO (dropdown
  restricted to ASDMA-Approved NGOs only, since the backend rejects any
  other kind), optional linked disaster, description, location, target,
  deadline, bank details.
- **`CampaignManageModal`** — a tabbed staff view opened per campaign
  (Authority/Admin get a "Manage" icon on each campaign card):
  - *Details* — edit, Approve/Reject a Pending campaign (Admin), Suspend
    (Admin), Close as Completed/Cancelled (Admin), Delete (Admin).
  - *Balance* — current credits/debits/balance, plus a manual
    credit/debit adjustment for reconciliation (Admin, or Authority on
    campaigns they created).
  - *Utilization* — raised vs. utilized vs. remaining, broken down by
    transaction type.
  - *Notify* — message every donor who's given to that campaign.
  - *Audit* — that campaign's activity log.
- **`MisuseReportModal`** + a Misuse Reports panel — any role can flag a
  concern; Authority/Admin get a triage list (Reviewing/Resolved/Dismissed).
- **Fund Reports & Transactions panel** (staff only) — "Monitor
  Transactions" toggles the raw ledger table (campaign/type/direction/
  amount/date), "Generate Report" pulls the aggregate per-campaign summary,
  and "Export CSV" links straight to the backend's CSV download endpoint.
- Donation history table: staff now get a status dropdown
  (Pending/Received/Utilized/Cancelled) next to the existing Verify button,
  and Admin gets a delete action — both previously missing.
- Every button above is gated through the existing
  `lib/fundPermissions.js` (`getFundScope`/`hasFullFundAccess`/
  `canAccessFund`), including the FULL-vs-ASSIGNED distinction for
  Authority (e.g. Authority can edit/adjust-balance/notify only on
  campaigns *they* created — checked via `campaign.createdBy ===
  currentUserId`, so the three `<DonationsView>` call sites now also pass
  `currentUserId`).

### Verified
- Same sandbox limitation as Phases 1–3: no network access, so
  `npm install`/`npm run dev` wasn't possible.
- Syntax-validated `DonationsView.jsx`, `DisasterManagementSystem.jsx`, and
  `lib/api.js` with `esbuild` — all compile cleanly.
- Not run against a live backend/DB — runtime behavior (real balance math,
  the CSV download, notification fan-out) is unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. Log in as Authority → Donations tab → Create Campaign → confirm it
   appears **Pending** (Authority-created campaigns aren't auto-approved) →
   open Manage → confirm no Approve/Reject/Close/Suspend/Delete buttons show
   (Authority scope is ASSIGNED/NONE on those), but Edit and Balance-adjust
   do (since you created it).
2. Log in as Admin → same campaign → confirm Approve/Reject appears and
   works, then Close/Suspend/Delete all work as expected.
3. Make a donation as Citizen → log in as Authority/Admin → verify it, then
   change its status, then (Admin only) delete a different one.
4. Try "Monitor Transactions" / "Generate Report" / "Export CSV" as Admin
   and confirm real numbers come back once a campaign has a verified
   donation against it.
5. Submit a misuse report as Citizen → confirm it shows up in the
   Authority/Admin triage list and can be moved through Reviewing → Resolved.

---

## ✅ DONE — Phase 5: Relief Fund - Financial Assistance Requests (§3.11)

### What I found when I read the code
- Backend (`assistanceController.js` / `assistanceRoutes.js`) already fully
  implemented the whole pipeline: create request → Volunteer field-verify →
  Authority/Admin office-verify → approve/reject → allocate relief money
  from a campaign. `frontend/src/lib/api.js` already had every one of those
  client methods wired too — same as Phase 4, built earlier but never called
  from any screen.
- **Confirmed the gap flagged in the last report:** `POST
  /assistance-requests/:id/documents` really did only accept a JSON
  `{ documents: [{ url, label }] }` body. There was no generic "upload a
  file, get a URL back" endpoint anywhere on the backend, so a citizen
  filing a request from the UI had no real way to attach proof of anything.
- No screen existed for this workflow at all - not for citizens filing a
  request, not for volunteers field-verifying one, not for staff
  approving/allocating.

### What I built
**Backend (the change flagged as possibly-needed last time - it was)**
- `uploadMiddleware.js` - new `assistance` upload folder and a new
  `assistanceDocumentUpload` multer instance (same JPEG/PNG/WEBP/GIF +
  PDF/Word filter as the news uploader, 10MB/file, max 5 files).
- `assistanceController.js` - new `uploadAssistanceDocumentFiles` (saves
  real files to disk, appends them to `request.documents` using each file's
  original name as the label) and `deleteAssistanceDocument` (removes one
  document + best-effort disk cleanup, mirroring the disaster-image delete
  pattern).
- `assistanceRoutes.js` - new `POST/DELETE /assistance-requests/:id/documents/upload`,
  gated by the same `uploadProofDocuments` permission as the original
  JSON-url route (left in place, unchanged, for any caller that already has
  a hosted URL).

**Frontend**
- `lib/api.js` - `assistanceRequests.uploadDocumentFiles` (real multipart
  upload via the existing `uploadRequest` helper) and `.deleteDocument`;
  `adapt.assistanceRequest()`.
- `features/DonationsView.jsx` - added, in this order:
  - `AssistanceRequestFormModal` - category/amount/reason + optional
    linked disaster or shelter (Citizen/Authority/Admin; Volunteer has no
    access to this specific action per `fundPermissions.js`).
  - `AssistanceDocuments` - upload/delete proof photos or PDF/Word files
    against a request, using the new upload route.
  - `AssistanceManageModal` - tabbed Details/Documents view with
    Field-Verify (Volunteer, FIELD scope), Office-Verify, Approve/Reject,
    and Allocate-relief-money (against an Active campaign), each button
    gated through `getFundScope`/`hasFullFundAccess` exactly like the
    Phase 4 campaign modal.
  - A new "Financial Assistance Requests" panel in the main view: a
    status-filterable table, a "Request Assistance" button for whoever can
    file one, and a row action that opens the manage modal.
- `DisasterManagementSystem.jsx` - **Volunteer never had a route to Relief
  Fund at all** (the sidebar nav entry excluded `"volunteer"`, and
  `VolunteerDashboard` had no `donations` tab handler), which meant a
  Volunteer had no way to reach the one action that's actually theirs
  (field-verify). Added `"volunteer"` to the nav item's `roles`, destructured
  `currentUser` into `VolunteerDashboard`, and added the `donations` tab
  case.

### Verified
- Same sandbox limitation as Phases 1-4: no network access for `npm
  install`, so `npm run dev` wasn't possible.
- Syntax-validated all five changed files: `esbuild` for the three JSX/JS
  frontend files, `node --check` for the three backend files - all clean.
- Not run against a live backend/DB - runtime behavior (the actual file
  upload round-trip, the allocate-from-campaign balance math, volunteer
  field-scope filtering) is unverified.

### Close-out pass — everything on the "not finished yet" list resolved or explained
Went back through the six open items from the last report:

1. **Owner document delete — fixed.** `canDeleteDocs` in
   `AssistanceManageModal` is now `isStaff || isRequestOwner`, matching
   `deleteAssistanceDocument` in the backend controller exactly. Added the
   missing `currentUserId` prop through `DonationsView` →
   `AssistanceManageModal` (the same prop `CampaignManageModal` already
   had) so the owner check has something to compare against.
2. **Volunteer's request list scope — left as documented, still
   sandbox-untestable.** No code gap found on inspection; this needs a real
   login as an unassigned Volunteer to confirm the empty-table behavior,
   which still requires `npm install`.
3. **Citizen "My Requests" framing — fixed.** The panel heading and
   subtitle now read "My Assistance Requests" / relief money you've
   requested for Citizen, vs. the generic staff-facing copy for
   Authority/Admin/Volunteer. Purely cosmetic, as flagged.
4. **Multer round-trip — left as documented, still sandbox-untestable.**
   Same limitation as every phase; flagged again below.
5. **Inline campaign balance on Allocate — fixed.** Picking a campaign in
   the Allocate tab now fetches and shows that campaign's live balance
   (via the existing `api.funds.balance` call, same one
   `CampaignManageModal`'s Balance tab uses) and turns red if the typed
   amount would exceed it - before hitting the backend's rejection.
6. **Audit tab — fixed.** Extended `getFundAuditLogs` on the backend to
   accept an `assistanceRequest` filter (previously `campaign`-only), with
   scope handling so an Authority with LIMITED access still sees entries
   they personally performed on a request even when it isn't tied to a
   campaign they created. Added a third "Audit" tab to
   `AssistanceManageModal`, same rendering as `CampaignManageModal`'s.

### Verified
- Same sandbox limitation as every phase before it: no network access, so
  `npm install`/`npm run dev` still isn't possible here.
- Syntax-validated `DonationsView.jsx` with `esbuild` and
  `fundController.js` with `node --check` - both clean.
- Not run against a live backend/DB - runtime behavior (the actual file
  upload round-trip, an unassigned Volunteer's empty list, the balance
  fetch on campaign selection) is still unverified for the reasons above.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. As a Citizen who filed a request, open its Documents tab and confirm
   you can delete a document you uploaded yourself.
2. As Authority/Admin, open a request's new Audit tab and confirm the
   create/verify/approve/allocate trail shows up.
3. In the Allocate tab, pick a campaign and confirm its balance appears,
   and that the balance warning shows red if you type more than it has.
4. As a Citizen, confirm the assistance panel reads "My Assistance
   Requests."
5. Everything from the original Phase 5 checklist above still applies -
   this was a close-out of the six flagged gaps, not a re-test of the
   whole phase.

---

## ✅ DONE — Phase 6a: Volunteers admin approval (§3.7)

### What I found when I read the code
- `volunteerController.js` / `volunteerRoutes.js` already fully implement
  approve/reject/inactivate (`PATCH /:id/status`, any of the 4 status
  values), assign to a disaster and/or shelter (`PATCH /:id/assign`), and
  get-stats — open to **both Authority and Admin**. Delete
  (`DELETE /:id`) is **Admin-only** — one correction to my last report,
  which said delete was open to both; re-reading `volunteerRoutes.js`
  line-by-line, `authorize("Admin")` gates that one route specifically.
- `frontend/src/lib/api.js` already had every client method needed
  (`list/me/register/updateMe/updateStatus/assign/remove`) — this gap was
  entirely in the UI and the nav config, not the API layer.
- The sidebar's `volunteers` entry was `roles: ["admin"]` only, so
  Authority had no route to a volunteers screen at all.
- The existing "Verify Volunteers" screen (Admin-only) called only
  approve/reject; it had no assign action, no deactivate/reactivate, no
  delete, and didn't surface district, availability, or current
  assignment.
- `adapt.volunteer()` dropped `district`, `availability`,
  `assignedDisaster`, and `assignedShelter` entirely, so the UI had
  nothing to build an assign screen or an assignment column from even if
  one existed.

### What I built
**`frontend/src/lib/api.js`**
- `adapt.volunteer()` now carries `district`, `availability`, `ngo`, and
  `assignedDisaster`/`assignedShelter` as `{ _id, label }` (built from the
  backend's populated ref objects) so the UI can pre-fill and display
  current assignments.

**`frontend/src/DisasterManagementSystem.jsx`**
- Sidebar `volunteers` entry changed to `roles: ["authority", "admin"]`,
  matching what the backend actually permits.
- New shared **`VolunteersView`** (used by both Authority and Admin
  dashboards, `role` prop gates the Admin-only delete action) replacing
  the old Admin-only approve/reject-only table:
  - Table now also shows district, availability, and current
    disaster/shelter assignment.
  - Pending → Approve / Reject.
  - Approved → **Assign** (opens `AssignVolunteerModal` below) and
    **Deactivate**.
  - Inactive / Rejected → **Reactivate** (sets back to Approved).
  - Admin only → **Delete profile**.
- New **`AssignVolunteerModal`** — dropdowns for "Disaster Response" and
  "Shelter" (pre-filled from the volunteer's current assignment, either
  can be cleared independently), calling `api.volunteers.assign`.
- `AuthorityDashboard` now has a `tab === "volunteers"` case at all — it
  previously had none, so Authority users hitting this tab silently fell
  through to the Overview screen.

### Verified
- Same sandbox limitation as every phase before it: no network access, so
  `npm install` / `npm run dev` wasn't possible.
- Syntax-validated both changed files with `esbuild` (JSX/ESM parse +
  transform) — both compile cleanly with zero errors.
- No backend changes were needed for this phase — the gap was entirely
  frontend, and I re-read the backend routes/controller closely enough to
  correct the delete-permission mistake above rather than compound it.
- Not run against a live backend/DB — runtime behavior (the actual
  assign/status PATCH round-trips, the reactivate transition) is
  unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. Log in as Authority → confirm a "Volunteers" tab now appears in the
   sidebar (it didn't before) and shows the same actions as Admin's,
   minus Delete.
2. Approve a Pending volunteer → confirm "Assign" and "Deactivate"
   appear; open Assign, pick a disaster and a shelter, save, confirm the
   table's "Assigned To" column updates.
3. Deactivate an Approved volunteer, then confirm "Reactivate" appears
   and sets it back to Approved.
4. As Admin only, confirm "Delete profile" appears and Authority does
   not see it.

---

## ✅ DONE — Phase 6b: NGO verification queue (§3.8, core surface)

### What I found when I read the code
- `ngoController.js` / `ngoRoutes.js` have ~25 endpoints covering the
  NGO lifecycle. `frontend/src/lib/api.js` had only
  `ngos.list/getById/register/updateStatus/remove` - five of them.
  `NGOView.jsx` had a register form, a public "Verified NGOs" directory,
  and an **Admin-only** approve/reject queue that called nothing else -
  no document/identity verification, no suspend/deactivate/delete UI, no
  edit, no assignment, no services, no audit view - and Authority had no
  route to any of it (`isAdmin` gated the whole queue tab).
- I scoped this pass to the **verification/management core**: status
  (approve/reject), document + identity verification, suspend/unsuspend,
  deactivate/reactivate, delete, edit details, assignment to
  disasters/shelters/areas, service catalog management, and the audit
  log. I deliberately left out the "extras" that sit further from
  "verification queue" and are each closer to their own mini-feature:
  viewing an NGO's resources/volunteers roster, NGO-linked tasks,
  assistance-request request/respond, activity reports, ratings,
  performance stats, ad-hoc notifications, and PDF-style report
  generation. Flagged below, not silently dropped.

### What I built
**`frontend/src/lib/api.js`**
- Added `ngos.update`, `deactivate`, `suspend`, `unsuspend`,
  `verifyDocuments`, `verifyIdentity`, `assign`, `updateServices`,
  `getAudit`.
- `adapt.ngo()` now also carries `isActive`, `suspended`,
  `suspendedReason`, `documentsVerified`, `identityVerified`, `services`,
  and `assignedAuthorities`/`assignedDisasters`/`assignedShelters` (as
  `{ _id, label }` via a new `ngoRefList()` helper that handles both the
  raw-id arrays the list endpoint returns and the populated docs
  `getById` returns) and `assignedAreas`.

**`frontend/src/features/NGOView.jsx`**
- The queue tab is now **"Manage NGOs"**, visible to Authority and
  Admin both (previously Admin-only), with a status filter
  (Pending/Approved/Rejected/All - defaults to Pending) instead of only
  ever showing Pending.
- Quick Approve/Reject stayed on the row for Pending items (Admin only,
  matching `ngoRoutes.js`'s `authorize("Admin")` on `/status`).
- New **"Manage"** button on every row opens a new **`NgoManageModal`**
  with five tabs:
  - **Verification** - status badges (status/active/suspended/verified
    flags), Approve/Reject with a review-notes field (Admin), Document
    and Identity verify/revoke toggles (Admin), Deactivate/Reactivate,
    Suspend (with reason)/Lift Suspension, and Delete (all Admin-only,
    matching the route table exactly) - Authority sees the same
    read-only status info with a note on who can act.
  - **Details** - edit organization/contact/bank fields, gated to Admin
    or an Authority actually listed in `assignedAuthorities` (mirrors
    `canManageAssigned()` in the backend).
  - **Assign** - add/remove disaster responses, shelters, and district
    areas (Authority + Admin both, unscoped - matches `assignNgo`'s
    route-level-only permission check).
  - **Services** - add/remove/toggle-active services, same
    Admin-or-assigned gate as Details.
  - **Audit** - the NGO's activity log (`getNgoAudit`); Admin gets the
    full log, Authority the same limited/recent view the backend
    already returns.
- `NGOView` now takes `currentUserId`, `disasters`, `shelters` props (for
  the assigned-authority check and the Assign tab's dropdowns) - both
  dashboards were updated to pass them.

### Verified
- Same sandbox limitation as every phase: no network access, so
  `npm install`/`npm run dev` wasn't possible.
- Syntax-validated all three changed files (`api.js`, `NGOView.jsx`,
  `DisasterManagementSystem.jsx`) with `esbuild` - all clean.
- No backend changes were needed - every endpoint this phase uses
  already existed and matched its validator/route exactly.
- Not run against a live backend/DB - runtime behavior (the actual
  status/verify/suspend/assign/services round-trips, the
  assigned-Authority permission check) is unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. As Admin, open Manage NGOs → switch the status filter → open "Manage"
   on a Pending NGO → approve it from the Verification tab with a review
   note → confirm it moves to the Approved filter and appears in the
   public "Verified NGOs" directory.
2. Still as Admin: verify its documents and identity, suspend it with a
   reason, lift the suspension, deactivate/reactivate it, and confirm
   each shows up in the badge row at the top of the modal.
3. As Authority: confirm "Manage NGOs" now appears at all, that you can
   open an NGO and see the same info but without the
   approve/reject/verify/suspend/delete buttons, and that you *can* use
   the Assign tab (disasters/shelters/areas) regardless of assignment.
4. Add yourself (an Authority user) to an NGO's `assignedAuthorities` via
   Admin (currently DB-side only - there's no UI for it, see below) and
   confirm Details/Services become editable for you on that NGO only.
5. Add a couple of services on the Services tab, toggle one inactive,
   remove another; open the Audit tab and confirm every action above
   shows up in order.

### Still open from NGOs (§3.8), lower priority than the core above
- No UI to edit `assignedAuthorities` itself (which Authority users
  oversee an NGO) - it's Admin-only via `PUT /:id` and I didn't build a
  user-picker for it this pass; can be added to the Details tab next.
- Resources/volunteers roster view, NGO-linked task creation,
  assistance-request request/respond, activity reports, ratings,
  performance stats, ad-hoc notify, and report generation all still have
  no UI - backend fully supports them (see the endpoint list above).

## ✅ DONE — Phase 7: Disaster News workflow (§3.9)

### What I found when I read the code
- The backend (`newsController.js` / `newsRoutes.js` / `newsCategoryRoutes.js`
  / `newsSourceRoutes.js`) already fully implemented **every** action in the
  PDF's News table — draft → submit → approve/reject → publish, assign an
  Authority owner, verify, schedule publication (Admin any time, Authority
  ≤72h out), send emergency news, media upload/delete, official-source
  citations, disaster-update reporting/review, problem reports/review,
  analytics, and the audit trail. None of it needed backend changes.
- The old `NewsView` only ever fetched `status: "Published"` items and had
  a "Publish News" button that called `create` immediately followed by
  `publish` — it skipped the entire Draft → Pending Approval → Approved
  workflow. There was no Manage screen, no assign/approve/reject/schedule/
  emergency UI, no media or source-citation UI, no disaster-update or
  report-review UI, no audit view, and no category/source directory
  management screen (Admin-only per the routes).
- `frontend/src/lib/api.js`'s `news` client only had
  `list/getById/create/update/remove/submit/approve/reject/publish/verify/
  report` — missing `assign`, `addUpdate`, `reviewUpdate`, media upload/
  delete, source add/remove, report review, `sendEmergency`, `schedule`,
  `stats`, and `getAudit`. The `news-sources` directory endpoint
  (`newsSourceRoutes.js`) had **zero** client methods at all, even though
  it was already registered on the backend (`/api/news-sources`).
- `adapt.news()` dropped `images`, `documents`, `sources`,
  `disasterUpdates`, `reports`, `rejectionReason`, `scheduledFor`, and
  `views` — so even a screen that existed would have nothing to show for
  most of the workflow's state.

### What I built
**`frontend/src/lib/api.js`**
- Added the full set of missing `api.news.*` methods: `assign`,
  `addUpdate`, `reviewUpdate`, `uploadMedia` (multipart, field `files`,
  matching `newsMediaUpload.array("files", 5)`), `deleteMedia`,
  `addSource`, `removeSource`, `reviewReport`, `sendEmergency`,
  `schedule`, `stats`, `getAudit`.
- New `api.newsSources` client (`list/create/update/remove`) for the
  Admin-only source directory — previously had no frontend methods.
- `adapt.news()` now also carries `images`, `documents`, `sources`,
  `disasterUpdates`, `reports`, `rejectionReason`, `scheduledFor`,
  `publishedAt`, `views`, `verifiedByName`, `createdByName`, and
  `assignedToName`.
- New `adapt.newsSource()`.

**`frontend/src/features/NewsView.jsx`** (rewritten)
- Citizen/Volunteer view is unchanged in spirit (Published-only feed with
  category/region/search filters and breaking-news section) but each
  `NewsCard` now shows uploaded images, official source citations, and
  approved field updates when expanded, and every role can **Report a
  problem** on an item (`POST /report`, matches the "everyone" cell in the
  permission table). Volunteers additionally get **Add field update**
  inline, which lands as `Pending` for Authority/Admin to review (the
  "report only" cell).
- Authority/Admin get a view switcher: **Public Feed** (same feed as
  above) and **Manage Newsroom** — a filterable list (by status, and a
  "mine" toggle for created-or-assigned) with a stats strip
  (`GET /news/stats/summary`) and a **New Draft** button that now actually
  creates a `Draft` instead of auto-publishing.
- Each row opens a new **`NewsManageModal`** with seven tabs:
  - **Workflow** — Submit for Approval, Approve/Reject-with-reason
    (Admin), Publish, Mark Verified, Send as Emergency, Schedule
    (datetime picker, with the 72h note for Authority), Assign (Admin,
    dropdown of Authority users), and Delete (Admin) — every button is
    gated to match `canManage` (Admin any | Authority only if
    `assignedTo === self`) exactly as the route table specifies.
  - **Details** — edit headline/summary/content/category/region/tags,
    gated the same way; read-only view for everyone else.
  - **Media** — image grid + document list, upload/delete, reusing the
    same real-multipart-upload pattern as the Phase 1/2 evidence
    managers.
  - **Sources** — add/remove official source citations.
  - **Updates** — add a disaster update (auto-approved for staff) and
    approve/dismiss any `Pending` volunteer-submitted one.
  - **Reports** — view reports filed against the item and mark them
    Reviewed/Dismissed.
  - **Audit** — the item's audit trail (`GET /:id/audit`), fetched lazily.
- New **`DirectoryPanel`** (Admin-only third view, "Categories &
  Sources") — add/deactivate/delete News categories and add/deactivate/
  delete entries in the official source directory, both previously
  UI-less despite full backend support.
- `NewsView` now takes `currentUserId` and `users` props (the latter only
  populated on the Admin dashboard, matching `/api/users` already being
  Admin-only) for the assigned-Authority check and the Assign tab's
  dropdown; `DisasterManagementSystem.jsx` was updated at all four
  `<NewsView>` call sites to pass them.

### Verified
- Same sandbox limitation as every phase: no network access, so
  `npm install`/`npm run dev` wasn't possible.
- Syntax-validated all three changed files (`api.js`, `NewsView.jsx`,
  `DisasterManagementSystem.jsx`) with `esbuild` — all compile cleanly.
- No backend changes were needed — every endpoint this phase uses already
  existed and matched its validator/route exactly.
- Not run against a live backend/DB — runtime behavior (the actual
  submit/approve/reject/publish/schedule/assign round-trips, the
  assigned-Authority permission check, the multipart media upload) is
  unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. As Authority: Manage Newsroom → New Draft → save it → open Manage →
   Workflow tab → Submit for Approval. Confirm you can't Approve/Reject
   (Admin-only) but can still edit Details while it's your assigned item.
2. As Admin: find that same item under "Pending Approval" → Approve it
   (or Reject with a reason and confirm it shows on the item) → Publish
   it → confirm it now appears in "Public Feed" for all roles.
3. Upload an image and a document on the Media tab, then delete one of
   each. Add a source citation and remove it. Add a disaster update from
   the Updates tab (should show Approved immediately for staff).
4. As Volunteer: open a Published item on the public feed → Add field
   update → confirm it doesn't appear publicly yet → as Authority/Admin,
   open the item's Updates tab → Approve it → confirm it now shows in the
   public "Field updates" section.
5. As any role: Report a problem on a published item → as Authority/
   Admin, open Reports tab → mark it Reviewed.
6. As Admin: schedule a Draft/Approved item a few minutes out, then
   reload the feed after that time passes and confirm it auto-publishes
   (`publishDueScheduled` runs lazily on every `GET /news`). Also try
   Send as Emergency on a Draft and confirm it publishes immediately and
   is flagged urgent.
7. As Admin: open "Categories & Sources" → add a category and a source,
   deactivate one of each, delete one of each.
8. As Admin: Assign tab on a news item → pick an Authority → Assign →
   confirm that Authority can now manage it (Details/Workflow become
   editable for them, matching `canManage`).

### Still open from News (§3.9), lower priority than the core above
- No UI to edit `relatedDisaster` (linking a news item to a specific
  Disaster record) — the backend field exists and is accepted by
  create/update, just no picker was built this pass.
- No way to cancel/clear a `scheduledFor` time once set (the backend has
  no unschedule endpoint — publish or wait it out).
- Category/source directory editing is add + activate/deactivate +
  delete only; renaming an existing category or source has no UI (would
  need a small edit form on top of the existing `update` endpoints).

## ✅ DONE — Phase 8: Live Risk Map admin tools (§3.13)

### What I found when I read the code
- The **backend was already 100% built** for this whole module — nothing
  needed to change server-side. `riskZoneController.js`,
  `evacuationRouteController.js`, and `roadBlockController.js` already had
  every action the PDF lists: add/edit/delete a risk zone, override the AI
  risk score (Admin any value, Authority capped to a +/-15 nudge on zones
  assigned to them), create/edit/delete evacuation routes, mark an area
  evacuated, and report/confirm/clear a road block (Citizen/Volunteer land
  as "Reported", Admin/Authority land as "Confirmed" directly) — all gated
  by the existing `mapPermissions.js` scope table.
- `frontend/src/lib/api.js` **also already had every client method** for
  all three modules (`api.riskZones.*`, `api.evacuationRoutes.*`,
  `api.roadBlocks.*`) — someone had wired the API layer ahead of the UI.
- The gap was entirely in `SatelliteView.jsx`: it only ever rendered
  risk "zones" derived client-side from geotagged disaster reports (no
  real `RiskZone` model in sight), had no evacuation-route or road-block
  layers at all, and had zero admin controls — no add, no edit, no
  override, no mark-evacuated, no confirm/clear. It also never called the
  API, so real risk-zone data never reached the screen.
- `adapt` (in `lib/api.js`) had no mappers for `RiskZone`, `EvacuationRoute`,
  or `RoadBlock` — nothing to turn the backend documents into UI-ready rows.

### What I built
**`frontend/src/lib/api.js`**
- Added `adapt.riskZone()`, `adapt.evacuationRoute()`, `adapt.roadBlock()` —
  same pattern as `adapt.disaster()`/`adapt.shelter()`, including the
  `effectiveScore` fallback (override value if present, else the AI score)
  so the UI never needs to compute that itself.

**`frontend/src/features/SatelliteView.jsx`** (rewritten)
- On mount, fetches real `riskZones`, `evacuationRoutes`, and `roadBlocks`
  from the backend (`api.riskZones.list` / `api.evacuationRoutes.list` /
  `api.roadBlocks.list`) alongside the existing disaster/shelter props —
  each call is independently caught so one failing endpoint doesn't blank
  the whole map.
- Three new toggleable map layers (**Risk Zones**, **Evacuation Routes**,
  **Road Blocks**), kept alongside — not replacing — the existing
  disaster-derived "Disaster Zones" heat layer, since that's a different
  concept (auto-grouped incident reports vs. an Admin/Authority-curated
  zone).
- **Risk Zones**: circle + marker per zone, colored by risk level; popup
  shows district, status, and the effective score (override or AI). A
  "Manage" button (shown only if the role can edit/override/remove) opens
  **`RiskZoneModal`** — edit fields, apply an AI-score override with a
  reason, or delete, each field gated by `mapPermissionsFor(role, [...])`
  exactly matching the backend's scope. Admin/Authority get an **"Add Risk
  Zone"** button above the map.
- **Evacuation Routes**: a polyline from the start point through any
  waypoints to the destination (color/dash reflects Active/Blocked/Closed),
  with "A"/"B" endpoint markers. Popup + **`EvacuationRouteModal`** covers
  create/edit and "Mark destination area evacuated" (once evacuated it
  shows a confirmation state instead of the button, matching the backend
  having no "unmark" endpoint). Admin/Authority get an **"Add Route"**
  button.
- **Road Blocks**: marker colored by status (Reported/Confirmed/Cleared).
  Every logged-in role gets a **"Report Road Block"** button — it always
  hits the same `POST /road-blocks`, and the backend decides Reported vs.
  Confirmed based on the caller's scope, exactly as designed. Admin/
  Authority additionally get Confirm/Clear/Delete from the manage modal.
- All three modals reuse one local `ModalShell`/`Field`/button-class
  pattern (matching the style already established in `NewsView.jsx`),
  since `SatelliteView.jsx` is a standalone feature file and doesn't share
  the main file's internal helpers.
- `DisasterManagementSystem.jsx`: all four `<SatelliteView>` call sites
  (Citizen, Authority, Volunteer, Admin dashboards) now pass `token`,
  `role`, and `showToast` — previously only `disasters`/`shelters` were
  passed, so the map had no way to call the API or know who was looking.

### Verified
- Same sandbox limitation as every phase: no network access, so
  `npm install`/`npm run dev` wasn't possible.
- Syntax-validated all three changed files (`api.js`, `SatelliteView.jsx`,
  `DisasterManagementSystem.jsx`) with `esbuild` — all compile cleanly,
  zero errors.
- No backend changes were needed or made this phase.
- Not run against a live backend/DB — runtime behavior (the actual
  create/update/override/mark-evacuated/confirm/clear round-trips, and the
  per-role button gating) is unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. Open the Satellite/Map tab as Citizen — confirm Risk Zones, Evacuation
   Routes, and Road Blocks layers render (toggle each on/off) and that
   there's no Add/Manage button anywhere except "Report Road Block."
2. As Authority or Admin: "Add Risk Zone" → fill name + coordinates →
   save → confirm the new zone appears on the map. Click its marker →
   Manage → edit a field → save. Try the AI-score override (Authority
   should get rejected server-side if the nudge exceeds +/-15 from the
   AI score — confirm the error surfaces via `showToast`).
3. As Admin: delete a risk zone from the manage modal, confirm it
   disappears from the map without a refresh.
4. As Authority or Admin: "Add Route" → set from/to coordinates → save →
   confirm the polyline + A/B markers appear. Open Manage → "Mark
   destination area evacuated" → confirm the button is replaced by the
   evacuated confirmation state.
5. As any role: "Report Road Block" → submit → as Citizen/Volunteer
   confirm it lands as "Reported"; as Authority/Admin confirm it lands as
   "Confirmed" directly. As Authority/Admin: open a Reported block →
   Confirm → Clear. As Admin: delete a road block record.
6. Confirm none of the three new modals crash or show stale data when
   closed and reopened on a different zone/route/block.

---

## ✅ DONE — Phase 9: AI Risk Engine admin settings (§3.14, admin-only rows)

### What I found when I read the code
- Backend (`aiRiskController.js` / `aiRiskRoutes.js` / `config/aiRiskPermissions.js`
  / `models/AiRiskSettings.js`) already fully implemented all five
  Admin-only configuration rows from the PDF: configure risk thresholds,
  configure risk weights, add/manage disaster types, manage AI settings,
  manage AI data sources — backed by a singleton `AiRiskSettings` document.
  None of it needed backend changes.
- `frontend/src/lib/api.js` had **zero** `api.aiRisk.*` methods at all —
  not even for the view-only endpoints, let alone the settings ones.
- The "AI Risk Engine" nav tab (`AIPanel`, shared by Authority and Admin)
  was **entirely local/fake**: `predictions` were computed client-side from
  existing disaster reports (`buildPredictions`), and its one "Alert
  Thresholds" card was local `useState` with a "Save" button that only
  called `showToast("Thresholds saved")` — nothing ever reached the
  backend, and the real `AiRiskSettings` document was completely
  unreachable from the UI.

### What I built
**`frontend/src/lib/api.js`**
- New `api.aiRisk.*` client covering the five Admin-only settings rows:
  `getThresholds/updateThresholds`, `getWeights/updateWeights`,
  `getDisasterTypes/addDisasterType/updateDisasterType/removeDisasterType`,
  `getSettings/updateSettings`, `getDataSources/addDataSource/
  updateDataSource/removeDataSource`. (The view-only AI endpoints -
  overall risk, predictions, accuracy, etc. - are still unwired; see "Not
  started yet" below.)

**`frontend/src/DisasterManagementSystem.jsx`**
- `AIPanel` now takes `token`/`role` props (both call sites - Authority's
  and Admin's - updated to pass them) and, for Admin only, renders a new
  **`AIRiskSettingsPanel`** underneath the existing (still-local)
  predictions/threshold cards:
  - **Risk Score Thresholds** — edit the low/medium/high/critical score
    bands, save to `PUT /ai-risk/settings/thresholds`.
  - **Risk Factor Weights** — list of `factor -> weight` from the backend,
    edit/save a weight, add a new factor, or remove one (saved as a
    remaining-factors PUT, since the backend has no per-factor delete).
  - **Disaster Types** — table of configured types with
    activate/deactivate and remove, plus an add-new-type form. Uses
    `manageDisasterTypes`'s real CRUD endpoints.
  - **General AI Settings** — model version, auto-confirm-above-score, and
    an AI-alerts-enabled toggle, saved to `PUT /ai-risk/settings/general`.
  - **AI Data Sources** — table of configured sources (name/type/endpoint)
    with enable/disable and remove, plus an add-new-source form.
  - All five sections are clearly labeled "Admin only" and only render
    when `role === "admin"` — Authority still sees just the existing
    predictions view, matching `aiRiskPermissions.js` (Authority: `NONE`
    on all five `configure*`/`manage*` actions).

### Verified
- Same sandbox limitation as every phase: no network access, so
  `npm install`/`npm run dev` wasn't possible.
- Syntax-validated both changed files with `esbuild` — both compile
  cleanly, zero errors.
- No backend changes were needed or made this phase.
- Not run against a live backend/DB — runtime behavior (the actual
  GET/PUT/POST/DELETE round-trips against the singleton settings
  document) is unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. Log in as Admin → AI Risk Engine → confirm all five settings cards load
   with the backend's current values (defaults: thresholds 25/50/75/90,
   six weighted factors, five disaster types, general settings, empty
   data sources list).
2. Edit a threshold → Save → refresh the page → confirm it persisted.
3. Edit an existing weight and save it; add a new factor/weight; remove a
   factor — confirm each round-trips and survives a refresh.
4. Add a disaster type, toggle it inactive, then remove it. Confirm
   duplicate names are rejected (backend returns 400).
5. Edit General AI Settings (model version, auto-confirm score, alerts
   toggle) → Save → refresh → confirm it persisted.
6. Add a data source, toggle it disabled, then remove it.
7. Log in as Authority → AI Risk Engine → confirm none of the five
   settings cards render (Authority has no access per
   `aiRiskPermissions.js`).

---

## ✅ DONE — Phase 10: AI Risk Engine view-only endpoints + workflow (§3.14, remaining rows)

### What I found when I read the code
- Backend (`aiRiskController.js` / `aiRiskRoutes.js`) already fully
  implemented every remaining row from the PDF's AI Risk Engine table:
  view overall risk, risk score, risk factors, affected areas, population
  at risk, shelter/evacuation recommendations, resource predictions/
  shortages, AI accuracy, prediction history, audit logs, plus the
  workflow actions (generate assessment, approve/confirm predictions,
  AI-analyze citizen reports, record outcome) and ground-condition
  reporting. None of it needed backend changes.
- `frontend/src/lib/api.js`'s `api.aiRisk` only had the five Phase-9
  settings methods - none of these view/workflow endpoints had a client
  method.
- The "AI Risk Engine" tab's `AIPanel` was still showing the old
  local/fake `buildPredictions()` grid (client-side heuristic off
  existing disaster reports) with a "Alert Thresholds" card whose "Save"
  button never called the backend - none of it was real AI Risk Engine
  data.

### What I built
**`frontend/src/lib/api.js`**
- Extended `api.aiRisk` with the full view/workflow surface:
  `getOverallRisk`, `getRiskScore`, `getRiskFactors`, `getAffectedAreas`,
  `getPopulationAtRisk`, `getShelterRecommendations`,
  `getEvacuationRecommendations`, `getResourcePredictions`,
  `getResourceShortages`, `getAiAccuracy`, `getAuditLogs`,
  `getPredictionHistory`, `listPredictions`, `generateAssessment`,
  `approvePrediction`, `confirmPrediction`, `analyzeCitizenReports`,
  `recordOutcome`, `getGroundConditions`, `reportGroundCondition`.
- Added `adapt.aiPrediction()` and `adapt.groundConditionReport()`
  mappers, same pattern as `adapt.disaster()`/`adapt.riskZone()`.

**`frontend/src/DisasterManagementSystem.jsx`**
- `AIPanel` is now a tabbed shell (Predictions / Insights / Ground
  Conditions / Audit Logs / Settings-Admin-only) instead of one static
  page. The old fake predictions grid and fake "Alert Thresholds" card
  are gone, replaced by:
  - **`AIPredictionsPanel`** — real predictions list (district/status
    filters) backed by `getDisasterPredictions`, an AI-accuracy stat
    strip, a "Generate Assessment" modal (disaster type, district,
    center coordinates, affected areas, population at risk, optional
    related disaster/risk zone), and per-row actions: Approve, Confirm/
    Reject (with reason), Analyze Citizen Reports (checklist of existing
    disaster reports to fold in), and Record Outcome (Accurate/
    Inaccurate) - covering every workflow action in the PDF's table.
  - **`AIInsightsPanel`** — read-only dashboard combining overall risk,
    per-zone risk scores, risk factors (numeric weights for Admin/
    Authority's FULL scope), affected areas, population at risk by
    district, shelter recommendations, evacuation recommendations, and
    resource predictions/shortages - all fetched live on mount.
  - **`AIGroundConditionsPanel`** — submit-a-report form plus the full
    feed (Admin/Authority get every submitter's reports per the
    backend's role-based filter).
  - **`AIAuditLogsPanel`** — paginated AI Risk Engine audit trail
    (action/entity/performed-by/district/when); the backend
    automatically narrows Authority to their own district (`LIMITED`
    scope) with no frontend change needed.
  - The "Settings" tab (Phase 9's `AIRiskSettingsPanel`) only shows for
    Admin, matching `aiRiskPermissions.js`.
- None of these new sub-panels gate their action buttons by role beyond
  what's already true structurally (e.g. only Admin sees the Settings
  tab) - the backend's per-action scope table is the source of truth and
  rejects anything a caller isn't allowed to do, same pattern already
  used for the "Report Road Block" button in Phase 8.

### Verified
- Same sandbox limitation as every phase: no network access, so
  `npm install`/`npm run dev` wasn't possible.
- Syntax-validated both changed files with `esbuild` - both compile
  cleanly, zero errors.
- No backend changes were needed or made this phase.
- Not run against a live backend/DB - runtime behavior (all the new
  GET/POST/PATCH round-trips, the generate/confirm/analyze/outcome
  workflow, and the Authority-vs-Admin audit-log scoping) is unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. Log in as Authority or Admin → AI Risk Engine → confirm all five tabs
   render (Authority won't see "Settings").
2. **Predictions tab**: "Generate Assessment" → fill disaster type +
   district → Save → confirm it appears in the table as "Pending".
   Approve it, then Confirm it (with a reason), then try "Analyze Citizen
   Reports" against a couple of existing disaster reports, then record an
   outcome (Accurate/Inaccurate) → confirm the accuracy stat strip
   updates.
3. **Insights tab**: confirm overall risk, per-zone scores, risk factors,
   affected areas, population at risk, shelter/evacuation recommendations,
   and resource predictions/shortages all load real data (create a risk
   zone or shelter first if any section looks empty).
4. **Ground Conditions tab**: submit a report, confirm it appears in the
   feed below.
5. **Audit Logs tab**: confirm entries appear after doing the actions
   above, and that pagination works if there are more than 20.
6. As Authority: confirm the Audit Logs tab only shows entries for their
   own district, and that the AI accuracy stat strip is limited the same
   way (`viewAiAccuracy`/`viewAuditLogs` are both `LIMITED` for
   Authority).

---

## ✅ DONE — Phase 11: Shelter access for Citizen/Volunteer

### What triggered this phase
User pasted the product's Shelter role-permission table and said the
functions weren't visible in the frontend. Investigation found two real
bugs, not a documentation gap:

1. **`SIDEBAR_NAV`'s `"shelters"` entry only listed `roles: ["authority",
   "admin"]`.** Citizen had a half-wired, read-only `tab === "shelters"`
   branch in `CitizenDashboard` that was literally unreachable (no sidebar
   link to it). Volunteer had no `tab === "shelters"` branch at all.
2. **Two rows of the permission table didn't match the table the user
   pasted:** `citizenCheckInOut` was `Citizen: NONE` (table wants
   Citizen "Self"), and `manageCapacity` was `Volunteer: NONE` (table wants
   Volunteer "✅" for "Update occupancy").

### What I built
**Backend**
- `config/shelterPermissions.js` (+ its doc comment): added a new `SELF`
  scope. `citizenCheckInOut` is now `Citizen: SELF` (was `NONE`).
  `manageCapacity` is now `Volunteer: ASSIGNED` (was `NONE`).
- `middleware/shelterAccessMiddleware.js`: `isShelterInScope` now handles
  `SCOPE.SELF` (any shelter is "in scope" to look at; the actual
  restriction to the citizen's own record happens in the controller).
- `controllers/shelterController.js`:
  - `assertShelterInScope` now accepts `SCOPE.SELF`.
  - New `resolveActingCitizenId(req, bodyCitizenId)` helper - when scope is
    `SELF`, pins the acting citizenId to `req.user._id` regardless of what
    the client sends, so a citizen can never check someone else in/out.
    Wired into `checkInCitizen` and `checkOutCitizen`.
  - `getShelterOccupants` now filters to `citizen: req.user._id` when scope
    is `SELF`, so a citizen can never see the full occupant roster, only
    their own record(s).
  - New `getMyShelterStatus` - `GET /api/shelters/me/status` - returns the
    logged-in user's own Assigned/CheckedIn occupant record(s) with the
    shelter populated, so the Citizen UI doesn't need to already know a
    shelter ID to show "your" shelter.
  - `updateOccupancy` now calls `assertShelterInScope` and rejects
    `capacity` changes from anyone below `FULL` scope - so a Volunteer can
    adjust the headcount at their assigned shelter but still cannot touch
    the shelter's total capacity (that stays Admin/Authority via
    `editShelter`).
- `routes/shelterRoutes.js`: added `GET /me/status` (fixed path, placed
  above the `/:id` param routes) wired to `getMyShelterStatus`, no new
  permission middleware needed (any authenticated user may check their own
  status).

**Frontend**
- `lib/shelterPermissions.js`: mirrored the `SELF` scope and the two
  updated rows to match the backend exactly.
- `lib/api.js`: added `api.shelters.myStatus(token)`.
- `DisasterManagementSystem.jsx`:
  - `SIDEBAR_NAV`'s `"shelters"` entry now lists all four roles
    (`citizen`, `authority`, `volunteer`, `admin`) under a shared label
    "Shelters" (Authority/Admin still get the full `SheltersView` manage
    console via their dashboard's `tab === "shelters"` branch - this only
    changed nav visibility, not which component renders for which role).
  - `CitizenDashboard`'s `tab === "shelters"` branch now renders a new
    **`CitizenSheltersTab`** component instead of the old dead read-only
    table: map + shelter list (unchanged) plus a real **"My Shelter
    Status"** card (fetches `api.shelters.myStatus`) with working **Check
    In** / **Check Out** buttons, and a **Report Problem** modal (category/
    severity/description) callable from either the status card or any row
    in the shelter list - both wired to the real
    `api.shelters.checkIn/checkOut/reportProblem` endpoints.

### Verified
- All four touched backend files pass `node --check` (syntax only).
- Same sandbox limitation as every prior phase: no network access, so
  `npm install`/`npm run dev` was never possible here - **none of this has
  been run against a live server**, only syntax-validated.

### Close-out — the piece flagged as still needed, now built
The last report flagged one remaining gap to finish Phase 11:
`VolunteerDashboard` had no `tab === "shelters"` branch at all, so a
Volunteer had no way to reach any of their real `ASSIGNED`-scope shelter
permissions.

**What I built**
- **`frontend/src/DisasterManagementSystem.jsx`** - new **`VolunteerShelterTab`**,
  wired into `VolunteerDashboard`'s `tab === "shelters"` branch (nav
  visibility was already in place from the earlier part of this phase, so no
  `SIDEBAR_NAV` change was needed here). Scoped to whichever single shelter
  the Volunteer is currently assigned to:
  - Fetches the assignment via `api.volunteers.me(token)`, then looks up the
    full shelter row (occupancy/capacity) from the already-loaded `shelters`
    list by `_id` - `assignedShelter` from `/volunteers/me` is only
    populated with `{ shelterId, name, location }`, not `currentOccupancy`,
    so the fuller adapted row already in app state is the right source for
    that instead of a second network round-trip.
  - **Update occupancy** - a headcount field + Save, calling
    `api.shelters.updateOccupancy` with only `currentOccupancy` (never
    `capacity`, which the backend already rejects from anyone below `FULL`
    scope).
  - **Check-in / check-out assist** - citizen user ID + optional notes,
    calling `api.shelters.checkIn` / `checkOut` directly (same shape as
    `ShelterManageModal`'s occupants tab, trimmed to the one shelter the
    Volunteer doesn't need to pick).
  - **Supplies** - the shelter's resource list via `api.shelters.getResources`,
    with the same inline -/+ `updateResource` quantity adjustment already
    used elsewhere (`ResourcesView`, `ShelterManageModal`).
  - **Report a Problem** - `api.shelters.reportProblem`, same form shape as
    the Citizen tab and `ShelterManageModal`.
  - Three states handled explicitly: loading, "not currently assigned to
    any shelter" (no assignment at all), and "assigned but that shelter's
    details didn't load" (assignment exists, lookup in `shelters` came up
    empty) - so it never renders half a form against a missing shelter.

### Verified
- Syntax-validated `DisasterManagementSystem.jsx` with `esbuild` - compiles
  cleanly, zero errors. No other file needed changes for this close-out (no
  `lib/api.js` or backend changes - every endpoint this tab uses already
  existed and was already exercised by the Citizen tab or
  `ShelterManageModal`).
- Same sandbox limitation as every phase before it: no network access, so
  `npm install`/`npm run dev` wasn't possible - **not run against a live
  backend/DB**, only syntax-validated.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. As a Volunteer with no shelter assignment: open Shelters → confirm the
   "not currently assigned" message, no forms rendered.
2. As Admin/Authority: assign that Volunteer to a shelter (Volunteers tab →
   Assign, or the Shelter Manage modal's Volunteers tab).
3. As that Volunteer: open Shelters again → confirm the assigned shelter's
   name, current headcount, supplies, and forms all appear.
4. Update the headcount → Save → confirm it persists (check as
   Admin/Authority in the Shelter Manage modal).
5. Check in a citizen by user ID, then check them out again - confirm both
   round-trip without error (a 404 on checkout with no active check-in is
   expected backend behavior, not a bug).
6. Adjust a supply's quantity with -/+ - confirm it persists.
7. Submit a problem report - confirm it shows up in the Shelter Manage
   modal's Problems tab for Admin/Authority.

### Still open, unrelated to what was just closed out
Not touched in this phase, and still fully absent anywhere in the codebase
(model, route, or UI): **Missing person report** and **Security
management**, both rows in the table pasted at the start of this phase.
These need a design pass (new Mongoose model + controller + routes, same
pattern as `ShelterProblem`) before they can be built - flag if you want
these prioritized next.

---

## ⏳ NOT STARTED YET — everything else in the PDF

Grouped by PDF section, in the order I'll tackle them unless you reorder me.
Each phase will touch roughly one module so no single change is huge.

### Phase 12 — extend AI Risk Engine visibility to Citizen/Volunteer
`aiRiskPermissions.js` gives Citizen and Volunteer restricted-but-real
access to several rows (viewRiskScore: AREA/ASSIGNED, viewRiskFactors:
BASIC, viewShelterRecommendations: FULL, viewEvacuationRecommendations:
FULL for Citizen, viewResourcePredictions/Shortages: ASSIGNED_SHELTER for
Volunteer, reportGroundConditions: FULL for both, receiveAiAlerts, etc.)
but there is no "AI Risk Engine" nav tab for those roles at all
(`SIDEBAR_NAV` only shows it to `["authority","admin"]`) so none of this
is reachable today. This needs a design decision on where it surfaces for
Citizen/Volunteer (a trimmed-down tab of their own vs. folding pieces
into the Overview/Satellite tabs they already have) before it can be
built.

### Also still open from Phase 1's own module (§3.3), lower priority
- Volunteer's "Upload Report" button on a task still only flips local state
  (`uploaded: true`) instead of calling a real endpoint — there's no backend
  field for "field report evidence" on a Task the way there is on a
  Disaster, so this needs a design decision (add a backend field, or repoint
  it at the disaster evidence endpoint) before I can wire it for real.
- Investigation notes, escalate/resolve/reopen, incident history/timeline,
  and incident audit logs (§3.3 #12, #19–23, #28) haven't been checked yet —
  need a pass to see what's already wired vs. still a stub.

---

## What I need from you
Nothing blocking. Four things worth knowing:
1. **Every phase, including this one, is syntax-checked only, never
   executed.** This whole project has never been run (`npm install` isn't
   possible in this sandbox — no network access), so *everything* through
   Phase 8, including Phases 1–4 marked "DONE," has only been validated
   with `esbuild`/`node --check`. Please run it for real before trusting
   any of it in production.
2. **Phase 6 is fully done** — 6a (Volunteers admin) gave Authority the
   same volunteer-management screen Admin has; 6b (NGO verification
   queue) gave both roles a full manage modal (verify/suspend/deactivate/
   delete for Admin, assign for both, edit/services for Admin or an
   assigned Authority, audit for both). A handful of lower-priority NGO
   extras (resources/volunteers roster, tasks, assistance requests,
   activity reports, ratings, performance, notify, reports) are still
   unbuilt — see the list at the end of the 6b section above.
3. **Phase 7 is done** — News went from a "type it and it's immediately
   published" box to the full Draft → Pending Approval → Approved →
   Published workflow, with assign/verify/schedule/emergency, media +
   source citations, disaster-update review, problem-report review, an
   audit trail, and an Admin-only category/source directory. Three small
   extras are still unbuilt — see the list at the end of the Phase 7
   section above (relatedDisaster picker, unscheduling, renaming
   categories/sources).
4. **Phase 8 is done** — the Live Risk Map went from a purely read-only,
   disaster-derived overlay to three real, backend-backed admin-manageable
   layers: Risk Zones (add/edit/delete/AI-override), Evacuation Routes
   (create/edit/delete/mark-evacuated), and Road Blocks
   (report/confirm/clear/delete) — all gated by the existing
   `mapPermissions.js` scope table per role. No backend changes were
   needed; it was entirely a frontend gap.
5. **Phase 9 is done** — the AI Risk Engine's five Admin-only
   configuration rows (risk thresholds, risk weights, disaster types,
   general AI settings, AI data sources) are real, backend-backed
   editors on the "AI Risk Engine" tab, visible to Admin only. No backend
   changes were needed; it was entirely a frontend gap.
6. **Phase 10 is now done** — the rest of the AI Risk Engine (everything
   that wasn't a Phase-9 settings row) is now real too: predictions
   (generate/approve/confirm/analyze-reports/record-outcome), AI
   accuracy, overall risk, per-zone risk scores, risk factors, affected
   areas, population at risk, shelter/evacuation recommendations,
   resource predictions/shortages, audit logs, and ground-condition
   reporting. `AIPanel` is now a 5-tab shell (Predictions/Insights/Ground
   Conditions/Audit Logs/Settings) instead of the old fake local
   `buildPredictions()` grid. No backend changes were needed.
7. **Phase 11 is now fully done** — Citizen and Volunteer both have real
   shelter self-service now: Citizen gets "My Shelter Status" with
   check-in/check-out and problem reporting; Volunteer gets a scoped
   "My Assigned Shelter" view (update headcount, check-in/check-out assist,
   supplies, report a problem). Two backend permission-table corrections
   (`citizenCheckInOut`, `manageCapacity`) and a `GET /shelters/me/status`
   endpoint were added along the way. Missing Person Report and Security
   Management are still fully unbuilt (flagged at the end of the Phase 11
   section above) if you want either prioritized next.
8. Say **"continue"** any time and I'll move on to Phase 12 (extending AI
   Risk Engine visibility to Citizen/Volunteer, who have real permission
   scopes for several rows but no nav tab to reach them from - see the
   Phase 10 section above for the design question that needs settling
   first). Say a specific phase number/name if you want me to jump order,
   or ask for one of the NGO/News/Map/Shelter extras listed above
   specifically.

---

## 🚧 IN PROGRESS — Phase 13: Volunteer Teams, Volunteer Records, Remove Role Switcher

Triggered by: "shelter record management + manual shelter creation for admin,
team creation system for volunteers where admin can assign a team, a
volunteer record system, make volunteer more functional, remove the role
switcher after login (make it role-specific)."

**This phase is not finished.** Below is exactly what's done, what's
verified, and what's still open, so nothing is assumed working that hasn't
been checked.

### What I checked first (before writing anything)
- Read every Shelter-related model/controller/route
  (`Shelter.js`, `ShelterOccupant.js`, `shelterController.js`,
  `shelterRoutes.js`, `shelterPermissions.js`) and the frontend
  `SheltersView`/`AddShelterModal`/`ShelterManageModal`.
  **Finding: shelter record management and manual shelter creation for
  Admin already exist** (built in earlier Phase 2/11 - see above in this
  file) - Admin can add a shelter directly (auto-approved), edit
  details/capacity/facilities, view occupant/supply/volunteer/problem
  records, and view a full audit trail. I did not change any shelter code
  this phase - didn't find a gap serious enough to justify touching working
  code without a specific bug report.
- Read `Volunteer.js`, `volunteerController.js`, `volunteerRoutes.js`,
  `Task.js`, `taskController.js`, and every place `api.volunteers.*` is
  called from the frontend.
  **Finding (the real bug): a user who signs up with role "Volunteer" gets
  a `User` account but the frontend never calls `POST /api/volunteers`
  to create their actual `Volunteer` profile.** `api.volunteers.register`
  existed in `lib/api.js` and was never called anywhere. This means every
  new volunteer was invisible to the admin/authority approval queue -
  arguably the single biggest reason "volunteer" felt non-functional.
  **Not yet fixed - see "Left to do" below.**
- Confirmed there was no Team concept anywhere in the codebase - no model,
  no controller, no route, no permissions file, no UI.
- Read `DisasterManagementSystem.jsx`'s top-level state and the
  `DashboardShell` header to find the role switcher.
  **Finding: `role` was a bare `useState("admin")` completely disconnected
  from the logged-in account** - the header's "Switch Role" dropdown let
  anyone flip between all four dashboards with one click, regardless of
  which account they'd logged in as. Also found a **separate bug**: on
  page refresh with a valid saved session, the app always dropped back to
  the public landing page instead of restoring the dashboard.

### What I built and verified this phase

**Backend - new Team feature (done, syntax-checked with `node --check`,
NOT run against a live DB):**
- `backend/src/models/Team.js` - new `Team` model: `teamId` (auto `TM-xxx`),
  `name`, `description`, `leader` (ref Volunteer), `members` (ref Volunteer[]),
  optional `assignedDisaster`/`assignedShelter`/`district`, `status`
  (Active/Disbanded), `createdBy`, `notes`.
- `backend/src/controllers/teamController.js` - `createTeam`, `getTeams`
  (Admin/Authority see all, Volunteer scoped to only their own team),
  `getMyTeams` (`GET /teams/me`), `getTeamById`, `updateTeam`, `addMembers`,
  `removeMember`, `deleteTeam`, `notifyTeam` (message every member).
  Membership is restricted to `status: "Approved"` volunteers only, mirroring
  the existing rule on `assignVolunteer`. Adding a member fires a
  notification via the existing `notify`/`notifyMany` utility.
- `backend/src/validators/teamValidators.js`, `backend/src/routes/teamRoutes.js`
  - `POST/GET /teams`, `GET /teams/me`, `GET/PUT/DELETE /teams/:id`,
  `POST /teams/:id/members`, `DELETE /teams/:id/members/:volunteerId`,
  `POST /teams/:id/notify`. Create/update/delete/member-management are
  Admin-only (matches "admin can assign a team for volunteers" from your
  request); Authority and Admin can view every team; Volunteer can view only
  a team they're a member of.
- Registered in `backend/src/app.js` (`app.use("/api/teams", teamRoutes)`).
- All five files pass `node --check`. **Not exercised against a running
  MongoDB - the actual create/query/populate round-trips are unverified.**

**Frontend - API client (done, syntax-checked with `esbuild`):**
- `frontend/src/lib/api.js` - added the full `api.teams.*` client
  (`list/mine/getById/create/update/remove/addMembers/removeMember/notify`)
  and `adapt.team()`. Extended `adapt.volunteer()` to also carry `userId`,
  `phone`, `skillsArray`, `notes`, `createdAt` (needed by the volunteer
  record view that isn't built yet - see below).

**Frontend - role switcher removal (done, syntax-checked with `esbuild`):**
- `role` is no longer its own `useState`. It's now derived directly from
  the logged-in account: `const role = currentUser ? (ROLE_TO_KEY[currentUser.role] || "citizen") : null`.
  There is no code path left anywhere that can set it to anything other
  than what the account actually is.
- Removed the entire "Switch Role" dropdown from `DashboardShell`'s header.
  It's replaced with a plain account menu: your name, email, role badge,
  and Log out - no role selector.
- Fixed the refresh bug found above: the app now checks
  `localStorage` for a saved token *and* user on first load and restores
  straight to the dashboard if both are present, instead of always
  starting at the landing page.
- Both changed files (`DisasterManagementSystem.jsx`, `lib/api.js`)
  compile cleanly via `esbuild` - zero errors.

### Left to do before this phase is actually complete
This is genuinely unfinished - please don't treat anything below as done:

1. **Fix the volunteer-registration gap found above.** `VolunteerDashboard`
   needs a "complete your volunteer profile" step (skills/district/
   availability form) that calls the already-existing
   `api.volunteers.register`, shown whenever `api.volunteers.me` 404s
   (meaning the logged-in Volunteer account has no profile yet). Without
   this, new volunteers still won't reach the approval queue no matter
   what else gets built. This is the highest-priority remaining item.
2. **Admin "Teams" screen** - nothing built yet. Needs: a sidebar nav entry,
   a list of teams, "Create Team" (name/description/pick a leader + members
   from Approved volunteers), a manage view (add/remove members, change
   leader, link a disaster/shelter, disband/delete, message the team) - all
   using the `api.teams.*` methods that already exist in `lib/api.js`.
3. **"My Team" view for volunteers** - nothing built yet. Needs a
   `VolunteerDashboard` tab showing the volunteer's own team (via
   `api.teams.mine`) - who's on it, who the leader is, what it's currently
   assigned to.
4. **Volunteer record system** - nothing built yet. Plan: extend the
   existing Admin `VolunteersView` table with a "View Record" action that
   opens a modal combining three already-existing endpoints (no new backend
   needed): the volunteer's profile (`getVolunteerById`), their task history
   (`GET /tasks?assignedTo=<userId>`, already supports this filter), and
   their team membership (once Team is queryable by volunteer).
5. **"Make volunteer more functional" - the rest of it.** Beyond the
   registration gap in #1, still want to look at: a volunteer "My Profile"
   tab (edit skills/district/availability via the already-existing
   `api.volunteers.updateMe`, never called anywhere in the UI either), and
   re-check whether the task accept/reject/complete flow in
   `VolunteerDashboard` needs anything beyond what already works.
6. **Nothing in this phase has been run against a live backend/DB or a real
   browser** - same sandbox limitation as every phase before it (no network
   access for `npm install`). Everything above is syntax-checked only.

### What's in the attached zip
Full project (`aapdasetu/`, `node_modules` excluded) as it stands right now
- the working Phase 1-12 features described earlier in this file, plus the
partial Phase 13 changes listed above (Team backend is complete and wired;
role switcher is removed; Teams/records UI and the volunteer-registration
fix are **not** in this zip yet).

---

## ✅ DONE — Phase 14: Closed out every "Left to do" item from Phase 13

All six items listed at the end of Phase 13 are now built. No backend
changes were needed this phase - every endpoint used below already existed
(`api.volunteers.register/updateMe`, `api.teams.*`, `api.tasks.list` with
`assignedTo`). This was purely a frontend phase.

### 1. Volunteer-registration gap (the highest-priority item) - fixed
`VolunteerDashboard` is now a thin wrapper (`frontend/src/
DisasterManagementSystem.jsx`) that calls `GET /api/volunteers/me` before
rendering any tab:
- **404 (no profile yet)** -> renders `VolunteerRegistrationForm` instead of
  the dashboard, for every tab. Skills (multi-select chips), district, and
  availability -> `POST /api/volunteers`. Once submitted, the account
  becomes visible in the Admin/Authority approval queue, closing the gap
  the Phase 13 investigation found.
- **200** -> renders the real dashboard (`VolunteerDashboardBody`, the old
  `VolunteerDashboard` body renamed) as before.
This was the blocking item - teams/records below all depend on a Volunteer
account actually having a profile to be added to.

### 2. Admin "Teams" screen - built
New `TeamsView` component, wired to the new sidebar entry **"Volunteer
Teams"** (visible to Authority + Admin, matching `teamRoutes.js`'s `GET`
access - Authority is read-only, gated client-side by `role === "Admin"`
since every mutation route is Admin-only server-side too):
- Table of all teams (leader, member count, district, status, assignment).
- **Create Team** (Admin) - `CreateTeamModal`: name/description/district,
  optional leader, multi-select members from Approved volunteers only
  (mirrors the backend's own Approved-only rule).
- **Manage** (Admin) - `TeamManageModal`: edit name/description/district/
  status (Active/Disbanded - "disband" is just a status change, matching
  the model), change leader, add/remove members, and a "Message the team"
  form (`POST /teams/:id/notify`). Authority opens the same modal read-only
  (no inputs/buttons rendered).
- **Delete** (Admin only, direct icon action with a confirm).

### 3. "My Team" view for Volunteers - built
New `MyTeamView` component, wired to a new Volunteer-only sidebar entry
**"My Team"** -> `GET /teams/me`. Shows the team(s) the volunteer belongs
to: description, status, leader, district, any linked disaster/shelter, and
the full member list as chips. Handles the empty state ("not on a team
yet") explicitly.

### 4. Volunteer record system - built
Admin/Authority's existing "Volunteers" table got a new **eye icon** ("View
record") action on every row -> `VolunteerRecordModal`. Combines three
already-existing endpoints into one read-only view, exactly as planned:
profile fields (from the row already in hand), **team membership**
(`GET /teams`, filtered client-side for this volunteer's `_id` - there's no
server-side "teams by volunteer" filter for an Admin/Authority caller, and
adding one wasn't necessary since the existing list is small enough to
filter in the browser), and **task history** (`GET /tasks?assignedTo=
<userId>`, using the `userId` `adapt.volunteer()` already carried since
Phase 13).

### 5. "Make volunteer more functional" - closed out
- New **"My Volunteer Profile"** sidebar tab -> `VolunteerProfileTab`,
  wired to the previously-unused `api.volunteers.updateMe` (`PUT
  /volunteers/me`). Volunteer can edit skills/district/availability anytime
  after registering, and sees their status (Pending/Approved/etc.) and
  current assignment on the same screen.
- Re-checked the task accept/reject/complete flow in
  `VolunteerDashboardBody` (unchanged from Phase 13/earlier) - it already
  calls `PATCH /tasks/:id/status` correctly for accept/decline/complete, so
  nothing there needed changing.

### 6. Verification
- Same sandbox limitation as every phase before it: no network access for
  `npm install`, so nothing was run against a live backend/DB or a real
  browser.
- The full, changed `frontend/src/DisasterManagementSystem.jsx` was
  syntax- and JSX-compiled with `esbuild` (`--jsx=automatic`) - **compiles
  cleanly, zero errors** (272.1kb output). No other files were touched this
  phase.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. Register a brand-new account as **Volunteer**, log in -> confirm you
   land on "Complete Your Volunteer Profile" instead of the dashboard, on
   every tab. Submit it -> confirm the dashboard unlocks.
2. As Admin/Authority -> Volunteers -> confirm the new volunteer now shows
   up Pending -> approve them.
3. As Admin -> new **Volunteer Teams** tab -> Create Team, add that
   volunteer as a member and/or leader -> confirm it saves, message the
   team, then remove the member and delete the team.
4. As Authority -> Volunteer Teams -> confirm you can see the list and open
   a team read-only, but there's no Create/Delete/edit controls.
5. As the Volunteer -> new **My Team** tab -> confirm the team you were
   added to (before removal in step 3) shows up correctly.
6. As the Volunteer -> new **My Volunteer Profile** tab -> change
   skills/district/availability -> Save -> confirm it persists (reload the
   page, or re-check as Admin in the Volunteers table).
7. As Admin/Authority -> Volunteers -> click the new eye "View record" icon
   on any volunteer -> confirm team membership and task history load
   correctly (assign that volunteer a task first via the existing task
   creation flow, then re-open the record to confirm it shows up).

### What's left, if you want to keep going
Everything from the original Phase 13 "Left to do" list is now built and
syntax-checked, so there's no specific open item queued. If you want more:
NGO/News/Map/Shelter extras mentioned in earlier phases, or exposing AI
Risk Engine visibility to Citizen/Volunteer (flagged back in an earlier
phase as needing a design decision first). Say what you want next.

---

## ✅ DONE — Phase 15: Real team assignment on incidents, shelter record from an incident, manual "Add Shelter" on the map

Triggered by: "assigned volunteer team to incident report action and add
shelter record, add a system for admin to add shelter in map manually, also
add a system for admin to remove risk zone from the map."

### What I checked first (before writing anything)
- Read `DisasterTable` (used by both Authority's and Admin's "All Disaster
  Reports" screens). **Found the real bug behind this request**: the
  "Assign Team" row action was `onClick={() => assignTeam(r.id, "Team Alpha")}`
  - a hardcoded string, always the same fake team, with no picker and no
  connection to the real `Team` model built in Phase 13/14. This is what
  "assign volunteer team to incident" was actually missing.
- Read `Shelter.js` - confirmed there's no `relatedDisaster`/incident-link
  field on a shelter record, so "add shelter record" (in the same sentence
  as the team-assignment request) reads as: give staff a quick way to log a
  shelter *in response to* an incident, from the incident row itself -
  not a new schema relationship.
- Read `SatelliteView.jsx` in full. **Confirmed risk-zone removal already
  works** - `RiskZoneModal` has a working "Delete risk zone" button wired
  to `api.riskZones.remove`, reachable by clicking a risk-zone marker →
  "Manage" (Admin only, matching `removeRiskZone: Authority: NONE` in
  `mapPermissions.js`). No gap found here - flagged to the user rather than
  rebuilding something that already works.
- Also confirmed in the same file: shelters were rendered read-only on the
  map, with **no way to add one directly from the map screen** - the only
  "Add Shelter" entry point anywhere in the app was the separate Shelters
  tab's form. This is the one genuinely missing piece of the four asks.

### What I built

**`frontend/src/DisasterManagementSystem.jsx`**
- `DisasterTable` - removed the fake "Assign Team Alpha" button. Added:
  - A **Team** column showing the incident's current `team` value (or
    "Unassigned").
  - A `Users`-icon **"Assign volunteer team"** action (same
    Verified/In-Progress-only visibility the old fake button had) that
    opens the new `AssignTeamModal`.
  - A `Home`-icon **"Add shelter record"** action (visible on every row)
    that opens the existing shelter-creation modal, pre-filled with that
    incident's location/coordinates.
- New **`AssignTeamModal`** - fetches real Active teams via `api.teams.list`,
  lets staff pick one, and on submit links it two ways using endpoints that
  already existed: `api.teams.update(id, { assignedDisaster })` (so the
  team's own record shows it's working this incident) and
  `api.disasters.updateStatus(id, { team: team.name, status: ... })` (so
  the incident table/citizen view still show the team name the way they
  always have - also auto-bumps a Pending report to Verified, matching the
  old button's behavior).
- `AddShelterModal` - added an `initial` prop (location/lat/lng) and a
  `title` prop. The form now re-seeds from `initial` every time the modal
  opens (`useEffect` keyed on `open`/`initial`) instead of only on first
  mount, so the same component works both for the plain Shelters-tab "Add
  Shelter" button (no prefill) and the new per-incident "Add shelter
  record" action (prefilled).
- Wired both new actions into **both** call sites - `AuthorityDashboard`'s
  and `AdminDashboard`'s "reports" tab - each getting its own
  `assignTeamTarget`/`addShelterTarget` state, its own `AssignTeamModal`,
  and its own pre-filled `AddShelterModal`. New shelters created this way
  are pushed into the same shared `shelters` state the Shelters tab and map
  already read from, so they show up everywhere immediately.
- All four `<SatelliteView>` call sites (Citizen/Authority/Volunteer/Admin)
  now pass `onShelterAdded={(s) => setShelters([s, ...shelters])}` (Citizen/
  Volunteer's is a no-op in practice since they have no `addShelter`
  permission and never see the button, but passing it costs nothing).

**`frontend/src/features/SatelliteView.jsx`**
- New **`AddShelterMapModal`** - name/location/lat/lng (required, unlike the
  Shelters-tab form where coordinates are optional - a shelter added *from
  the map* needs a map position)/capacity/contact, calling the same
  `api.shelters.create` the Shelters-tab form already uses, so it goes
  through the same approval rule (Admin auto-approved, Authority starts
  Pending).
- New **"Add Shelter"** button in the map's toolbar, next to the existing
  "Add Risk Zone"/"Add Route" buttons, gated by the existing
  `addShelter` scope from `lib/shelterPermissions.js` (Admin/Authority
  only - reused the existing permission table rather than inventing a new
  rule).
- `SatelliteView` now accepts an `onShelterAdded` callback prop, called
  after a successful create so the parent's shared `shelters` state (and
  therefore every other screen reading from it) updates without a refresh.

### Verified
- Same sandbox limitation as every phase before it: no network access, so
  `npm install`/`npm run dev` wasn't possible here.
- Both changed files compile cleanly via `esbuild --jsx=automatic` - zero
  errors (`DisasterManagementSystem.jsx` 277.7kb, `SatelliteView.jsx`
  51.2kb).
- No backend changes were needed or made this phase - every endpoint used
  (`api.teams.update`, `api.disasters.updateStatus`, `api.shelters.create`)
  already existed and was already exercised elsewhere in the app.
- Not run against a live backend/DB or a real browser - runtime behavior
  (the actual team-link/status round-trip, the map shelter-create
  round-trip, the pre-fill on open) is unverified.

### You should test before trusting this
```
cd frontend && npm install && npm run dev
```
1. As Admin, create a Volunteer Team first (Volunteer Teams tab) if none
   exist yet, with at least one Approved volunteer as a member.
2. As Authority or Admin → All Disaster Reports → on a Verified/In Progress
   row, click the new **Users icon** → confirm the team list loads → pick
   one → Assign → confirm the "Team" column updates and (as Admin) the
   team's `assignedDisaster` shows that incident under Volunteer Teams →
   Manage.
3. On the same row, click the new **Home icon** → confirm "Add Shelter
   Record - DR-xxxx" opens with the incident's location/coordinates
   pre-filled → fill in name/capacity → Save → confirm it appears in the
   Shelters tab and on the map.
4. As Authority or Admin → Satellite/Map tab → confirm a new **"Add
   Shelter" button** appears in the toolbar → add one with coordinates →
   confirm it appears as a shelter marker immediately, and also shows up
   on the Shelters tab.
5. As Citizen or Volunteer → Satellite/Map tab → confirm there's no "Add
   Shelter" button (matches `addShelter: NONE` for both roles).
6. Re-confirm risk-zone removal still works as before (this phase didn't
   touch it): click a risk-zone marker → Manage → Delete risk zone (Admin
   only - Authority sees Manage but no Delete button, per
   `removeRiskZone: Authority: NONE`).

### Not done / explicitly out of scope this phase
- Risk-zone removal was **not changed** - investigation found it already
  fully functional (see above); flagged to the user instead of touching
  working code.
- No backend schema change linking a `Shelter` to the `Disaster` it was
  opened for - "Add shelter record" was built as a pre-filled quick-create
  action, not a stored relationship. If you want the two records formally
  linked (e.g. so a shelter's card shows "opened for DR-1042"), that needs
  a small schema addition (`Shelter.relatedDisaster`) - flag if you want
  this next.
- Team assignment updates `disaster.team` (a plain display string) exactly
  the way the old fake button did - it does not change who can act on the
  incident (`assignedVolunteers`/`assignedAuthority` are separate fields,
  untouched here). If you want assigning a team to also grant its members
  incident-scoped permissions, that's a bigger change to
  `incidentPermissions.js` and `isIncidentInScope` - flag if wanted.

---

## ✅ DONE — Phase 16: Shelter ↔ Incident linking (`Shelter.relatedDisaster`)

### What this closes
Flagged as open at the end of Phase 15: "Add shelter record" from an
incident only pre-filled the create form with that incident's
location/coordinates — nothing stored the connection. This phase adds the
small schema addition that was flagged and wires it end to end.

### Backend
- **`Shelter` model**: new `relatedDisaster` field — `ObjectId` ref
  `Disaster`, `default: null`. Purely optional/informational; shelters
  created any other way just leave it null. Indexed (`{ relatedDisaster: 1 }`)
  since this mirrors how other models in the codebase (e.g. resources,
  contacts) already store their own `relatedDisaster` link.
- **`POST /api/shelters`** (`createShelter`) now accepts an optional
  `relatedDisaster` id in the body and stores it; the response is populated
  with `disasterId`/`type`/`location` so the client has a label to show
  immediately without a second fetch.
- **`GET /api/shelters`** and **`GET /api/shelters/:id`** now populate
  `relatedDisaster` the same way, so every shelter list/detail view can
  show the link without extra requests.
- No new route, no permission changes — this rides on the existing
  `addShelter` scope, same as before.

### Frontend
- `adapt.shelter` now exposes `relatedDisaster` as `{ _id, id, type,
  location }` when populated (or `null`), following the same shape used
  elsewhere in `api.js` for this kind of link.
- The "Add shelter record" action on an incident row (Authority + Admin)
  now passes that incident's `_id`/`disasterId` into `AddShelterModal` as
  `initial.disasterId` / `initial.disasterLabel`. The modal shows a blue
  "This shelter will be linked to incident DR-xxxx" note and sends
  `relatedDisaster` in the create payload when present. Shelters created
  from the Shelters tab or the map toolbar (no incident context) are
  unaffected — `relatedDisaster` is simply omitted.
- `ShelterManageModal`'s Details tab now shows a "Linked incident: DR-xxxx
  (Type)" banner when `shelter.relatedDisaster` is set.

### Verified
- `node --check` passes clean on both changed backend files
  (`models/Shelter.js`, `controllers/shelterController.js`).
- Brace/paren balance check on the changed frontend file after edits.
- **Not run against a live backend/DB or a real browser** — same sandbox
  limitation as every phase before it (no network access here for `npm
  install`).

### You should test before trusting this
```
cd backend && npm install && npm run seed && npm run dev
cd frontend && npm install && npm run dev
```
1. As Authority or Admin → All Disaster Reports → click the **Home icon**
   ("Add shelter record") on a row → confirm the modal shows the blue
   "will be linked to incident DR-xxxx" note → fill in name/capacity →
   Save.
2. Open that shelter from the Shelters tab (Manage) → Details tab → confirm
   a "Linked incident: DR-xxxx (Type)" banner appears.
3. Confirm a shelter added from the Shelters tab's own "Add Shelter"
   button, or from the map toolbar's "Add Shelter" button, shows **no**
   linked-incident banner (no `relatedDisaster` was sent for those).
4. `GET /api/shelters/:id` for a linked shelter → confirm
   `relatedDisaster` comes back populated with `disasterId`/`type`/
   `location`, not just a raw id.

### Not done / explicitly out of scope this phase
- No reverse UI on the incident side (e.g. a disaster row showing "shelter
  opened: SH-501") — only the shelter record links back to the incident,
  matching what was asked for. Flag if you also want that shown on
  incidents.
- The other two Phase 15 flags are still open and untouched:
  - Team assignment still only updates `disaster.team` (display string),
    doesn't grant `assignedVolunteers`/`assignedAuthority` permissions —
    needs `incidentPermissions.js` changes if wanted.
  - AI Risk Engine still has no nav tab reachable by Citizen/Volunteer.
