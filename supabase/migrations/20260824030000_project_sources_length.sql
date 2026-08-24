-- listProjectSources asked PostgREST for `length(content)`. PostgREST has no
-- SQL functions in `select` — it reads `length(content)` as an embedded
-- resource named "length" and fails with "Could not find a relationship
-- between 'project_sources' and 'length'", so listing a project's sources
-- returned a 500 every time.
--
-- A stored generated column gives the same number without transferring every
-- source's full text just to count its characters.
alter table public.project_sources
  add column if not exists content_length integer
  generated always as (length(content)) stored;
