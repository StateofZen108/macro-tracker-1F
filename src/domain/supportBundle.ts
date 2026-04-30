import type { SupportBundleRedactionResult } from '../types.js'

const SENSITIVE_KEY_PATTERN =
  /(token|secret|email|barcode|foodName|mealName|recipeName|rawOcrText|ocrText|image|base64|note|password|authorization)/i

function redactValue(value: unknown, redactedKeys: string[], path: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, redactedKeys, `${path}.${index}`))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
        const nestedPath = path ? `${path}.${key}` : key
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          redactedKeys.push(nestedPath)
          return [key, '[redacted]']
        }
        return [key, redactValue(nestedValue, redactedKeys, nestedPath)]
      }),
    )
  }

  if (typeof value === 'string' && /data:image\/|@[a-z0-9.-]+\.[a-z]{2,}/i.test(value)) {
    redactedKeys.push(path)
    return '[redacted]'
  }

  return value
}

export function buildSupportBundle(input: {
  sections: Record<string, unknown>
  exportedAt?: string
}): SupportBundleRedactionResult {
  const redactedKeys: string[] = []
  const payload = redactValue(input.sections, redactedKeys, '') as Record<string, unknown>

  return {
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    sections: Object.keys(input.sections),
    redactedKeys: [...new Set(redactedKeys)].sort(),
    payload,
  }
}
