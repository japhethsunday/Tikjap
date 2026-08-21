-- Tikjap platform upgrade: projects, pins/archive, memory, assistants,
-- saved prompts, and subscription plan state.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '',
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_projects_user on projects(user_id, updated_at desc);

alter table conversations
  add column if not exists project_id uuid references projects(id) on delete set null,
  add column if not exists pinned boolean not null default false,
  add column if not exists archived boolean not null default false;
create index if not exists idx_conversations_project on conversations(project_id);
create index if not exists idx_conversations_user_updated on conversations(user_id, updated_at desc);

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists idx_memories_user on memories(user_id, created_at desc);

create table if not exists assistants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  instructions text not null default '',
  model text not null default 'tikja-1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_assistants_user on assistants(user_id, updated_at desc);

create table if not exists saved_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists idx_saved_prompts_user on saved_prompts(user_id, created_at desc);

alter table profiles
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'pro', 'team'));
