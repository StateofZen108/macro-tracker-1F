create table if not exists public.garmin_connections (
  user_id uuid primary key,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  connected_at timestamptz null,
  last_successful_sync_at timestamptz null,
  retry_after_at timestamptz null,
  failure_count integer not null default 0,
  last_watermarks_json jsonb not null default '{}'::jsonb,
  access_token_json jsonb null,
  refresh_token_json jsonb null,
  token_expires_at timestamptz null,
  pending_state text null,
  stale_data boolean not null default false,
  last_sync_window_start_date text null,
  last_sync_window_end_date text null,
  last_error_message text null,
  sync_lease_id text null,
  sync_lease_expires_at timestamptz null,
  last_sync_actor text null
);

create index if not exists garmin_connections_status_idx
  on public.garmin_connections (status);

create table if not exists public.garmin_auth_sessions (
  state text primary key,
  user_id uuid not null,
  code_verifier text not null,
  redirect_uri text not null,
  return_to_url text null,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create index if not exists garmin_auth_sessions_user_id_idx
  on public.garmin_auth_sessions (user_id);

create index if not exists garmin_auth_sessions_expires_at_idx
  on public.garmin_auth_sessions (expires_at);

create or replace function public.claim_garmin_sync_lease(
  p_user_id uuid,
  p_lease_id text,
  p_lease_expires_at timestamptz,
  p_actor text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
as $$
declare
  claimed_row public.garmin_connections;
begin
  update public.garmin_connections
  set
    status = 'syncing',
    updated_at = coalesce(p_now, now()),
    sync_lease_id = p_lease_id,
    sync_lease_expires_at = p_lease_expires_at,
    last_sync_actor = p_actor
  where user_id = p_user_id
    and (sync_lease_expires_at is null or sync_lease_expires_at <= coalesce(p_now, now()))
  returning * into claimed_row;

  if claimed_row.user_id is null then
    return null;
  end if;

  return to_jsonb(claimed_row);
end;
$$;

create or replace function public.apply_garmin_sync_success(
  p_user_id uuid,
  p_lease_id text,
  p_connection jsonb,
  p_records jsonb,
  p_actor text
)
returns boolean
language plpgsql
security definer
as $$
declare
  updated_row public.garmin_connections;
  next_record jsonb;
  next_version bigint;
  next_deleted_at timestamptz;
  next_server_updated_at timestamptz;
  next_record_id text;
begin
  update public.garmin_connections
  set
    status = coalesce(p_connection->>'status', 'connected'),
    created_at = coalesce(nullif(p_connection->>'created_at', '')::timestamptz, created_at),
    updated_at = coalesce(nullif(p_connection->>'updated_at', '')::timestamptz, now()),
    connected_at = case
      when coalesce(p_connection->>'connected_at', '') <> '' then (p_connection->>'connected_at')::timestamptz
      else null
    end,
    last_successful_sync_at = case
      when coalesce(p_connection->>'last_successful_sync_at', '') <> '' then (p_connection->>'last_successful_sync_at')::timestamptz
      else null
    end,
    retry_after_at = case
      when coalesce(p_connection->>'retry_after_at', '') <> '' then (p_connection->>'retry_after_at')::timestamptz
      else null
    end,
    failure_count = coalesce((p_connection->>'failure_count')::integer, 0),
    last_watermarks_json = coalesce(p_connection->'last_watermarks_json', '{}'::jsonb),
    access_token_json = p_connection->'access_token_json',
    refresh_token_json = p_connection->'refresh_token_json',
    token_expires_at = case
      when coalesce(p_connection->>'token_expires_at', '') <> '' then (p_connection->>'token_expires_at')::timestamptz
      else null
    end,
    pending_state = nullif(p_connection->>'pending_state', ''),
    stale_data = coalesce((p_connection->>'stale_data')::boolean, false),
    last_sync_window_start_date = nullif(p_connection->>'last_sync_window_start_date', ''),
    last_sync_window_end_date = nullif(p_connection->>'last_sync_window_end_date', ''),
    last_error_message = nullif(p_connection->>'last_error_message', ''),
    sync_lease_id = null,
    sync_lease_expires_at = null,
    last_sync_actor = coalesce(nullif(p_connection->>'last_sync_actor', ''), p_actor)
  where user_id = p_user_id
    and sync_lease_id = p_lease_id
  returning * into updated_row;

  if updated_row.user_id is null then
    return false;
  end if;

  for next_record in
    select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb))
  loop
    if coalesce(next_record->>'provider', '') = '' or coalesce(next_record->>'date', '') = '' then
      continue;
    end if;

    next_version := nextval('public.sync_server_version_seq');
    next_deleted_at :=
      case
        when coalesce(next_record->>'deletedAt', '') <> '' then (next_record->>'deletedAt')::timestamptz
        else null
      end;
    next_server_updated_at :=
      case
        when coalesce(next_record->>'updatedAt', '') <> '' then (next_record->>'updatedAt')::timestamptz
        else now()
      end;
    next_record_id := format('%s:%s', next_record->>'provider', next_record->>'date');

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
      'wellness',
      next_record_id,
      next_record,
      next_deleted_at,
      next_version,
      next_server_updated_at,
      gen_random_uuid(),
      format('garmin-%s', coalesce(p_actor, 'manual'))
    )
    on conflict (user_id, scope, record_id) do update
      set payload_json = excluded.payload_json,
          deleted_at = excluded.deleted_at,
          server_version = excluded.server_version,
          server_updated_at = excluded.server_updated_at,
          last_mutation_id = excluded.last_mutation_id,
          last_device_id = excluded.last_device_id;
  end loop;

  return true;
