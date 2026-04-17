import type {
  CanonicalNutrientKey,
  DayMeta,
  DeficiencyAlert,
  Food,
  FoodContributionRecord,
  FoodLogEntry,
  NutritionDrilldownPoint,
  NutritionDrilldownSnapshot,
  NutritionOverviewBundle,
  NutritionOverviewDay,
  NutritionOverviewMetric,
  NutritionOverviewWindow,
  NutrientProfileV1,
  SupportedNutrientCatalogEntry,
  UserSettings,
} from '../../types'
import { addDays, enumerateDateKeys } from '../../utils/dates'
import { calculateFoodNutrition } from '../../utils/macros'
import { NUTRIENT_DEFINITIONS_V1 } from './canonical'
import {
  buildNutrientProfileFromLegacyNutrition,
  getNutrientAmountV1,
  scaleNutrientProfileV1,
  sumNutrientProfilesV1,
} from './profile'

interface NutrientTargetRule {
  key: CanonicalNutrientKey
  target: number
  lowThreshold?: number
  highThreshold?: number
  upperAdequateLimit?: number
}

function rule(
  key: CanonicalNutrientKey,
  target: number,
  options?: Pick<NutrientTargetRule, 'lowThreshold' | 'highThreshold' | 'upperAdequateLimit'>,
): NutrientTargetRule {
  return { key, target, ...options }
}

const TRACKED_RULES: NutrientTargetRule[] = [
  rule('calories', 2000, { lowThreshold: 1600, highThreshold: 2600 }),
  rule('protein', 150, { lowThreshold: 120, highThreshold: 240 }),
  rule('carbs', 225, { lowThreshold: 120, highThreshold: 325 }),
  rule('fat', 65, { lowThreshold: 45, highThreshold: 95 }),
  rule('fiber', 28, { lowThreshold: 24, highThreshold: 40 }),
  rule('sugars', 50, { lowThreshold: 0, highThreshold: 75 }),
  rule('addedSugars', 25, { lowThreshold: 0, highThreshold: 35, upperAdequateLimit: 35 }),
  rule('sodium', 1500, { lowThreshold: 1200, highThreshold: 2300, upperAdequateLimit: 2300 }),
  rule('salt', 5, { lowThreshold: 3, highThreshold: 6, upperAdequateLimit: 6 }),
  rule('saturates', 20, { lowThreshold: 0, highThreshold: 20, upperAdequateLimit: 20 }),
  rule('cholesterol', 300, { lowThreshold: 0, highThreshold: 300, upperAdequateLimit: 300 }),
  rule('potassium', 4700, { lowThreshold: 3400, highThreshold: 5500 }),
  rule('calcium', 1300, { lowThreshold: 1000, highThreshold: 1600 }),
  rule('magnesium', 420, { lowThreshold: 320, highThreshold: 520 }),
  rule('iron', 18, { lowThreshold: 8, highThreshold: 25 }),
  rule('vitaminC', 90, { lowThreshold: 75, highThreshold: 160 }),
  rule('vitaminD', 20, { lowThreshold: 15, highThreshold: 40 }),
  rule('vitaminB12', 2.4, { lowThreshold: 2, highThreshold: 5 }),
  rule('caffeine', 300, { lowThreshold: 0, highThreshold: 400, upperAdequateLimit: 400 }),
  rule('monounsaturatedFat', 20, { lowThreshold: 10, highThreshold: 35 }),
  rule('polyunsaturatedFat', 17, { lowThreshold: 10, highThreshold: 30 }),
  rule('transFat', 0, { lowThreshold: 0, highThreshold: 2, upperAdequateLimit: 2 }),
  rule('omega3', 1.6, { lowThreshold: 1.1, highThreshold: 3 }),
  rule('omega6', 17, { lowThreshold: 12, highThreshold: 25 }),
  rule('folate', 400, { lowThreshold: 300, highThreshold: 800 }),
  rule('vitaminA', 900, { lowThreshold: 700, highThreshold: 1800 }),
  rule('vitaminE', 15, { lowThreshold: 12, highThreshold: 30 }),
  rule('vitaminK', 120, { lowThreshold: 90, highThreshold: 240 }),
  rule('thiamin', 1.2, { lowThreshold: 0.9, highThreshold: 2 }),
  rule('riboflavin', 1.3, { lowThreshold: 1, highThreshold: 2.2 }),
  rule('niacin', 16, { lowThreshold: 12, highThreshold: 30 }),
  rule('vitaminB6', 1.7, { lowThreshold: 1.3, highThreshold: 3 }),
  rule('biotin', 30, { lowThreshold: 20, highThreshold: 60 }),
  rule('pantothenicAcid', 5, { lowThreshold: 4, highThreshold: 10 }),
  rule('phosphorus', 1250, { lowThreshold: 900, highThreshold: 1800 }),
  rule('zinc', 11, { lowThreshold: 8, highThreshold: 20 }),
  rule('selenium', 55, { lowThreshold: 45, highThreshold: 100 }),
  rule('copper', 0.9, { lowThreshold: 0.7, highThreshold: 2 }),
  rule('manganese', 2.3, { lowThreshold: 1.8, highThreshold: 5 }),
  rule('iodine', 150, { lowThreshold: 120, highThreshold: 300 }),
  rule('chromium', 35, { lowThreshold: 25, highThreshold: 120 }),
  rule('molybdenum', 45, { lowThreshold: 35, highThreshold: 100 }),
  rule('choline', 550, { lowThreshold: 425, highThreshold: 1000 }),
  rule('chloride', 2300, { lowThreshold: 1800, highThreshold: 3600 }),
  rule('fluoride', 4, { lowThreshold: 3, highThreshold: 8 }),
  rule('boron', 3, { lowThreshold: 1.5, highThreshold: 8 }),
  rule('betaCarotene', 3000, { lowThreshold: 1500, highThreshold: 7000 }),
  rule('lutein', 10, { lowThreshold: 4, highThreshold: 20 }),
  rule('lycopene', 10, { lowThreshold: 4, highThreshold: 20 }),
  rule('alcohol', 0, { lowThreshold: 0, highThreshold: 14, upperAdequateLimit: 14 }),
]

