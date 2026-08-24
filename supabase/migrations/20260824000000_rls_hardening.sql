-- Tikjap AI — row level security hardening
--
-- Background: the server talks to Postgres with the service role key, which
-- bypasses RLS entirely. That made RLS look unnecessary, so the tables added in
-- the platform_upgrade and wave2 migrations shipped with RLS switched off. But
-- the same project also hands the anon key to every browser, and PostgREST
-- happily serves any table that has RLS disabled. Every row in projects,
-- memories, assistants, saved_prompts, project_sources, audit_log, schedules,
-- conversation_shares and message_feedback was readable and writable by anyone
-- who opened devtools and copied the anon key.
--
-- This migration enables RLS everywhere and adds owner-scoped policies. The
-- server keeps using the service role, so its behaviour is unchanged; the anon
-- and authenticated roles are now confined to rows they own.

-- ---------------------------------------------------------------------------
-- Enable RLS on every public table (idempotent).
-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.conversations        enable row level security;
alter table public.messages             enable row level security;
alter table public.files                enable row level security;
alter table public.day_usage            enable row level security;
alter table public.request_logs         enable row level security;
alter table public.projects             enable row level security;
alter table public.project_sources      enable row level security;
alter table public.memories             enable row level security;
alter table public.assistants           enable row level security;
alter table public.saved_prompts        enable row level security;
alter table public.audit_log            enable row level security;
alter table public.schedules            enable row level security;
alter table public.conversation_shares  enable row level security;
alter table public.message_feedback     enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles — a user may read and update only their own profile. `role` and
-- `plan` are privilege-bearing columns, so updates are additionally guarded by
-- a trigger below rather than left to the policy alone.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Block self-service privilege escalation: a user editing their own profile
-- row through PostgREST must not be able to grant themselves admin or a paid
-- plan. Service-role writes bypass RLS but still run triggers, so the trigger
-- explicitly allows them through.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('role', true) = 'service_role'
     or current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;
  new.role := old.role;
  new.plan := old.plan;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- Conversations — full ownership by user_id.
-- ---------------------------------------------------------------------------
drop policy if exists conversations_own on public.conversations;
create policy conversations_own on public.conversations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Messages — ownership is indirect, through the parent conversation.
-- ---------------------------------------------------------------------------
drop policy if exists messages_own on public.messages;
create policy messages_own on public.messages
  for all to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Tables keyed directly on user_id.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'files',
    'projects',
    'project_sources',
    'memories',
    'assistants',
    'saved_prompts',
    'schedules',
    'message_feedback',
    'conversation_shares'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
    $f$, t || '_own', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read-only ledgers. These are written by the server under the service role;
-- users may read their own rows but never forge them.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['day_usage', 'request_logs', 'audit_log']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (user_id = (select auth.uid()))
    $f$, t || '_select_own', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER functions must not be callable from the public API.
--
-- `increment_usage` takes p_user_id as an argument and runs as its owner, so
-- any anon caller could inflate or corrupt usage counters for an arbitrary
-- user. `handle_new_user` is an auth trigger and has no business being an RPC.
-- ---------------------------------------------------------------------------
revoke all on function public.increment_usage(uuid, date, integer, bigint, bigint)
  from anon, authenticated, public;

revoke all on function public.handle_new_user() from anon, authenticated, public;

-- Pin search_path on both so a caller-controlled search_path cannot redirect
-- the unqualified references inside a definer-rights function.
alter function public.increment_usage(uuid, date, integer, bigint, bigint)
  set search_path = '';
alter function public.handle_new_user() set search_path = '';

-- ---------------------------------------------------------------------------
-- Belt and braces: the anon role never needs table access at all. Signed-out
-- visitors read nothing but the marketing page, and every authenticated read
-- the app performs goes through the server.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
