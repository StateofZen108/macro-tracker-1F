import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const RESULT_PATH = resolve('tmp', 'supabase-migration-live-result.json')

export const REQUIRED_RLS_TABLES = ['sync_records', 'sync_mutations', 'sync_users']
export const REQUIRED_POLICIES = [
  'sync_records_user_isolation',
  'sync_mutations_user_isolation',
  'sync_users_user_isolation',
]
export const REQUIRED_CONSTRAINTS = [
  'sync_records_scope_known',
  'sync_records_payload_object',
  'sync_records_server_version_positive',
  'sync_records_last_device_id_nonempty',
  'sync_mutations_status_known',
]
export const REQUIRED_INDEXES = [
  'sync_records_user_version_idx',
  'sync_mutations_user_record_idx',
]
export const REQUIRED_FUNCTIONS = [
  'claim_sync_server_version',
  'replace_sync_records_for_user',
]

export const SUPABASE_MIGRATION_LIVE_SQL = `
select json_build_object(
  'rlsTables', (
    select coalesce(json_agg(json_build_object(
      'table', c.relname,
      'rls', c.relrowsecurity
    )), '[]'::json)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('sync_records', 'sync_mutations', 'sync_users')
  ),
  'policies', (
    select coalesce(json_agg(json_build_object(
      'table', tablename,
      'policy', policyname,
      'cmd', cmd,
      'roles', roles::text,
      'qual', qual,
      'withCheck', with_check
    )), '[]'::json)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('sync_records', 'sync_mutations', 'sync_users')
  ),
  'constraints', (
    select coalesce(json_agg(json_build_object(
      'table', tbl.relname,
      'name', con.conname,
      'definition', pg_get_constraintdef(con.oid)
    )), '[]'::json)
    from pg_constraint con
    join pg_class tbl on tbl.oid = con.conrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    where n.nspname = 'public'
      and con.conname in (
        'sync_records_scope_known',
        'sync_records_payload_object',
        'sync_records_server_version_positive',
        'sync_records_last_device_id_nonempty',
        'sync_mutations_status_known'
      )
  ),
  'indexes', (
    select coalesce(json_agg(indexname), '[]'::json)
    from pg_indexes
    where schemaname = 'public'
      and indexname in ('sync_records_user_version_idx', 'sync_mutations_user_record_idx')
  ),
  'functions', (
    select coalesce(json_agg(json_build_object(
      'name', p.proname,
      'config', coalesce(p.proconfig::text, '')
    )), '[]'::json)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('claim_sync_server_version', 'replace_sync_records_for_user')
  )
)::text;
`

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function includesSearchPathPublic(config) {
  return typeof config === 'string' && config.includes('search_path=public')
}

function hasAuthUidPredicate(value) {
  return typeof value === 'string' && value.includes('auth.uid() = user_id')
}

export function validateSupabaseMigrationSnapshot(snapshot) {
  const violations = []
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return ['Supabase migration snapshot must be a JSON object.']
  }

  const rlsTables = asArray(snapshot.rlsTables)
  for (const tableName of REQUIRED_RLS_TABLES) {
    const table = rlsTables.find((candidate) => candidate?.table === tableName)
    if (!table) {
      violations.push(`Missing sync table in live database: ${tableName}`)
      continue
    }
    if (table.rls !== true) {
      violations.push(`RLS is not enabled for ${tableName}.`)
    }
  }

  const policies = asArray(snapshot.policies)
  for (const policyName of REQUIRED_POLICIES) {
    const policy = policies.find((candidate) => candidate?.policy === policyName)
    if (!policy) {
      violations.push(`Missing RLS policy: ${policyName}`)
      continue
    }
    if (!hasAuthUidPredicate(policy.qual) || !hasAuthUidPredicate(policy.withCheck)) {
      violations.push(`RLS policy does not enforce auth.uid() user isolation: ${policyName}`)
    }
  }

  const constraints = asArray(snapshot.constraints)
  for (const constraintName of REQUIRED_CONSTRAINTS) {
    if (!constraints.some((candidate) => candidate?.name === constraintName)) {
      violations.push(`Missing sync constraint: ${constraintName}`)
    }
  }

  const indexes = asArray(snapshot.indexes)
  for (const indexName of REQUIRED_INDEXES) {
    if (!indexes.includes(indexName)) {
      violations.push(`Missing sync index: ${indexName}`)
    }
  }

  const functions = asArray(snapshot.functions)
  for (const functionName of REQUIRED_FUNCTIONS) {
    const fn = functions.find((candidate) => candidate?.name === functionName)
    if (!fn) {
      violations.push(`Missing hardened sync function: ${functionName}`)
      continue
    }
    if (!includesSearchPathPublic(fn.config)) {
      violations.push(`Sync function missing search_path=public: ${functionName}`)
    }
  }

  return violations
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return result.status === 0
}