const COVERAGE_FLOOR_PERCENT = 60
const MAX_CONTRIBUTORS = 3

function buildTrackedRules(settings?: UserSettings): NutrientTargetRule[] {
  return TRACKED_RULES.flatMap((baseRule) => {
    const goalSetting = settings?.nutrientGoals?.[baseRule.key]
    if (goalSetting?.mode === 'none') {
      return []
    }

    if (goalSetting?.mode === 'custom') {
      const target = goalSetting.target ?? baseRule.target
      const floor = goalSetting.floor ?? baseRule.lowThreshold ?? target * 0.9
      const ceiling = goalSetting.ceiling ?? baseRule.upperAdequateLimit ?? baseRule.highThreshold
      return [
        {
          key: baseRule.key,
          target,
          lowThreshold: floor,
          highThreshold: ceiling ?? target * 1.4,
          upperAdequateLimit: ceiling,
        },
      ]
    }

    return [{ ...baseRule }]
  })
}

const DEFICIENCY_COPY: Partial<
  Record<
    CanonicalNutrientKey,
    {
      title: string
      message: string
    }
  >
> = {
  fiber: {
    title: 'Fiber is trailing',
    message:
      'PSMF food variety looks narrow in this window. Add higher-fiber vegetables or a targeted fibre source.',
  },
  sodium: {
    title: 'Sodium looks low',
    message: 'Very low sodium can make an aggressive cut feel worse. Review electrolyte intake for this window.',
  },
  potassium: {
    title: 'Potassium needs attention',
    message:
      'Low potassium coverage can hide a real gap on a restricted diet. Add potassium-rich produce or review supplementation.',
  },
  calcium: {
    title: 'Calcium is under target',
    message: 'Your current food mix is light on calcium. Add a calcium-rich staple or tighten supplementation.',
  },
  magnesium: {
    title: 'Magnesium is under target',
    message:
      'Restricted food selection is leaving magnesium short. Add a reliable source or cover it deliberately.',
  },
  iron: {
    title: 'Iron is under target',
    message: 'Iron looks soft in this window. Review lean protein choices and any iron supplementation plan.',
  },
  vitaminC: {
    title: 'Vitamin C is under target',
    message: 'Vitamin C coverage is low. Add a small produce source that consistently fits your cut.',
  },
  vitaminD: {
    title: 'Vitamin D is under target',
    message: 'Diet alone is not covering vitamin D here. Review supplementation or other planned coverage.',
  },
  vitaminB12: {
    title: 'Vitamin B12 is under target',
    message: 'B12 coverage is weak in this window. Make sure your protein mix or supplements cover it.',
  },
}

