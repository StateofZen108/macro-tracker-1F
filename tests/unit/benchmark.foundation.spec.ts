import { describe, expect, it } from 'vitest'
import {
  buildCoreClaimSnapshot,
  buildBenchmarkReport,
  evaluateBenchmarkPass,
  evaluateCoreBenchmarkClosure,
  evaluateGapClosureClaim,
  isMacrofactorCoreSuperiorityClaimable,
  isMacrofactorSuperiorityClaimable,
} from '../../src/domain/benchmark'

describe('benchmark foundation', () => {
  it('blocks the claim when one required canonical flow exceeds baseline', () => {
    const scenarios = [
      {
        id: 'check-in',
        name: 'Weekly check-in',
        required: true,
        baselineActionCount: 6,
        baselineElapsedMs: 60000,
        actualActionCount: 7,
        actualElapsedMs: 58000,
        correctnessPassed: true,
        createdAt: '2026-04-16T08:00:00.000Z',
      },
    ]

    const evaluation = evaluateBenchmarkPass(scenarios)
    const report = buildBenchmarkReport(scenarios, '2026-04-16T08:00:00.000Z')

    expect(evaluation.passed).toBe(false)
    expect(report.passed).toBe(false)
    expect(isMacrofactorSuperiorityClaimable({ allCriticalReleasesGa: true, scenarios })).toBe(false)
  })

  it('passes on exact ties when all required flows are correct', () => {
    const scenarios = [
      {
        id: 'nutrition-overview',
        name: 'Nutrition overview',
        required: true,
        baselineActionCount: 5,
        baselineElapsedMs: 45000,
        actualActionCount: 5,
        actualElapsedMs: 45000,
        correctnessPassed: true,
        createdAt: '2026-04-16T08:00:00.000Z',
      },
    ]

    expect(evaluateBenchmarkPass(scenarios).passed).toBe(true)
    expect(isMacrofactorSuperiorityClaimable({ allCriticalReleasesGa: true, scenarios })).toBe(true)
  })

  it('blocks the core closure claim when a readiness gate is missing', () => {
    const scenarios = [
      {
        id: 'repeat-food-logging',
        flowKey: 'repeat_food_logging',
        name: 'Repeat food logging',
        required: true,
        baselineActionCount: 4,
        baselineElapsedMs: 30000,
        actualActionCount: 3,
        actualElapsedMs: 25000,
        correctnessPassed: true,
        createdAt: '2026-04-16T08:00:00.000Z',
      },
    ]

    const evaluation = evaluateCoreBenchmarkClosure({
      allCriticalReleasesGa: true,
      readiness: {
        nutrientGoalReady: true,
        coachModulesReady: true,
        loggingShortcutsReady: true,
        workoutsAnalyticsReady: false,
        bodyProgressGalleryReady: true,
        dashboardDefaultsReconciled: true,
        garminSurfaceReady: true,
        recoverableCoreData: true,
      },
      scenarios,
    })

    expect(evaluation.passed).toBe(false)
    expect(evaluation.blockedReason).toContain('workoutsAnalyticsReady')
    expect(
      isMacrofactorCoreSuperiorityClaimable({
        allCriticalReleasesGa: true,
        readiness: {
          nutrientGoalReady: true,
          coachModulesReady: true,
          loggingShortcutsReady: true,
          workoutsAnalyticsReady: false,
          bodyProgressGalleryReady: true,
          dashboardDefaultsReconciled: true,
          garminSurfaceReady: true,
          recoverableCoreData: true,
        },
        scenarios,
      }),
    ).toBe(false)
  })

  it('allows the core closure claim only when readiness gates and benchmark flows pass', () => {
    const scenarios = [
      {
        id: 'body-progress-compare',
        flowKey: 'body_progress_compare',
        name: 'Body progress compare',
        required: true,
        baselineActionCount: 5,
        baselineElapsedMs: 40000,
        actualActionCount: 5,
        actualElapsedMs: 39000,
        correctnessPassed: true,
        createdAt: '2026-04-16T08:00:00.000Z',
      },
    ]

    expect(
      isMacrofactorCoreSuperiorityClaimable({
        allCriticalReleasesGa: true,
        readiness: {
          nutrientGoalReady: true,
          coachModulesReady: true,
          loggingShortcutsReady: true,
          workoutsAnalyticsReady: true,
          bodyProgressGalleryReady: true,
          dashboardDefaultsReconciled: true,
          garminSurfaceReady: true,
          recoverableCoreData: true,
        },
        scenarios,
      }),
    ).toBe(true)
  })

  it('blocks the live claim gate when no benchmark scenarios exist', () => {
    const claim = evaluateGapClosureClaim({
      allCriticalReleasesGa: true,
      readiness: {
        fastCheckInSurfaceReady: true,
        nutritionDepthReady: true,
        loggingSurfaceReady: true,
        workoutsAnalyticsDepthReady: true,
        bodyProgressSurfaceReady: true,
        dashboardClaimReady: true,
        recoverableGapClosureData: true,
      },
      scenarios: [],
    })

    expect(claim.passed).toBe(false)
    expect(claim.blockedReason).toContain('No benchmark scenarios')
  })

  it('builds a live claim snapshot with the failing readiness reason', () => {
    const snapshot = buildCoreClaimSnapshot({
      allCriticalReleasesGa: true,
      readiness: {
        fastCheckInSurfaceReady: true,
        nutritionDepthReady: true,
        loggingSurfaceReady: true,
        workoutsAnalyticsDepthReady: false,
        bodyProgressSurfaceReady: true,
        dashboardClaimReady: true,
        recoverableGapClosureData: true,
      },
      scenarios: [
        {
          id: 'workout-analytics',
          flowKey: 'workout_analytics',
          name: 'Workout analytics comprehension',
          required: true,
          baselineActionCount: 6,
          baselineElapsedMs: 30000,
          actualActionCount: 5,
          actualElapsedMs: 25000,
          correctnessPassed: true,
          createdAt: '2026-04-16T08:00:00.000Z',
        },
      ],
      reportId: 'report-1',
      latestBenchmarkCreatedAt: '2026-04-16T08:00:00.000Z',
      evaluatedAt: '2026-04-16T09:00:00.000Z',
    })

    expect(snapshot.passed).toBe(false)
    expect(snapshot.blockedReason).toContain('workoutsAnalyticsDepthReady')
    expect(snapshot.reportId).toBe('report-1')
    expect(snapshot.readiness.workoutsAnalyticsDepthReady).toBe(false)
  })
})