function readDatabaseUrl(env = process.env) {
  return env.SUPABASE_DB_URL?.trim() || env.DATABASE_URL?.trim() || null
}

export function canRunSupabaseLiveCheck(env = process.env, commandExistsImpl = commandExists) {
  return Boolean(readDatabaseUrl(env)) && commandExistsImpl('psql')
}

function truthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function hashDatabaseHostname(databaseUrl) {
  try {
    const hostname = new URL(databaseUrl).hostname
    return createHash('sha256').update(hostname).digest('hex').slice(0, 16)
  } catch {
    return null
  }
}

function resolveMigrationFileName() {
  const migrationDir = resolve('supabase', 'migrations')
  if (!existsSync(migrationDir)) {
    return null
  }

  return readdirSync(migrationDir)
    .filter((fileName) => fileName.endsWith('_sync_rls_constraints.sql'))
    .sort()
    .at(-1) ?? null
}

function runLiveQuery(databaseUrl) {
  const output = execFileSync(
    'psql',
    ['--no-psqlrc', '--tuples-only', '--no-align', databaseUrl, '-c', SUPABASE_MIGRATION_LIVE_SQL],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT ?? '10',
      },
    },
  ).trim()
  return JSON.parse(output)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const databaseUrl = readDatabaseUrl()
  if (!databaseUrl) {
    if (truthy(process.env.SUPABASE_MIGRATION_VERIFIED)) {
      const result = {
        ok: true,
        verificationMode: 'manual_attestation',
        checkedAt: new Date().toISOString(),
        targetHostHash: null,
        migrationFile: resolveMigrationFileName(),
        checkedTables: REQUIRED_RLS_TABLES,
        checkedPolicies: REQUIRED_POLICIES,
        checkedConstraints: REQUIRED_CONSTRAINTS,
        checkedIndexes: REQUIRED_INDEXES,
        checkedFunctions: REQUIRED_FUNCTIONS,
        reason: 'SUPABASE_MIGRATION_VERIFIED=true supplied without live database credentials.',
      }
      mkdirSync(dirname(RESULT_PATH), { recursive: true })
      writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`)
      console.log('Supabase migration verified by manual attestation.')
      process.exit(0)
    }
    console.error('Supabase live migration check failed:')
    console.error('- SUPABASE_DB_URL or DATABASE_URL is required.')
    process.exit(1)
  }
  if (!commandExists('psql')) {
    if (truthy(process.env.SUPABASE_MIGRATION_VERIFIED)) {
      const result = {
        ok: true,
        verificationMode: 'manual_attestation',
        checkedAt: new Date().toISOString(),
        targetHostHash: hashDatabaseHostname(databaseUrl),
        migrationFile: resolveMigrationFileName(),
        checkedTables: REQUIRED_RLS_TABLES,
        checkedPolicies: REQUIRED_POLICIES,
        checkedConstraints: REQUIRED_CONSTRAINTS,
        checkedIndexes: REQUIRED_INDEXES,
        checkedFunctions: REQUIRED_FUNCTIONS,
        reason: 'SUPABASE_MIGRATION_VERIFIED=true supplied without psql on PATH.',
      }
      mkdirSync(dirname(RESULT_PATH), { recursive: true })
      writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`)
      console.log('Supabase migration verified by manual attestation.')
      process.exit(0)
    }
    console.error('Supabase live migration check failed:')
    console.error('- psql is required on PATH to inspect live PostgreSQL RLS, policies, constraints, indexes, and functions.')
    process.exit(1)
  }

  const snapshot = runLiveQuery(databaseUrl)
  const violations = validateSupabaseMigrationSnapshot(snapshot)
  if (violations.length) {
    console.error('Supabase live migration check failed:')
    for (const violation of violations) {
      console.error(`- ${violation}`)
    }
    process.exit(1)
  }

  const result = {
    ok: true,
    verificationMode: 'live_database',
    checkedAt: new Date().toISOString(),
    targetHostHash: hashDatabaseHostname(databaseUrl),
    migrationFile: resolveMigrationFileName(),
    tables: REQUIRED_RLS_TABLES,
    policies: REQUIRED_POLICIES,
    constraints: REQUIRED_CONSTRAINTS,
    indexes: REQUIRED_INDEXES,
    functions: REQUIRED_FUNCTIONS,
    checkedTables: REQUIRED_RLS_TABLES,
    checkedPolicies: REQUIRED_POLICIES,
    checkedConstraints: REQUIRED_CONSTRAINTS,
    checkedIndexes: REQUIRED_INDEXES,
    checkedFunctions: REQUIRED_FUNCTIONS,
  }
  mkdirSync(dirname(RESULT_PATH), { recursive: true })
  writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`)
  console.log('Supabase live migration verified.')
}