function roundTo(value: number, digits = 1): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function resolveEntryProfile(entry: FoodLogEntry, foodIndex: Map<string, Food>): NutrientProfileV1 {
  const baseProfile =
    entry.snapshot.nutrients ??
    (entry.foodId ? foodIndex.get(entry.foodId)?.nutrients : undefined) ??
    buildNutrientProfileFromLegacyNutrition(entry.snapshot)

  return scaleNutrientProfileV1(baseProfile, entry.servings)
}

function buildMetricStatus(rule: NutrientTargetRule, value: number, coveragePercent: number) {
  if (coveragePercent < COVERAGE_FLOOR_PERCENT) {
    return 'limited' as const
  }

  const lowThreshold = rule.lowThreshold ?? rule.target * 0.9
  const highThreshold = rule.highThreshold ?? rule.target * 1.4

  if (value < lowThreshold) {
    return 'low' as const
  }

  if (typeof rule.upperAdequateLimit === 'number') {
    if (value > rule.upperAdequateLimit) {
      return 'high' as const
    }

    return 'adequate' as const
  }

  if (value > highThreshold) {
    return 'high' as const
  }

  return 'adequate' as const
}

function buildContributionId(entry: FoodLogEntry): string {
  if (entry.foodId) {
    return entry.foodId
  }

  const brand = entry.snapshot.brand?.trim().toLowerCase() ?? ''
  const name = entry.snapshot.name.trim().toLowerCase()
  return `${name}::${brand}`
}

function buildDeficiencyAlerts(
  window: NutritionOverviewWindow,
  metrics: NutritionOverviewMetric[],
): DeficiencyAlert[] {
  return metrics
    .filter((metric) => metric.status === 'low' || metric.status === 'limited')
    .slice(0, 8)
    .map((metric) => {
      const copy = DEFICIENCY_COPY[metric.key]
      return {
        id: `${window}-${metric.key}-${metric.status}`,
        window,
        nutrientKey: metric.key,
        severity: 'warning',
        title: copy?.title ?? `${metric.label} is below target`,
        message:
          copy?.message ??
          `${metric.label} is trending low in this window. Review foods or supplements covering it.`,
      }
    })
}

