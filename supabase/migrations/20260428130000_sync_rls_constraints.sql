alter table if exists public.sync_records enable row level security;
alter table if exists public.sync_mutations enable row level security;
alter table if exists public.sync_users enable row level security;

drop policy if exists sync_records_user_isolation on public.sync_records;
create policy sync_records_user_isolation
on public.sync_records
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists sync_mutations_user_isolation on public.sync_mutations;
create policy sync_mutations_user_isolation
on public.sync_mutations
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists sync_users_user_isolation on public.sync_users;
create policy sync_users_user_isolation
on public.sync_users
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sync_records_scope_known'
  ) then
    alter table public.sync_records
      add constraint sync_records_scope_known
      check (
        scope in (
          'foods',
          'food_log_entries',
          'weights',
          'day_meta',
          'activity',
          'wellness',
          'recovery_check_ins',
          'diet_phases',
          'diet_phase_events',
          'interventions',
          'meal_templates',
          'recipes',
          'favorite_foods',
          'weekly_check_ins',
          'coach_decisions',
          'settings_targets',
          'settings_preferences',
          'settings_coaching_runtime'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sync_records_payload_object'
  ) then
    alter table public.sync_records
      add constraint sync_records_payload_object
      check (jsonb_typeof(payload_json) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sync_records_server_version_positive'
  ) then
    alter table public.sync_records
      add constraint sync_records_server_version_positive
      check (server_version > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sync_records_last_device_id_nonempty'
  ) then
    alter table public.sync_records
      add constraint sync_records_last_device_id_nonempty
      check (length(trim(last_device_id)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sync_mutations_status_known'
  ) then
    alter table public.sync_mutations
      add constraint sync_mutations_status_known
      check (status in ('applied', 'dead_letter'));
  end if;
end $$;

create index if not exists sync_records_user_version_idx
on public.sync_records (user_id, server_version);

create index if not exists sync_mutations_user_record_idx
on public.sync_mutations (user_id, scope, record_id);

create or replace function public.claim_sync_server_version()
returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('public.sync_server_version_seq');
$$;

create or replace function public.replace_sync_records_for_user(
  p_user_id uuid,
  p_records jsonb,
  p_bootstrap_completed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  next_record jsonb;
  next_version bigint;
  next_deleted_at timestamptz;
begin
  delete from public.sync_records where user_id = p_user_id;

  for next_record in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb))
  loop
    next_version := nextval('public.sync_server_version_seq');
    next_deleted_at :=
      case
        when coalesce(next_record->>'deletedAt', '') <> '' then (next_record->>'deletedAt')::timestamptz
        else null
      end;

    insert into public.sync_records (
      user_id,
      scope,
      record_id,
      payload_json,
      deleted_at,
      server_version,
      server_updated_at,
      last_mutation_id,
      last_device_id
    )
    values (
      p_user_id,
      next_record->>'scope',
      next_record->>'recordId',
      coalesce(next_record->'payload', '{}'::jsonb),
      next_deleted_at,
      next_version,
      now(),
      gen_random_uuid(),
      'bootstrap'
    );
  end loop;

  insert into public.sync_users (user_id, bootstrap_completed_at)
  values (p_user_id, p_bootstrap_completed_at)
  on conflict (user_id) do update
    set bootstrap_completed_at = excluded.bootstrap_completed_at;
end;
$$;

