import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const QA_LANE_IDS = [
  'dev_smoke',
  'generic_preview',
  'coach_preview',
  'personal_library_preview',
  'psmf_phase_preview',
  'recovery_preview',
  'garmin_preview',
]

export const QA_FAILURE_MODES = ['offline', 'http_5xx', 'request_timeout', 'camera_permission_denied']
export const QA_SEVERITIES = ['blocker', 'major', 'minor', 'cosmetic']
export const QA_VERDICTS = ['pass', 'conditional_pass', 'fail']

export const QA_SCENARIO_CATALOG = [
  {
    id: 'clean_install_baseline',
    owner: 'qa_release_runner',
    requiredLanes: ['generic_preview'],
    seedName: 'clean_install_baseline',
    failureModes: [],
    accessibilityScopes: ['main'],
    releaseClass: 'required',
  },
  {
    id: 'repeat_logging_fast_path',
    owner: 'food_logging_owner',
    requiredLanes: ['generic_preview'],
    seedName: 'repeat_logging_fast_path',
    failureModes: [],
    accessibilityScopes: ['[role="dialog"]'],
    releaseClass: 'required',
  },
  {
    id: 'review_queue_pending',
    owner: 'food_review_owner',
    requiredLanes: ['generic_preview'],
    seedName: 'review_queue_pending',
    failureModes: [],
    accessibilityScopes: ['main'],
    releaseClass: 'required',
  },
  {
    id: 'training_guidance_stale_readiness',
    owner: 'workout_guidance_owner',
    requiredLanes: ['generic_preview'],
    seedName: 'training_guidance_stale_readiness',
    failureModes: [],
    accessibilityScopes: ['main'],
    releaseClass: 'required',
  },
  {
    id: 'training_guidance_manual_override',
    owner: 'workout_guidance_owner',
    requiredLanes: ['generic_preview'],
    seedName: 'training_guidance_manual_override',
    failureModes: [],
    accessibilityScopes: ['main'],
    releaseClass: 'required',
  },
  {
    id: 'progress_story_missing_photo',
    owner: 'body_progress_owner',
    requiredLanes: ['generic_preview'],
    seedName: 'progress_story_missing_photo',
    failureModes: [],
    accessibilityScopes: ['main'],
    releaseClass: 'required',
  },
  {
    id: 'offline_local_logging_only',
    owner: 'food_logging_owner',
    requiredLanes: ['generic_preview'],
    seedName: 'offline_local_logging_only',
    failureModes: ['offline'],
    accessibilityScopes: ['[role="dialog"]'],
    releaseClass: 'required',
  },
  {
    id: 'food_catalog_5xx_fallback',
    owner: 'food_catalog_owner',
    requiredLanes: ['generic_preview'],
    seedName: 'food_catalog_5xx_fallback',
    failureModes: ['http_5xx'],
    accessibilityScopes: ['[role="dialog"]'],
    releaseClass: 'required',
  },
  {
    id: 'barcode_permission_denied',
    owner: 'food_capture_owner',
    requiredLanes: ['generic_preview'],
    seedName: 'barcode_permission_denied',
    failureModes: ['camera_permission_denied'],
    accessibilityScopes: ['[role="dialog"]'],
    releaseClass: 'required',
  },
  {
    id: 'export_restore_roundtrip',
    owner: 'storage_owner',
    requiredLanes: ['generic_preview'],
    seedName: 'export_restore_roundtrip',
    failureModes: [],
    accessibilityScopes: ['main'],
    releaseClass: 'required',
  },
]

export const QA_REQUIRED_SCENARIOS = QA_SCENARIO_CATALOG