function buildOverviewWindow(input: {
  window: NutritionOverviewWindow
  label: string
  startDate: string
  endDate: string
  averageAcrossTrackedDays: boolean
  logsByDate: Record<string, FoodLogEntry[]>
  dayMeta: DayMeta[]
  foods: Food[]
  settings?: UserSettings
  trackedRules: NutrientTargetRule[]
}): NutritionOverviewDay {
  const foodIndex = new Map(input.foods.map((food) => [food.id, food] as const))
  const dayMetaByDate = new Map(input.dayMeta.map((entry) => [entry.date, entry] as const))
  const nutrientTotals: NutrientProfileV1[] = []
  const coverageCaloriesByKey = new Map<CanonicalNutrientKey, number>()
  const contributionMap = new Map<
    string,
    {
      id: string
      foodId?: string
      name: string
      brand?: string
      calories: number
      nutrientLabels: Set<string>
    }
  >()
  let trackedDays = 0
  let totalCalories = 0

  for (const date of enumerateDateKeys(input.startDate, input.endDate)) {
    const entries = (input.logsByDate[date] ?? []).filter((entry) => !entry.deletedAt)
    const status = dayMetaByDate.get(date)?.status
    const trackedDay = entries.length > 0 || status === 'fasting'
    if (!trackedDay) {
      continue
    }

    trackedDays += 1

    const dayCalories = entries.reduce(
      (sum, entry) => sum + calculateFoodNutrition(entry.snapshot, entry.servings).calories,
      0,
    )
    totalCalories += dayCalories

    const entryProfiles = entries.map((entry) => {
      const profile = resolveEntryProfile(entry, foodIndex)
      const entryCalories = calculateFoodNutrition(entry.snapshot, entry.servings).calories
      const contributionId = buildContributionId(entry)
      const indexedFood = entry.foodId ? foodIndex.get(entry.foodId) : undefined
      const existingContribution = contributionMap.get(contributionId)
      const contribution =
        existingContribution ??
        {
          id: contributionId,
          foodId: entry.foodId,
          name: indexedFood?.name ?? entry.snapshot.name,
          brand: indexedFood?.brand ?? entry.snapshot.brand,
          calories: 0,
          nutrientLabels: new Set<string>(),
        }
      contribution.calories += entryCalories
      for (const trackedRule of input.trackedRules) {
        if (getNutrientAmountV1(profile, trackedRule.key) !== null) {
          coverageCaloriesByKey.set(
            trackedRule.key,
            (coverageCaloriesByKey.get(trackedRule.key) ?? 0) + entryCalories,
          )
          contribution.nutrientLabels.add(NUTRIENT_DEFINITIONS_V1[trackedRule.key].label)
        }
      }
      contributionMap.set(contributionId, contribution)
      return profile
    })

    nutrientTotals.push(sumNutrientProfilesV1(entryProfiles))
  }

  const summedProfile = sumNutrientProfilesV1(nutrientTotals)
  const dayDivisor = input.averageAcrossTrackedDays ? Math.max(trackedDays, 1) : 1
  const displayedCalories = trackedDays > 0 ? roundTo(totalCalories / dayDivisor, 0) : 0

  const resolvedMetrics: NutritionOverviewMetric[] = input.trackedRules.map((trackedRule) => {
    const definition = NUTRIENT_DEFINITIONS_V1[trackedRule.key]
    const goalSetting = input.settings?.nutrientGoals?.[trackedRule.key]
    const rawValue = getNutrientAmountV1(summedProfile, trackedRule.key) ?? 0
    const value = trackedDays > 0 ? roundTo(rawValue / dayDivisor, 1) : 0
    const totalCoverageCalories = coverageCaloriesByKey.get(trackedRule.key) ?? 0
    const coveragePercent =
      totalCalories > 0 ? roundTo((totalCoverageCalories / totalCalories) * 100, 0) : 100

    return {
      key: trackedRule.key,
      label: definition.label,
      unit: definition.defaultUnit,
      value,
      target: trackedRule.target,
      coveragePercent,
      status: buildMetricStatus(trackedRule, value, coveragePercent),
      goalMode: goalSetting?.mode ?? 'auto',
      floor:
        goalSetting?.mode === 'custom'
          ? goalSetting.floor ?? trackedRule.lowThreshold
          : undefined,
      ceiling:
        goalSetting?.mode === 'custom'
          ? goalSetting.ceiling ?? trackedRule.upperAdequateLimit ?? trackedRule.highThreshold
          : undefined,
    }
  })

  const completenessPercent =
    resolvedMetrics.length > 0
      ? roundTo(
          resolvedMetrics.reduce((sum, metric) => sum + metric.coveragePercent, 0) /
            resolvedMetrics.length,
          0,
        )
      : 0

  const contributors: FoodContributionRecord[] = [...contributionMap.values()]
    .sort((left, right) => right.calories - left.calories)
    .slice(0, MAX_CONTRIBUTORS)
    .map((contribution) => ({
      id: contribution.id,
      foodId: contribution.foodId,
      name: contribution.name,
      brand: contribution.brand,
      calories: roundTo(contribution.calories, 0),
      sharePercent: totalCalories > 0 ? roundTo((contribution.calories / totalCalories) * 100, 0) : 0,
      nutrientLabels: [...contribution.nutrientLabels].sort((left, right) => left.localeCompare(right)),
    }))

  return {
    window: input.window,
    label: input.label,
    startDate: input.startDate,
    endDate: input.endDate,
    trackedDays,
    totalCalories: displayedCalories,
    completenessPercent,
    metrics: resolvedMetrics,
    contributors,
    deficiencyAlerts: trackedDays > 0 ? buildDeficiencyAlerts(input.window, resolvedMetrics) : [],
  }
}

function buildSupportedNutrientCatalog(
  trackedRules: NutrientTargetRule[],
): SupportedNutrientCatalogEntry[] {
  return trackedRules.map((trackedRule) => {
    const definition = NUTRIENT_DEFINITIONS_V1[trackedRule.key]
    return {
      key: trackedRule.key,
      label: definition.label,
      unit: definition.defaultUnit,
      category: definition.category,
    }
  })
}

