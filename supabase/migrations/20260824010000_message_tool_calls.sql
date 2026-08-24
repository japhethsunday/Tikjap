-- Persist tool activity alongside the assistant message that produced it, so a
-- reloaded conversation still shows which tools ran, what they returned and how
-- long they took — rather than the activity vanishing when the stream ends.
alter table public.messages
  add column if not exists tool_calls jsonb;

comment on column public.messages.tool_calls is
  'Array of {id, toolId, ok, data, sources, durationMs} recorded by the orchestrator.';
