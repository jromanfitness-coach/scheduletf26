# Tifton Fitness Scheduling Portal — v29

## What changed
- **Shared server state:** schedules, class types, coaches, availability, clients, bookings, and client requests are stored in Netlify Blobs through a server-side API — not in browser `localStorage`.
- **Automatic server snapshots:** every coach save and client booking request preserves the prior state as a server backup. The portal keeps the latest 30 snapshots.
- **Full export/restore:** Coach view has **Backups** for downloading a portable JSON backup, restoring a JSON file, or restoring a server snapshot.
- **Live company views:**
  - `/live` — client request-only schedule. Clients can request an existing class or any green available time.
  - `/gym` — one-day Gym View for staff/company visibility. Shows active coaches/managers and their schedule without client details.
- **No email, broadcast, Outlook, notification, or reminder code** in this release.
- **Class Type panel:** coach class types use a clean stacked-card layout with minimal pencil controls.
- **Session Client Portal:** editing a saved session now includes **+ Add Client**. It opens a polished client-picker portal with search, package filters, live capacity, saved client cards, and smooth Add Client controls. Existing bookings show as Added and capacity limits are enforced.

## Deployment
1. Upload this folder to GitHub and connect the repository in Netlify.
2. Keep the build command blank and publish directory as `.`.
3. In Netlify **Project configuration → Environment variables**, add:
   - `COACH_PIN` = `1307!`
   - `SCHEDULER_AUTH_SECRET` = a long random private value, ideally 32+ characters.
4. Deploy. Netlify installs `@netlify/blobs` from `package.json`.
5. Coach login: `https://YOUR-SITE.netlify.app/`
6. Client request feed: `https://YOUR-SITE.netlify.app/live`
7. Company Gym View: `https://YOUR-SITE.netlify.app/gym`

## Upgrade note
On the first Coach/Admin login from the same browser used for v21, v23 detects the legacy `tf_scheduler_v5` browser cache and imports its sessions, class types, coaches, availability, clients, and compatible bookings into shared server storage. Immediately open **Backups** and download a full JSON backup after that import.

## Security boundary
- The PIN is validated in the Netlify Function, not in browser JavaScript.
- Coach sessions are signed, server-verified, and expire after 12 hours.
- Login attempts are rate-limited after repeated failures.
- The public endpoints only return the public schedule; they do **not** expose clients, phone numbers, email addresses, charge dates, notes, bookings, or pending request details.
- Do not commit `COACH_PIN` or `SCHEDULER_AUTH_SECRET` to GitHub.

## Reliability note
This release makes the portal shared, server-persisted, backed up, and conflict-aware. Netlify Blobs remains a key/value store; a future Supabase migration is the right next step when you need transactional database guarantees, granular staff accounts, audit logs, and true push realtime.


## v24 server reliability fix

v24 fixes the Netlify Blobs initialization path used by the Lambda-compatible Function. The server now calls `connectLambda(event)` before opening the Blob store and uses strong reads for the shared scheduling state, so the coach login, live feed, and Gym View can reliably reach the same server-backed data. A `?scope=health` endpoint is included for a quick deployment check.


## v24 deployment check
After deploying, open this URL once in your browser:

`https://YOUR-SITE.netlify.app/.netlify/functions/scheduler-api?scope=health`

A successful response is JSON containing `"ok": true` and `"storage": "connected"`. Then return to the site root and sign in with your Coach/Admin PIN. No Supabase setup or separate Blobs setup is required.


## v26 deployment repair
This release moves `scheduler-api` to Netlify’s modern Request/Response function API. It no longer uses legacy Lambda compatibility or `connectLambda`; Netlify injects the Blobs context automatically.

Deploy via GitHub-connected Netlify, keep the project root exactly as packaged, set `COACH_PIN` and `SCHEDULER_AUTH_SECRET`, then use **Clear cache and deploy site**. Visit `/.netlify/functions/scheduler-api?scope=health` afterwards.


## v27 session client picker
When editing an existing session, select **+ Add Client** in the Booked Clients panel. The Client Portal uses the shared private client records, respects the session capacity, and writes the approved booking into the same server-backed schedule state. No server, Netlify Blobs, or environment-variable changes are required for this update.

## v28 Reporting & Excel exports
- Added a **Reports** button in the Coach workspace.
- Select a date range, coach/manager, and optional canceled-session inclusion before export.
- **Training Sessions Workbook (.xlsx)** is the primary operational export. It includes: Report Overview, Session Register, Attendance Detail, Coach Payroll, Client Attendance, and Class Type Summary.
- Additional exports: Coach Payroll Summary, Attendance Register, and portable JSON report data.
- Booked clients now have an attendance marker in the Session Editor: Unmarked, Present, Late, Absent, or Excused.
- Under **Coaches & Managers**, set each staff member’s pay rate per hour. The payroll workbook calculates estimated payroll as scheduled hours × stored rate.
- Excel files are generated locally in the browser from the already server-synced schedule state. The exporter loads the ExcelJS browser bundle only when you click an Excel export button; no Netlify environment-variable or server setup changes are required.


## v29 updates
- Hover a coach session for a compact session inspector.
- Select multiple clients in the Client Portal, then add them all at once.
