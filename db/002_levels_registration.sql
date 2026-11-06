-- Teacher self-registration: class levels (sections) and registration settings.
alter table classes add column if not exists section text;
alter table classes drop constraint if exists classes_section_check;
alter table classes add constraint classes_section_check check (section is null or section in ('lower_primary','upper_primary','jhs'));

-- Backfill from the class name or level (BASIC 1-3 lower primary, 4-6 upper primary, 7-9 JHS).
update classes set section = case
  when lower(coalesce(level,'') || ' ' || name) ~ '(jhs|junior)' then 'jhs'
  when lower(coalesce(level,'') || ' ' || name) ~ 'upper' then 'upper_primary'
  when lower(coalesce(level,'') || ' ' || name) ~ 'lower' then 'lower_primary'
  when (regexp_match(name, '(\d+)'))[1] is not null and (regexp_match(name, '(\d+)'))[1]::int between 1 and 3 then 'lower_primary'
  when (regexp_match(name, '(\d+)'))[1] is not null and (regexp_match(name, '(\d+)'))[1]::int between 4 and 6 then 'upper_primary'
  when (regexp_match(name, '(\d+)'))[1] is not null and (regexp_match(name, '(\d+)'))[1]::int between 7 and 9 then 'jhs'
  else null end
where section is null;

create index if not exists classes_section_idx on classes (academic_year_id, section) where status = 'active';

insert into system_settings (key, value) values
  ('registration_open', 'true'),
  ('registration_code', to_jsonb(upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))))
on conflict do nothing;
