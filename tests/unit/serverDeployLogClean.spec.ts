import { describe, expect, it } from 'vitest'

import {
  findVercelDeployLogAdvisories,
  findVercelDeployLogViolations,
} from '../../scripts/check-vercel-deploy-log-clean.mjs'

describe('Vercel deploy log cleanliness scanner', () => {
  it('passes a clean deployment log', () => {
    const violations = findVercelDeployLogViolations(`
Vercel CLI 39.1.0
Installing dependencies...
Build completed successfully
Deploy complete
`)

    expect(violations).toEqual([])
  })

  it('blocks TypeScript, Vercel, NodeNext, and function packaging diagnostics', () => {
    const violations = findVercelDeployLogViolations(`
api/food-catalog/barcode.ts(14,12): error TS2339: Property 'error' does not exist
server/food-catalog/fatsecret.ts(762,5): error TS2322: Type 'FatSecretResult<unknown>' is not assignable
warning: Function size exceeds the recommended limit
relative import paths need explicit file extensions in ECMAScript imports when moduleResolution is NodeNext
Functions exceeded the package limit
`)

    expect(violations.map((violation) => violation.code)).toEqual([
      'typescriptDiagnostic',
      'typescriptDiagnostic',
      'vercelWarning',
      'nodeNextDiagnostic',
      'functionPackagingWarning',
    ])
  })

  it('records third-party npm deprecation warnings as advisories, not deploy blockers', () => {
    const log = `
npm warn deprecated inflight@1.0.6: This module is not supported
Build completed successfully
`

    expect(findVercelDeployLogViolations(log)).toEqual([])
    expect(findVercelDeployLogAdvisories(log)).toEqual([
      {
        code: 'npmDeprecation',
        lineNumber: 2,
        line: 'npm warn deprecated inflight@1.0.6: This module is not supported',
      },
    ])
  })
})