function buildDrilldowns(input: {
  windows: NutritionOverviewDay[]
  supportedNutrients: SupportedNutrientCatalogEntry[]
}): NutritionDrilldownSnapshot[] {
  return input.supportedNutrients.map((nutrient) => {
    const points: NutritionDrilldownPoint[] = input.windows.flatMap((window) => {
      const metric = window.metrics.find((entry) => entry.key === nutrient.key)
      if (!metric) {
        return []
      }

      return [
        {
          window: window.window,
          label: window.label,
          value: metric.value,
          target: metric.target,
          coveragePercent: metric.coveragePercent,
          status: metric.status,
          contributors: window.contributors,
        },
      ]
    })

    return {
      key: nutrient.key,
      label: nutrient.label,
      unit: nutrient.unit,
      goalMode: input.windows[0]?.metrics.find((metric) => metric.key === nutrient.key)?.goalMode ?? 'auto',
      points,
    }
  })
}

export function buildNutritionOverview(input: {
  today: string
  logsByDate: Record<string, FoodLogEntry[]>
  dayMeta: DayMeta[]
  foods: Food[]
  includeV2?: boolean
  settings?: UserSettings
}): NutritionOverviewBundle {
  const trackedRules = buildTrackedRules(input.settings)

  const today = buildOverviewWindow({
    window: 'day',
    label: 'Today',
    startDate: input.today,
    endDate: input.today,
    averageAcrossTrackedDays: false,
    logsByDate: input.logsByDate,
    dayMeta: input.dayMeta,
    foods: input.foods,
    settings: input.settings,
    trackedRules,
  })
  const trailingWeek = buildOverviewWindow({
    window: '7d',
    label: '7-day average',
    startDate: addDays(input.today, -6),
    endDate: input.today,
    averageAcrossTrackedDays: true,
    logsByDate: input.logsByDate,
    dayMeta: input.dayMeta,
    foods: input.foods,
    settings: input.settings,
    trackedRules,
  })

  const trailingMonth = input.includeV2
    ? buildOverviewWindow({
        window: '30d',
        label: '30-day average',
        startDate: addDays(input.today, -29),
        endDate: input.today,
        averageAcrossTrackedDays: true,
        logsByDate: input.logsByDate,
        dayMeta: input.dayMeta,
        foods: input.foods,
        settings: input.settings,
        trackedRules,
      })
    : undefined
  const trailingQuarter = input.includeV2
    ? buildOverviewWindow({
        window: '90d',
        label: '90-day average',
        startDate: addDays(input.today, -89),
        endDate: input.today,
        averageAcrossTrackedDays: true,
        logsByDate: input.logsByDate,
        dayMeta: input.dayMeta,
        foods: input.foods,
        settings: input.settings,
        trackedRules,
      })
    : undefined
  const trailingYear = input.includeV2
    ? buildOverviewWindow({
        window: '365d',
        label: '365-day average',
        startDate: addDays(input.today, -364),
        endDate: input.today,
        averageAcrossTrackedDays: true,
        logsByDate: input.logsByDate,
        dayMeta: input.dayMeta,
        foods: input.foods,
        settings: input.settings,
        trackedRules,
      })
    : undefined

  const pinnedMetrics = (input.settings?.pinnedNutrients ?? [])
    .map((preference) => ({
      metric:
        today.metrics.find((metric) => metric.key === preference.key) ??
        trailingWeek.metrics.find((metric) => metric.key === preference.key) ??
        trailingMonth?.metrics.find((metric) => metric.key === preference.key) ??
        null,
      order: preference.order,
    }))
    .filter(
      (entry): entry is { metric: NutritionOverviewMetric; order: number } => entry.metric !== null,
    )
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.metric)

  const supportedNutrients = buildSupportedNutrientCatalog(trackedRules)
  const focusedNutrientKey =
    input.settings?.focusedNutrientKey ?? pinnedMetrics[0]?.key ?? supportedNutrients[0]?.key
  const windows = [
    today,
    trailingWeek,
    trailingMonth,
    trailingQuarter,
    trailingYear,
  ].filter((window): window is NutritionOverviewDay => Boolean(window))

  return {
    today,
    trailingWeek,
    trailingMonth,
    trailingQuarter,
    trailingYear,
    pinnedMetrics,
    supportedNutrients,
    focusedNutrientKey,
    drilldowns: buildDrilldowns({
      windows,
      supportedNutrients,
    }),
  }
}
