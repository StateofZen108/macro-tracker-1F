import type { BenchmarkReport, BenchmarkScenario, CoreClaimSnapshot } from '../../types'

export interface CoreBenchmarkReadiness {
  nutrientGoalReady: boolean
  coachModulesReady: boolean
  loggingShortcutsReady: boolean
  workoutsAnalyticsReady: boolean
  bodyProgressGalleryReady: boolean
  dashboardDefaultsReconciled: boolean
  garminSurfaceReady: boolean
  recoverableCoreData: boolean
}

export interface GapClosureReadiness {
  fastCheckInSurfaceReady: boolean
  nutritionDepthReady: boolean
  loggingSurfaceReady: boolean
  workoutsAnalyticsDepthReady: boolean
  bodyProgressSurfaceReady: boolean
  dashboardClaimReady: boolean
  recoverableGapClosureData: boolean
}

export function evaluateBenchmarkPass(scenarios: BenchmarkScenario[]): {
  passed: boolean
  blockedReason?: string
} {
  const failingScenario = scenarios.find((scenario) => {
    if (!scenario.required) {
      return false
    }

    return (
      scenario.actualActionCount > scenario.baselineActionCount ||
      scenario.actualElapsedMs > scenario.baselineElapsedMs ||
      !scenario.correctnessPassed
    )
  })

  if (!failingScenario) {
    return { passed: true }
  }

  return {
    passed: false,
    blockedReason: `${failingScenario.name} exceeded the stored MacroFactor baseline or failed correctness assertions.`,
  }
}

export function buildBenchmarkReport(
  scenarios: BenchmarkScenario[],
  createdAt = new Date().toISOString(),
): BenchmarkReport {
  const evaluation = evaluateBenchmarkPass(scenarios)
  return {
    id: crypto.randomUUID(),
    createdAt,
    passed: evaluation.passed,
    blockedReason: evaluation.blockedReason,
    scenarios: scenarios.map((scenario) => ({ ...scenario })),
  }
}

export function isMacrofactorSuperiorityClaimable(input: {
  allCriticalReleasesGa: boolean
  scenarios: BenchmarkScenario[]
}): boolean {
  if (!input.allCriticalReleasesGa) {
    return false
  }

  return evaluateBenchmarkPass(input.scenarios).passed
}

export function evaluateCoreBenchmarkClosure(input: {
  allCriticalReleasesGa: boolean
  readiness: CoreBenchmarkReadiness
  scenarios: BenchmarkScenario[]
}): {
  passed: boolean
  blockedReason?: string
} {
  if (!input.allCriticalReleasesGa) {
    return {
      passed: false,
      blockedReason: 'Not every core-benchmark release is generally available yet.',
    }
  }

  const missingGate = Object.entries(input.readiness).find(([, value]) => !value)?.[0]
  if (missingGate) {
    return {
      passed: false,
      blockedReason: `${missingGate} is not ready, so the core superiority claim remains blocked.`,
    }
  }

  return evaluateBenchmarkPass(input.scenarios)
}

export function isMacrofactorCoreSuperiorityClaimable(input: {
  allCriticalReleasesGa: boolean
  readiness: CoreBenchmarkReadiness
  scenarios: BenchmarkScenario[]
}): boolean {
  return evaluateCoreBenchmarkClosure(input).passed
}

export function evaluateGapClosureClaim(input: {
  allCriticalReleasesGa: boolean
  readiness: GapClosureReadiness
  scenarios: BenchmarkScenario[]
}): {
  passed: boolean
  blockedReason?: string
} {
  if (!input.allCriticalReleasesGa) {
    return {
      passed: false,
      blockedReason: 'Not every gap-closure release is generally available yet.',
    }
  }

  const missingGate = Object.entries(input.readiness).find(([, value]) => !value)?.[0]
  if (missingGate) {
    return {
      passed: false,
      blockedReason: `${missingGate} is not ready, so the live MacroFactor gap-closure claim remains blocked.`,
    }
  }

  if (input.scenarios.length === 0) {
    return {
      passed: false,
      blockedReason: 'No benchmark scenarios have been recorded yet for the live claim gate.',
    }
  }

  return evaluateBenchmarkPass(input.scenarios)
}

export function buildCoreClaimSnapshot(input: {
  allCriticalReleasesGa: boolean
  readiness: GapClosureReadiness
  scenarios: BenchmarkScenario[]
  reportId?: string
  latestBenchmarkCreatedAt?: string
  evaluatedAt?: string
}): CoreClaimSnapshot {
  const evaluation = evaluateGapClosureClaim({
    allCriticalReleasesGa: input.allCriticalReleasesGa,
    readiness: input.readiness,
    scenarios: input.scenarios,
  })

  return {
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    passed: evaluation.passed,
    blockedReason: evaluation.blockedReason,
    reportId: input.reportId,
    latestBenchmarkCreatedAt: input.latestBenchmarkCreatedAt,
    scenarioCount: input.scenarios.length,
    readiness: {
      ...input.readiness,
    },
  }
}
