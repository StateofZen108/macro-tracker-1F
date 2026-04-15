export type AddFoodPaneMode = 'add' | 'replace'

export type AddFoodRemoteStatus = 'idle' | 'loading' | 'ok' | 'unavailable'

export interface RepeatMealCandidate {
  foodId: string
  foodName: string
  servings: number
  lastUsedAt?: string
}
