import { buildSupportBundle } from '../../src/domain/supportBundle.js'
import type { SupportBundleRedactionResult } from '../../src/types.js'

export function buildServerSupportBundle(input: {
  sections: Record<string, unknown>
  exportedAt?: string
}): SupportBundleRedactionResult {
  return buildSupportBundle(input)
}
