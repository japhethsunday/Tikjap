-- Tikjap platform upgrade wave 2: organization, sharing, knowledge,
-- feedback, scheduling, and analytics foundations.

-- ---------------------------------------------------------------------------
-- Conversations: tags, colors, ordering, incognito, summary
-- ---------------------------------------------------------------------------
alter table conversations
  add column if not exists tags text[] not null default '{}',
  add column if not exists sort_order integer not null default 0,
  add column if not exists color text not null default '',
  add column if not exists incognito boolean not null default false,
  add column if not exists summary text not null default '';
create index if not exists idx_conversations_sort on conversations(user_id, sort_order asc);

-- ---------------------------------------------------------------------------
-- Messages: branching-free bookmarks + generation stats + full-text search
-- ---------------------------------------------------------------------------
alter table messages
  add column if not exists bookmarked boolean not null default false,
  add column if not exists latency_ms integer;

alter table messages add column if not exists content_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;
create index if not exists idx_messages_tsv on messages using gin(content_tsv);
create index if not exists idx_messages_bookmark on messages(conversation_id, bookmarked)
  where bookmarked = true;

-- ---------------------------------------------------------------------------
-- Projects: presentation + knowledge settings
-- ---------------------------------------------------------------------------
alter table projects
  add column if not exists icon text not null default 'folder',
  add column if not exists archived boolean not null default false,
  add column if not exists default_model_id text,
  add column if not exists memory_enabled boolean not null default true,
  add column if not exists notes text not null default '';

-- Project knowledge sources (pasted text or fetched URLs; text-like uploads)
create table if not exists project_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text,
  content text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_project_sources_project on project_sources(project_id);

-- Project activity feed
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_project on audit_log(project_id, created_at desc);
create index if not exists idx_audit_user on audit_log(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Memories: priority, scoping, approval workflow
-- ---------------------------------------------------------------------------
alter table memories
  add column if not exists priority integer not null default 1,
  add column if not exists project_id uuid references projects(id) on delete cascade,
  add column if not exists status text not null default 'approved',
  add column if not exists source text not null default 'manual';
create index if not exists idx_memories_status on memories(user_id, status);

-- ---------------------------------------------------------------------------
-- Assistants & prompts: personality, sharing, analytics
-- ---------------------------------------------------------------------------
alter table assistants
  add column if not exists avatar text not null default 'bot',
  add column if not exists starters jsonb not null default '[]'::jsonb,
  add column if not exists share_token uuid unique default gen_random_uuid(),
  add column if not exists versions jsonb not null default '[]'::jsonb,
  add column if not exists runs integer not null default 0;

alter table saved_prompts
  add column if not exists category text not null default '',
  add column if not exists tags text[] not null default '{}',
  add column if not exists runs integer not null default 0;

-- Scheduled prompt runs (processed by /api/cron/tick)
create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_id uuid references saved_prompts(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  model_id text not null default '',
  cadence text not null check (cadence in ('daily', 'weekly', 'weekdays')),
  next_run timestamptz not null,
  last_run timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_schedules_due on schedules(active, next_run);

-- ---------------------------------------------------------------------------
-- Sharing conversations (public read-only links)
-- ---------------------------------------------------------------------------
create table if not exists conversation_shares (
  token uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  password_hash text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_shares_conversation on conversation_shares(conversation_id);

-- Message feedback (thumbs up/down with optional reason)
create table if not exists message_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  reason text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists idx_feedback_one_per_user
  on message_feedback(message_id, user_id);
