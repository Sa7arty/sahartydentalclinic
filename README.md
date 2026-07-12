# Saharty Dental Clinic — Staff Portal (v1 scaffold)

Internal, staff-only patient management app. No patient accounts, no payment
processing — the ledger is bookkeeping only (charges/payments you record
yourself; nothing touches card data).

Built with: Vite + React + TypeScript + Tailwind + Supabase (Postgres, Auth, Storage).

## What's already built

- Staff login (email/password, no self-signup)
- Role-based access: `dentist` (everything) vs `front_desk` (scheduling +
  patient info + ledger, no clinical notes/photos)
- Multi-location support (Saharty seeded; add Sheikh Zayed whenever it opens)
- Dashboard: today's appointments + patients with outstanding balances
- Patients: list, search, create, detail page with tabs (info, visits,
  clinical notes, photos, ledger)
- Clinical notes are append-only — no edit/delete, full history preserved
- Photo upload to a private Supabase storage bucket
- Ledger: add charge / add payment, running balance per patient
- Simple day-by-day schedule view, filterable by location
- Full Postgres RLS policies enforcing all of the above at the database
  level — not just hidden in the UI

## What's NOT built yet (intentionally left for you + Claude Code)

- Signed URLs to actually render photo thumbnails (storage_path is saved,
  just needs the fetch wired up)
- An admin UI for creating staff accounts / assigning roles + locations
  (for now this is done directly in the Supabase dashboard — see below)
- A real calendar view (current schedule page is a day-list, not a grid)
- Editing/cancelling visits
- Exporting ledger/balance reports

## Setup (one-time)

1. **Create a free Supabase project** at supabase.com/dashboard — pick a
   region close to Egypt (e.g. eu-central or similar).
2. In the Supabase dashboard, open the **SQL Editor** and run the entire
   contents of `supabase/schema.sql`. This creates every table, the roles
   enum, RLS policies, and the private photo storage bucket.
3. Copy `.env.example` to `.env` and fill in your project's URL and anon key
   (Project Settings → API).
4. Install dependencies and run locally:
   ```
   npm install
   npm run dev
   ```
5. **Create your first staff account:** Supabase dashboard → Authentication
   → Users → Add user (invite by email, or set a password directly).
6. **Give that user the dentist role and location access** — in the SQL
   Editor:
   ```sql
   insert into public.user_roles (user_id, role)
   values ('<the-user-id-from-step-5>', 'dentist');

   insert into public.staff_locations (user_id, location_id)
   select '<the-user-id>', id from public.locations
   where name = 'Saharty Dental Clinic';
   ```
7. Log in at the app with that account. You now have full dentist access.

## Adding the Sheikh Zayed branch later

```sql
insert into public.locations (name, address)
values ('Sheikh Zayed Branch', '<address once known>');
```
Then assign staff to it via `staff_locations` the same way as above.

## Continuing in Claude Code

This folder is a normal Vite project — open it directly in Claude Code and
keep building. Good next prompts:
- "Wire up signed URLs so uploaded photos actually render as thumbnails"
- "Build an admin page for creating staff accounts and assigning roles/locations"
- "Replace the day-list schedule view with a proper week calendar grid"
- "Deploy this to Vercel/Netlify and set the env vars there"
