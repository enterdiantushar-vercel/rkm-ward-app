-- Run once in Supabase: SQL Editor > New query > paste > Run
create table if not exists public.ipd_progress_notes (
  id bigint generated always as identity primary key,
  mrd text not null,
  patient_name text,
  ward text,
  bed_no text,
  subjective text,
  objective text,
  assessment text,
  plan text,
  author_email text,
  created_at timestamptz not null default now()
);
create index if not exists ipd_notes_mrd_idx on public.ipd_progress_notes (mrd, created_at desc);
alter table public.ipd_progress_notes enable row level security;
drop policy if exists "staff read notes" on public.ipd_progress_notes;
drop policy if exists "staff insert notes" on public.ipd_progress_notes;
create policy "staff read notes" on public.ipd_progress_notes for select to authenticated using (true);
create policy "staff insert notes" on public.ipd_progress_notes for insert to authenticated with check (true);