end;
$$;

create or replace function public.apply_garmin_sync_failure(
  p_user_id uuid,
  p_lease_id text,
  p_connection jsonb
)
returns boolean
language plpgsql
security definer
as $$
declare
  updated_row public.garmin_connections;
begin
  update public.garmin_connections
  set
    status = coalesce(p_connection->>'status', status),
    created_at = coalesce(nullif(p_connection->>'created_at', '')::timestamptz, created_at),
    updated_at = coalesce(nullif(p_connection->>'updated_at', '')::timestamptz, now()),
    connected_at = case
      when coalesce(p_connection->>'connected_at', '') <> '' then (p_connection->>'connected_at')::timestamptz
      else null
    end,
    last_successful_sync_at = case
      when coalesce(p_connection->>'last_successful_sync_at', '') <> '' then (p_connection->>'last_successful_sync_at')::timestamptz
      else null
    end,
    retry_after_at = case
      when coalesce(p_connection->>'retry_after_at', '') <> '' then (p_connection->>'retry_after_at')::timestamptz
      else null
    end,
    failure_count = coalesce((p_connection->>'failure_count')::integer, failure_count),
    last_watermarks_json = coalesce(p_connection->'last_watermarks_json', last_watermarks_json),
    access_token_json = p_connection->'access_token_json',
    refresh_token_json = p_connection->'refresh_token_json',
    token_expires_at = case
      when coalesce(p_connection->>'token_expires_at', '') <> '' then (p_connection->>'token_expires_at')::timestamptz
      else null
    end,
    pending_state = nullif(p_connection->>'pending_state', ''),
    stale_data = coalesce((p_connection->>'stale_data')::boolean, stale_data),
    last_sync_window_start_date = nullif(p_connection->>'last_sync_window_start_date', ''),
    last_sync_window_end_date = nullif(p_connection->>'last_sync_window_end_date', ''),
    last_error_message = nullif(p_connection->>'last_error_message', ''),
    sync_lease_id = null,
    sync_lease_expires_at = null,
    last_sync_actor = nullif(p_connection->>'last_sync_actor', '')
  where user_id = p_user_id
    and sync_lease_id = p_lease_id
  returning * into updated_row;

  return updated_row.user_id is not null;
end;
$$;
