create sequence if not exists public.sync_server_version_seq;

create table if not exists public.sync_records (
  user_id uuid not null,
  scope text not null,
  record_id text not null,
  payload_json jsonb not null,
  deleted_at timestamptz null,
  server_version bigint not null,
  server_updated_at timestamptz not null,
  last_mutation_id uuid not null,
  last_device_id text not null,
  primary key (user_id, scope, record_id)
);

create table if not exists public.sync_mutations (
  user_id uuid not null,
  mutation_id uuid not null,
  scope text not null,
  record_id text not null,
  result_server_version bigint not null,
  applied_at timestamptz not null,
  status text not null,
  primary key (user_id, mutation_id)
);

create table if not exists public.sync_users (
  user_id uuid primary key,
  bootstrap_completed_at timestamptz null
);

create or replace function public.claim_sync_server_version()
returns bigint
language sql
security definer
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