export const QA_LANE_CONFIGS = {
  dev_smoke: {
    configFile: 'playwright.qa-dev-smoke.config.ts',
    advisory: true,
    required: false,
  },
  generic_preview: {
    configFile: 'playwright.generic-preview.config.ts',
    advisory: false,
    required: true,
  },
  coach_preview: {
    configFile: 'playwright.coach-wave1.config.ts',
    advisory: false,
    required: true,
  },
  personal_library_preview: {
    configFile: 'playwright.personal-library.config.ts',
    advisory: false,
    required: true,
  },
  psmf_phase_preview: {
    configFile: 'playwright.psmf-phase.config.ts',
    advisory: false,
    required: true,
  },
  recovery_preview: {
    configFile: 'playwright.recovery-layer.config.ts',
    advisory: false,
    required: true,
  },
  garmin_preview: {
    configFile: 'playwright.garmin-connect.config.ts',
    advisory: false,
    required: true,
  },
}

const SEVERITY_RANK = {
  blocker: 4,
  major: 3,
  minor: 2,
  cosmetic: 1,
}

function unique(values) {
  return [...new Set(values)]
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeIsoDate(dateValue) {
  if (!isNonEmptyString(dateValue)) {
    return null
  }

  const normalized = dateValue.trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function ensureStringArray(values) {
  return Array.isArray(values)
    ? values.filter((value) => isNonEmptyString(value)).map((value) => value.trim())
    : []
}

function buildFindingId(parts) {
  return parts
    .filter(Boolean)
    .join(':')
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
}

function createUuid() {
  return randomUUID()
}

export function loadJsonFile(filePath, fallbackValue = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallbackValue
  }
}

export function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2))
}

