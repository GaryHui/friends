create table if not exists companion_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'user',
  source_type text not null default 'curated_note',
  lesson_type text not null default 'empathy',
  title text not null,
  principle text not null,
  do_example text,
  avoid_example text,
  risk_note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table companion_lessons enable row level security;

drop policy if exists "companion_lessons_select_own" on companion_lessons;
create policy "companion_lessons_select_own"
on companion_lessons for select
using (auth.uid() = user_id);

create index if not exists companion_lessons_user_status_created_idx
on companion_lessons (user_id, status, created_at desc);
