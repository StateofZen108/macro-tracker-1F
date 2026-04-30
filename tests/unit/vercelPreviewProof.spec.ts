import { describe, expect, it } from 'vitest'

import {
  extractPreviewUrl,
  readDeploymentCommitSha,
  resolveDeploymentCommitProof,
} from '../../scripts/run-vercel-preview-proof.mjs'

describe('Vercel preview proof helpers', () => {
  it('extracts the final preview URL from Vercel deploy output', () => {
    expect(
      extractPreviewUrl(`
Vercel CLI 48.8.2
Inspect: https://vercel.com/example/deployments/dpl_123
Preview: https://macrotracker-example.vercel.app
`),
    ).toBe('https://macrotracker-example.vercel.app')
  })

  it('reads deployment commit SHA from Vercel inspect metadata', () => {
    expect(
      readDeploymentCommitSha({
        uid: 'dpl_123',
        meta: {
          githubCommitSha: 'abc123',
        },
      }),
    ).toBe('abc123')
    expect(
      readDeploymentCommitSha({
        gitSource: {
          sha: 'def456',
        },
      }),
    ).toBe('def456')
  })

  it('allows proof-script-created manual deployments to bind to the clean local HEAD when Vercel hides metadata', () => {
    expect(
      resolveDeploymentCommitProof({
        deploymentCommitSha: '',
        gitSha: 'abc123',
        createdByProofScript: true,
      }),
    ).toEqual({
      passed: true,
      evidence: 'abc123',
      mode: 'local_clean_tree_deploy',
    })
    expect(
      resolveDeploymentCommitProof({
        deploymentCommitSha: '',
        gitSha: 'abc123',
        createdByProofScript: false,
      }),
    ).toEqual({
      passed: false,
      evidence: '<missing>',
      mode: 'missing_or_mismatched_metadata',
    })
  })
})
