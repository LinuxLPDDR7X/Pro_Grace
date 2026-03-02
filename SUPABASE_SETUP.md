# Pro Grace: Vercel + Supabase Setup

## 1) Create Supabase table

Run this in Supabase SQL Editor:

```sql
create table if not exists public.prograce_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.prograce_state enable row level security;

drop policy if exists "prograce_anon_rw" on public.prograce_state;
create policy "prograce_anon_rw"
on public.prograce_state
for all
to anon
using (true)
with check (true);

insert into public.prograce_state (id, payload)
values ('primary', '{}'::jsonb)
on conflict (id) do nothing;
```

## 2) Copy project API values

From Supabase Project Settings -> API, copy:

- Project URL
- Project anon key

## 3) Fill `config.js`

Edit `config.js`:

```js
window.PRO_GRACE_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
  supabaseTable: "prograce_state",
  supabaseRowId: "primary",
};
```

## 4) Deploy to Vercel

- Import the GitHub repo in Vercel.
- Framework preset: `Other`.
- Build command: leave empty.
- Output directory: leave empty.
- Deploy.

## 5) Verify

- Open the app URL.
- Open browser console and check:
  - `[Pro Grace] Persistence mode: supabase`
- Use app on another device and confirm same progress appears after refresh.

## Notes

- If Supabase config is empty/invalid, app falls back to local browser storage.
- This setup allows anon read/write for simplicity. Add auth policies later if you want strict access control.
