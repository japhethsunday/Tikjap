-- Source files for the Code workspace. A file belongs to a project, and its
-- path is unique within that project, so the tree is derived from the paths
-- rather than stored as nested rows.
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  content text not null default '',
  language text,
  size_bytes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);

create index if not exists project_files_project_idx
  on public.project_files (project_id, path);

alter table public.project_files enable row level security;

drop policy if exists project_files_own on public.project_files;
create policy project_files_own on public.project_files
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.project_files from anon;
