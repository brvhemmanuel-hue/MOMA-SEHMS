# MOMA-SEHMS
Mount Olivet Methodist Academy School Exercise & Homework Monitoring System.
Next.js 14 (App Router, TypeScript) on Vercel, Vercel serverless functions, Neon PostgreSQL. Installable PWA.

Teacher-managed monitoring only. Students have no accounts. There is no marks, score, grade, HOD, class-teacher, follow-up or attachment feature anywhere (code, tables, reports).

## 1. Deploy in 15 minutes

1. **Neon**: create a project. Copy the *pooled* connection string (host contains `-pooler`). Create a `dev` branch for testing.
2. **Run migrations and create the first administrator** (from your computer):
   ```bash
   npm install
   export DATABASE_URL='postgresql://...-pooler...neon.tech/neondb?sslmode=require'
   npm run db:migrate
   ADMIN_EMAIL=head@yourschool.edu.gh ADMIN_NAME='School Administrator' ADMIN_PASSWORD='Choose-Strong-1' npm run db:setup-admin
   ```
3. **Vercel**: push this folder to GitHub, import it in Vercel, and set environment variables:
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled string (use your `dev` branch for Preview) |
   | `AUTH_SECRET` | `openssl rand -base64 48` |
   | `CRON_SECRET` | any long random string (Vercel Cron sends it automatically) |
4. Deploy, add your custom domain (HTTPS is required for PWA).
5. Sign in as the administrator. You must change the password first.
6. **Setup order** (Import Centre enforces it): Years, terms, departments (optional) > Classes > Subjects > Teachers > Students > External Admin > Teacher assignments. Download the template from Import Centre; `samples/School_Data_Import_Samples_DEMO.xlsx` shows filled examples.

`npm run db:seed` loads clearly marked **demonstration data** (never run in production). Demo logins use password `Demo@12345`.

**Cron**: `vercel.json` schedules `/api/cron/daily` once a day, which fits the free Hobby plan. On Pro you may use a more frequent schedule. Correctness never depends on the cron: on-time/late is decided when a submission is recorded, and the final snapshot is also created lazily on the first read after a deadline.

## 2. How the rules are implemented
- **Roles**: `school_admin`, `external_admin` (read-only everywhere), `teacher`. Every server action and route re-checks role and, for teachers, the active teacher assignment for that class and subject (`lib/rbac.ts`).
- **Generated IDs**: `T-0001`, `S-2026-0001`, `CLS-0001`, `SUB-0001` come from `id_counters` via an auto-committed upsert (`lib/ids.ts`). Never typed or imported; unique and never reused (a rolled-back create leaves a gap, never a duplicate).
- **Expected students**: captured into `assignment_expected_students` when an assignment is created. Class changes close the old membership and open a new one; existing assignments are untouched.
- **Live progress vs final figures**: live = submitted so far / expected. On time or late is classified at the moment of recording against the deadline in force. The final snapshot (`assignment_final_snapshots`) counts timestamps at or before the deadline, is idempotent (unique per assignment and deadline), and later submissions never change it.
- **Deadline extension** (admin only): keeps the original deadline, writes history with reason, preserves the old snapshot first, reclassifies on-time/late against the new deadline, and later creates a separately labelled snapshot.
- **Auth**: bcrypt hashes, httpOnly SameSite cookie with signed token, validated against the database on every request (deactivation, reset and password change revoke sessions instantly), DB-backed login rate limiting, temporary passwords shown once and expiring.
- **Imports**: parse, validate (dry run), preview, then confirm. Headers must match exactly. ID and password columns are flagged and dropped. Matching on natural keys; student duplicates are never merged silently. Commit is all-or-nothing (single transaction) or skip-invalid (chunked, savepoints). Credentials are returned once to the browser, never stored.
- **Reports**: 15 reports, each with the mandatory header, role scoping on the server, separate on-time / late / cumulative columns, and PDF / Excel / CSV export with formula-injection protection. Large reports (above the configured threshold) run as `report_runs` jobs stored privately in the database with an expiry.
- **PWA**: manifest, icons (192, 512, maskable, Apple touch), service worker caching the shell and static files only (no API or student data), offline page, update prompt.

## 3. Packaging as a mobile app (PWABuilder)
1. Deploy to the final HTTPS domain and run Lighthouse (PWA) and https://www.pwabuilder.com/ validation.
2. Generate the Android package (Trusted Web Activity). Keep the signing key safe and backed up: losing it means you cannot update the app.
3. Copy `public/.well-known/assetlinks.json.example` to `assetlinks.json` and insert the SHA-256 fingerprint PWABuilder gives you, then redeploy.
4. Add 1080x1920 and 1920x1080 screenshots to `src/app/manifest.ts` before store listing; prepare a privacy policy and data-handling statement.

## 4. Known limits and next steps (be aware before go-live)
- **Not yet verified on a live Vercel + Neon deployment.** The schema, import engine, snapshots, every report and all exports were tested against PostgreSQL (PGlite) with 48 automated checks, and the production build compiles. UI flows (register, forms) were type-checked and built but not click-tested in a browser; do a walkthrough on a Preview deployment first.
- No automated browser or unit test suite is included in the repository (the checks above were run from a temporary harness).
- Offline register entry and Web Push are the optional later phases in the SRS and are not built. In-app notifications are.
- Reports on screen show the first 500 rows; exports contain everything. PDF charts are drawn for the School summary only.
- Large imports: all-or-nothing is limited to 1,000 rows per run; use skip-invalid for larger files (chunked).
- Report generation for large files happens when the requester polls (serverless has no background worker), and the daily cron sweeps leftovers.

## 5. Layout
```
db/001_init.sql            schema (PostgreSQL)
scripts/                   migrate, create first admin, demo seed
src/lib/                   db, auth, rbac, ids, snapshot, imports, reports, exporters, maintenance
src/app/actions/           server actions (auth, admin, work)
src/app/(app)/             authenticated pages
src/app/api/               imports, exports, reports, templates, cron
public/                    logo, login background, icons, service worker, offline page
```
