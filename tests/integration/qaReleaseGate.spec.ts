import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

describe('qa severity evaluator script', () => {
  it('fails when generic preview fails even if dev smoke passes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-release-gate-'))
    const inputPath = path.join(tempDir, 'input.json')
    const outputPath = path.join(tempDir, 'artifact.json')

    writeJson(inputPath, {
      buildId: 'qa-build',
      commitSha: 'abc123',
      evaluationDate: '2026-04-17',
      laneResults: [
        { laneId: 'dev_smoke', advisory: true, status: 'passed' },
        { laneId: 'generic_preview', advisory: false, status: 'failed' },
      ],
      scenarioResults: [],
      findings: [],
      manualSweep: {
        completed: true,
        operator: 'qa-operator',
        completedAt: '2026-04-17T09:30:00.000Z',
        findings: [],
      },
    })

    expect(() =>
      execFileSync(process.execPath, ['scripts/qa-severity-evaluator.mjs', '--input', inputPath, '--output', outputPath], {
        cwd: process.cwd(),
        stdio: 'pipe',
      }),
    ).toThrow()

    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
    expect(artifact.verdict).toBe('fail')
    expect(artifact.telemetrySignals).toContain('qa.preview_parity.preview_failed_dev_passed')
  })

  it('fails when the manual sweep artifact is missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-release-gate-'))
    const inputPath = path.join(tempDir, 'input.json')
    const outputPath = path.join(tempDir, 'artifact.json')

    writeJson(inputPath, {
      buildId: 'qa-build',
      commitSha: 'abc123',
      evaluationDate: '2026-04-17',
      laneResults: [{ laneId: 'generic_preview', advisory: false, status: 'passed' }],
      scenarioResults: [],
      findings: [],
      manualSweep: null,
    })

    expect(() =>
      execFileSync(process.execPath, ['scripts/qa-severity-evaluator.mjs', '--input', inputPath, '--output', outputPath], {
        cwd: process.cwd(),
        stdio: 'pipe',
      }),
    ).toThrow()

    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
    expect(artifact.verdict).toBe('fail')
    expect(artifact.manualSweep.errors[0]).toMatch(/missing or invalid/i)
  })
})
