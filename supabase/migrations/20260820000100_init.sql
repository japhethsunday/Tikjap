-- Tikjap AI — initial schema
-- All data access goes through the server's service role key (bypasses RLS),
-- so tables are locked down with no public policies.

create extension if not exists "pgcrypto";

-- Profiles: 1:1 with auth.users; also stores per-user AI preferences.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  default_model_id text,
  temperature double precision not null default 0.7,
  markdown boolean not null default true,
  show_timestamps boolean not null default true,
  streaming_enabled boolean not null default true
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  model text not null default 'tikja-1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_idx on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  status text not null default 'streaming' check (status in ('streaming', 'complete', 'error', 'stopped')),
  model text,
  attachments jsonb,
  usage jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  size bigint not null,
  mime_type text not null default 'application/octet-stream',
  kind text not null default 'other',
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists files_user_idx on public.files (user_id);

create table if not exists public.day_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  messages integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);

create table if not exists public.request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id text not null,
  ok boolean not null default true,
  tokens bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists request_logs_user_idx on public.request_logs (user_id, created_at desc);

-- Atomic per-day usage increment.
create or replace function public.increment_usage(
  p_user_id uuid,
  p_day date,
  p_messages integer,
  p_input bigint,
  p_output bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.day_usage (user_id, day, messages, input_tokens, output_tokens)
  values (p_user_id, p_day, p_messages, p_input, p_output)
  on conflict (user_id, day)
  do update set
    messages = public.day_usage.messages + excluded.messages,
    input_tokens = public.day_usage.input_tokens + excluded.input_tokens,
    output_tokens = public.day_usage.output_tokens + excluded.output_tokens;
end;
$$;

-- Private storage bucket for uploads (accessed server-side only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 10485760, null)
on conflict (id) do nothing;

-- Lock all tables down: only the service role (which bypasses RLS) can touch them.
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;
alter table public.day_usage enable row level security;
alter table public.request_logs enable row level security;

-- Auto-create a profile row whenever a user signs up or is created by an admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'user')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();