export function validateQaScenarioCatalog(scenarios = QA_SCENARIO_CATALOG) {
  const errors = []
  const ids = new Set()

  for (const scenario of scenarios) {
    if (!isNonEmptyString(scenario?.id)) {
      errors.push('Scenario id must be a non-empty string.')
      continue
    }

    if (ids.has(scenario.id)) {
      errors.push(`Scenario ${scenario.id} is duplicated.`)
    }
    ids.add(scenario.id)

    if (!isNonEmptyString(scenario.owner)) {
      errors.push(`Scenario ${scenario.id} is missing an owner.`)
    }

    if (!Array.isArray(scenario.requiredLanes) || scenario.requiredLanes.length === 0) {
      errors.push(`Scenario ${scenario.id} must define at least one required lane.`)
    } else {
      const invalidLane = scenario.requiredLanes.find((laneId) => !QA_LANE_IDS.includes(laneId))
      if (invalidLane) {
        errors.push(`Scenario ${scenario.id} references unknown lane ${invalidLane}.`)
      }
    }

    if (!isNonEmptyString(scenario.seedName)) {
      errors.push(`Scenario ${scenario.id} is missing a seedName.`)
    }

    if (!Array.isArray(scenario.failureModes)) {
      errors.push(`Scenario ${scenario.id} must define failureModes as an array.`)
    } else {
      const invalidFailureMode = scenario.failureModes.find((mode) => !QA_FAILURE_MODES.includes(mode))
      if (invalidFailureMode) {
        errors.push(`Scenario ${scenario.id} references unknown failure mode ${invalidFailureMode}.`)
      }
    }

    if (!Array.isArray(scenario.accessibilityScopes) || scenario.accessibilityScopes.length === 0) {
      errors.push(`Scenario ${scenario.id} must define at least one accessibility scope.`)
    }

    if (scenario.releaseClass !== 'required' && scenario.releaseClass !== 'nice_to_have') {
      errors.push(`Scenario ${scenario.id} must define releaseClass as required or nice_to_have.`)
    }

    const includesGenericPreview = scenario.requiredLanes.includes('generic_preview')
    if (!includesGenericPreview) {
      if (!isNonEmptyString(scenario.whyGenericExcluded)) {
        errors.push(`Scenario ${scenario.id} excludes generic_preview without whyGenericExcluded.`)
      }
      if (scenario.requiredLanes.length !== 1) {
        errors.push(
          `Scenario ${scenario.id} must define exactly one dedicated preview lane when generic_preview is excluded.`,
        )
      }
    } else if (isNonEmptyString(scenario.whyGenericExcluded)) {
      errors.push(`Scenario ${scenario.id} cannot define whyGenericExcluded while generic_preview is present.`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}

export function validateAccessibilityAllowlist(entries, evaluationDate = new Date().toISOString()) {
  const errors = []
  const normalizedEvaluationDate = normalizeIsoDate(evaluationDate) ?? new Date().toISOString().slice(0, 10)

  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry) => ({
        ...entry,
        ruleId: isNonEmptyString(entry?.ruleId) ? entry.ruleId.trim() : '',
        targetSelector: isNonEmptyString(entry?.targetSelector) ? entry.targetSelector.trim() : '',
        scenarioId: isNonEmptyString(entry?.scenarioId) ? entry.scenarioId.trim() : '',
        owner: isNonEmptyString(entry?.owner) ? entry.owner.trim() : '',
        reason: isNonEmptyString(entry?.reason) ? entry.reason.trim() : '',
        expiresOn: normalizeIsoDate(entry?.expiresOn),
      }))
    : []

  for (const entry of normalizedEntries) {
    if (!entry.ruleId) {
      errors.push('Accessibility allowlist entries must define ruleId.')
    }
    if (!entry.targetSelector || entry.targetSelector.includes('*')) {
      errors.push('Accessibility allowlist entries must define an exact targetSelector with no wildcards.')
    }
    if (!entry.scenarioId) {
      errors.push('Accessibility allowlist entries must define scenarioId.')
    }
    if (!entry.owner) {
      errors.push(`Accessibility allowlist entry ${entry.ruleId || 'unknown'} is missing owner.`)
    }
    if (!entry.reason) {
      errors.push(`Accessibility allowlist entry ${entry.ruleId || 'unknown'} is missing reason.`)
    }
    if (!entry.expiresOn) {
      errors.push(`Accessibility allowlist entry ${entry.ruleId || 'unknown'} is missing expiresOn.`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    activeEntries: normalizedEntries.filter(
      (entry) => entry.expiresOn && entry.expiresOn >= normalizedEvaluationDate,
    ),
    expiredEntries: normalizedEntries.filter(
      (entry) => entry.expiresOn && entry.expiresOn < normalizedEvaluationDate,
    ),
  }
}

export function classifyA11yImpact(impact) {
  if (impact === 'critical') {
    return 'blocker'
  }
  if (impact === 'serious') {
    return 'major'
  }
  if (impact === 'moderate') {
    return 'minor'
  }
  return 'cosmetic'
}

export function evaluateAccessibilityViolations({
  scenarioId,
  laneId,
  violations,
  allowlistEntries,
  evaluationDate = new Date().toISOString(),
}) {
  const normalizedEvaluationDate = normalizeIsoDate(evaluationDate) ?? new Date().toISOString().slice(0, 10)
  const allowlist = validateAccessibilityAllowlist(allowlistEntries, normalizedEvaluationDate)
  const findings = []

  for (const violation of violations ?? []) {
    const ruleId = isNonEmptyString(violation?.id) ? violation.id.trim() : 'unknown_rule'
    const impact = isNonEmptyString(violation?.impact) ? violation.impact.trim() : 'moderate'
    const help = isNonEmptyString(violation?.help) ? violation.help.trim() : 'Accessibility violation'
    const nodes =
      Array.isArray(violation?.nodes) && violation.nodes.length > 0
        ? violation.nodes
        : [{ target: ['unknown-target'] }]

    for (const node of nodes) {
      const targetSelector =
        Array.isArray(node?.target) && isNonEmptyString(node.target[0])
          ? node.target[0].trim()
          : 'unknown-target'
      const matchedAllowlist = allowlist.activeEntries.find(
        (entry) =>
          entry.ruleId === ruleId &&
          entry.scenarioId === scenarioId &&
          entry.targetSelector === targetSelector,
      )
      if (matchedAllowlist) {
        continue
      }

      findings.push({
        id: buildFindingId([laneId, scenarioId, 'a11y', ruleId, targetSelector]),
        scenarioId,
        laneId,
        severity: classifyA11yImpact(impact),
        summary: help,
        reproSteps: [`Open scenario ${scenarioId}.`, `Inspect selector ${targetSelector}.`],
        evidencePaths: [],
        resolutionState: 'open',
        source: 'automated',
        category: 'accessibility',
        impact,
        ruleId,
        targetSelector,
      })
    }
  }

  return {
    findings,
    expiredEntries: allowlist.expiredEntries,
    validationErrors: allowlist.errors,
  }
}

export function isValidWaiver(waiver, severity, evaluationDate = new Date().toISOString()) {
  if (severity !== 'minor' && severity !== 'cosmetic') {
    return false
  }

  const normalizedEvaluationDate = normalizeIsoDate(evaluationDate) ?? new Date().toISOString().slice(0, 10)
  const expiresOn = normalizeIsoDate(waiver?.expiresOn)
  return (
    isNonEmptyString(waiver?.owner) &&
    isNonEmptyString(waiver?.reason) &&
    isNonEmptyString(waiver?.ticket) &&
    !!expiresOn &&
    expiresOn >= normalizedEvaluationDate
  )
}

export function isRolloutBlockingFinding(finding, evaluationDate = new Date().toISOString()) {
  if (!finding || finding.resolutionState === 'resolved') {
    return false
  }

  if (finding.severity === 'blocker' || finding.severity === 'major') {
    return true
  }

  if (finding.severity === 'minor' || finding.severity === 'cosmetic') {
    return !isValidWaiver(finding.waiver, finding.severity, evaluationDate)
  }

  return true
}

export function compareSeverity(left, right) {
  return (SEVERITY_RANK[right] ?? 0) - (SEVERITY_RANK[left] ?? 0)
}

function normalizeFinding(rawFinding) {
  const severity = QA_SEVERITIES.includes(rawFinding?.severity) ? rawFinding.severity : 'major'
  const resolutionState =
    rawFinding?.resolutionState === 'resolved' || rawFinding?.resolutionState === 'accepted_waiver'
      ? rawFinding.resolutionState
      : 'open'

  return {
    id: isNonEmptyString(rawFinding?.id) ? rawFinding.id : createUuid(),
    scenarioId: isNonEmptyString(rawFinding?.scenarioId) ? rawFinding.scenarioId : 'manual',
    laneId: isNonEmptyString(rawFinding?.laneId) ? rawFinding.laneId : 'manual_s22',
    severity,
    summary: isNonEmptyString(rawFinding?.summary) ? rawFinding.summary : 'QA finding',
    reproSteps: ensureStringArray(rawFinding?.reproSteps),
    evidencePaths: ensureStringArray(rawFinding?.evidencePaths),
    resolutionState,
    source: rawFinding?.source === 'manual' ? 'manual' : 'automated',
    waiver: rawFinding?.waiver,
    category: rawFinding?.category,
    impact: rawFinding?.impact,
    ruleId: rawFinding?.ruleId,
    targetSelector: rawFinding?.targetSelector,
  }
}

function normalizeLaneResult(rawLaneResult) {
  return {
    laneId: isNonEmptyString(rawLaneResult?.laneId) ? rawLaneResult.laneId : 'unknown_lane',
    advisory: rawLaneResult?.advisory === true,
    status:
      rawLaneResult?.status === 'passed' ||
      rawLaneResult?.status === 'failed' ||
      rawLaneResult?.status === 'aborted'
        ? rawLaneResult.status
        : 'failed',
    startedAt: isNonEmptyString(rawLaneResult?.startedAt) ? rawLaneResult.startedAt : undefined,
    finishedAt: isNonEmptyString(rawLaneResult?.finishedAt) ? rawLaneResult.finishedAt : undefined,
    exitCode:
      typeof rawLaneResult?.exitCode === 'number' && Number.isFinite(rawLaneResult.exitCode)
        ? rawLaneResult.exitCode
        : undefined,
    evidencePaths: ensureStringArray(rawLaneResult?.evidencePaths),
  }
}

function normalizeScenarioResult(rawScenarioResult) {
  return {
    scenarioId: isNonEmptyString(rawScenarioResult?.scenarioId)
      ? rawScenarioResult.scenarioId
      : 'unknown_scenario',
    laneId: isNonEmptyString(rawScenarioResult?.laneId) ? rawScenarioResult.laneId : 'unknown_lane',
    status:
      rawScenarioResult?.status === 'passed' ||
      rawScenarioResult?.status === 'failed' ||
      rawScenarioResult?.status === 'aborted'
        ? rawScenarioResult.status
        : 'failed',
    startedAt: isNonEmptyString(rawScenarioResult?.startedAt) ? rawScenarioResult.startedAt : undefined,
    finishedAt: isNonEmptyString(rawScenarioResult?.finishedAt) ? rawScenarioResult.finishedAt : undefined,
    failureModes: ensureStringArray(rawScenarioResult?.failureModes),
    accessibilityScopes: ensureStringArray(rawScenarioResult?.accessibilityScopes),
    evidencePaths: ensureStringArray(rawScenarioResult?.evidencePaths),
    findings: Array.isArray(rawScenarioResult?.findings)
      ? rawScenarioResult.findings.map(normalizeFinding)
      : [],
    validationErrors: ensureStringArray(rawScenarioResult?.validationErrors),
    expiredAllowlistEntries: Array.isArray(rawScenarioResult?.expiredAllowlistEntries)
      ? rawScenarioResult.expiredAllowlistEntries
      : [],
  }
}

export function normalizeManualSweepArtifact(rawValue) {
  if (!rawValue || typeof rawValue !== 'object') {
    return {
      completed: false,
      operator: null,
      completedAt: null,
      findings: [],
      errors: ['Manual sweep artifact is missing or invalid.'],
    }
  }

  const findings = Array.isArray(rawValue.findings) ? rawValue.findings.map(normalizeFinding) : []
  const completed = rawValue.completed === true
  const operator = isNonEmptyString(rawValue.operator) ? rawValue.operator.trim() : null
  const completedAt = isNonEmptyString(rawValue.completedAt) ? rawValue.completedAt.trim() : null
  const errors = []

  if (!completed) {
    errors.push('Manual sweep must be marked completed.')
  }
  if (!operator) {
    errors.push('Manual sweep must include operator.')
  }
  if (!completedAt) {
    errors.push('Manual sweep must include completedAt.')
  }

  for (const finding of findings) {
    if (!finding.evidencePaths.length) {
      errors.push(`Manual finding ${finding.id} is missing evidencePaths.`)
    }
  }

  return {
    completed: completed && errors.length === 0,
    operator,
    completedAt,
    findings,
    errors,
  }
}

export function evaluateQaVerdict(input) {
  const evaluationDate = normalizeIsoDate(input?.evaluationDate) ?? new Date().toISOString().slice(0, 10)
  const scenarioCatalog = Array.isArray(input?.scenarioCatalog) ? input.scenarioCatalog : QA_SCENARIO_CATALOG
  const scenarioCatalogValidation = validateQaScenarioCatalog(scenarioCatalog)
  const requiredScenarios = scenarioCatalog.filter((scenario) => scenario.releaseClass === 'required')
  const laneResults = Array.isArray(input?.laneResults) ? input.laneResults.map(normalizeLaneResult) : []
  const scenarioResults = Array.isArray(input?.scenarioResults)
    ? input.scenarioResults.map(normalizeScenarioResult)
    : []
  const manualSweep = normalizeManualSweepArtifact(input?.manualSweep ?? null)
  const explicitFindings = Array.isArray(input?.findings) ? input.findings.map(normalizeFinding) : []
  const scenarioFindings = scenarioResults.flatMap((scenarioResult) => scenarioResult.findings)
  const allFindings = [...explicitFindings, ...scenarioFindings, ...manualSweep.findings]
  const openFindings = allFindings.filter((finding) => finding.resolutionState !== 'resolved')
  const blockingFindings = openFindings.filter((finding) => isRolloutBlockingFinding(finding, evaluationDate))
  const requiredLaneIds = unique(requiredScenarios.flatMap((scenario) => scenario.requiredLanes))
  const missingRequiredLaneResults = requiredLaneIds.filter(
    (laneId) => !laneResults.some((laneResult) => laneResult.laneId === laneId),
  )
  const failedRequiredLanes = laneResults.filter(
    (laneResult) => requiredLaneIds.includes(laneResult.laneId) && laneResult.status !== 'passed',
  )
  const failedRequiredScenarios = requiredScenarios.filter((scenario) =>
    scenario.requiredLanes.some((laneId) => {
      const result = scenarioResults.find(
        (scenarioResult) => scenarioResult.scenarioId === scenario.id && scenarioResult.laneId === laneId,
      )
      return !result || result.status !== 'passed'
    }),
  )
  const scenarioValidationErrors = scenarioResults.flatMap((scenarioResult) =>
    scenarioResult.validationErrors.map((error) => `${scenarioResult.scenarioId}: ${error}`),
  )
  const missingScenarioArtifacts = requiredScenarios.filter((scenario) =>
    scenario.requiredLanes.some(
      (laneId) =>
        !scenarioResults.some(
          (scenarioResult) =>
            scenarioResult.scenarioId === scenario.id &&
            scenarioResult.laneId === laneId &&
            Array.isArray(scenarioResult.evidencePaths),
        ),
    ),
  )

  const hasMissingArtifact =
    !isNonEmptyString(input?.buildId) ||
    !isNonEmptyString(input?.commitSha) ||
    missingRequiredLaneResults.length > 0 ||
    missingScenarioArtifacts.length > 0 ||
    !manualSweep.completed

  let verdict = 'pass'
  if (
    !scenarioCatalogValidation.ok ||
    scenarioValidationErrors.length > 0 ||
    manualSweep.errors.length > 0 ||
    blockingFindings.length > 0 ||
    failedRequiredLanes.length > 0 ||
    failedRequiredScenarios.length > 0 ||
    hasMissingArtifact
  ) {
    verdict = 'fail'
  } else if (openFindings.length > 0) {
    verdict = 'conditional_pass'
  }

  return {
    buildId: input?.buildId ?? null,
    commitSha: input?.commitSha ?? null,
    generatedAt: new Date().toISOString(),
    evaluationDate,
    laneResults,
    scenarioResults,
    findings: allFindings.sort((left, right) => compareSeverity(left.severity, right.severity)),
    verdict,
    scenarioCatalogValidation,
    manualSweep,
    summary: {
      requiredScenarioCount: requiredScenarios.length,
      failedRequiredScenarioCount: failedRequiredScenarios.length,
      failedRequiredLaneCount: failedRequiredLanes.length,
      openFindingCount: openFindings.length,
      blockingFindingCount: blockingFindings.length,
      missingArtifact: hasMissingArtifact,
      scenarioValidationErrorCount: scenarioValidationErrors.length,
    },
    telemetrySignals: unique([
      'qa.verdict.started',
      verdict === 'pass'
        ? 'qa.verdict.pass'
        : verdict === 'conditional_pass'
          ? 'qa.verdict.conditional_pass'
          : 'qa.verdict.fail',
      ...failedRequiredLanes.map((laneResult) =>
        laneResult.laneId === 'generic_preview'
          ? 'qa.preview_parity.preview_failed_dev_passed'
          : 'qa.preview_parity.dedicated_lane_failed',
      ),
      ...blockingFindings
        .filter((finding) => finding.category === 'accessibility')
        .map(() => 'qa.accessibility.blocking_violation'),
      ...blockingFindings
        .filter((finding) => finding.source === 'manual')
        .map(() => 'qa.manual.blocking_finding_recorded'),
    ]),
    errors: unique([
      ...scenarioCatalogValidation.errors,
      ...scenarioValidationErrors,
      ...manualSweep.errors,
      ...(hasMissingArtifact ? ['Required QA report artifacts are missing.'] : []),
    ]),
  }
}
