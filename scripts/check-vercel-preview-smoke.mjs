import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPORT_PATH = resolve('tmp', 'vercel-preview-smoke-report.json')

function truthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function resolvePreviewSmokeConfig(env = process.env) {
  return {
    previewUrl: env.VERCEL_PREVIEW_URL?.trim() || env.PRODUCTION_BASE_URL?.trim() || '',
    bypassSecret: env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || '',
    disabled: truthy(env.VERCEL_PREVIEW_SMOKE_DISABLED),
    strict: env.VERCEL_PREVIEW_PROOF_STRICT === undefined ? true : truthy(env.VERCEL_PREVIEW_PROOF_STRICT),
  }
}

export function isVercelProtectionResponse({ status = 0, url = '', body = '' } = {}) {
  const text = body.toLowerCase()
  return (
    status === 401 ||
    status === 403 ||
    url.includes('vercel.com/sso') ||
    text.includes('vercel authentication') ||
    text.includes('deployment protection') ||
    text.includes('_vercel_sso') ||
    text.includes('continue with vercel')
  )
}

export function extractBypassCookies(headers) {
  const values =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie')]
        : []

  return values
    .flatMap((value) => String(value).split(/,(?=[^;,]+=)/))
    .map((value) => value.split(';')[0]?.trim())
    .filter((value) => value && value.includes('='))
}

export function buildBypassHeaders({ bypassSecret = '', requestCookie = false, cookies = [] } = {}) {
  const headers = {}
  if (bypassSecret) {
    headers['x-vercel-protection-bypass'] = bypassSecret
    if (requestCookie) {
      headers['x-vercel-set-bypass-cookie'] = 'true'
    }
  }
  if (cookies.length) {
    headers.cookie = cookies.join('; ')
  }
  return headers
}

function writeReport(report) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
}

async function requestBypassCookie(url, bypassSecret) {
  if (!bypassSecret) {
    return []
  }
  const response = await fetch(url, {
    headers: buildBypassHeaders({ bypassSecret, requestCookie: true }),
    redirect: 'manual',
  })
  return extractBypassCookies(response.headers)
}

async function fetchWithBypass(url, bypassSecret, cookies) {
  return fetch(url, {
    headers: buildBypassHeaders({ bypassSecret, cookies }),
    redirect: 'follow',
  })
}

async function verifyWithPlaywright(url, bypassSecret, cookieHeaders) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  try {
    const extraHTTPHeaders = bypassSecret
      ? { 'x-vercel-protection-bypass': bypassSecret }
      : undefined
    const context = await browser.newContext({ extraHTTPHeaders })
    const parsedUrl = new URL(url)
    const cookies = cookieHeaders
      .map((cookie) => {
        const [name, ...rest] = cookie.split('=')
        const value = rest.join('=')
        if (!name || !value) {
          return null
        }
        return {
          name,
          value,
          domain: parsedUrl.hostname,
          path: '/',
          httpOnly: true,
          secure: parsedUrl.protocol === 'https:',
          sameSite: 'Lax',
        }
      })
      .filter(Boolean)
    if (cookies.length) {
      await context.addCookies(cookies)
    }

    const page = await context.newPage()
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    const body = await page.content()
    const finalUrl = page.url()
    if (isVercelProtectionResponse({ status: response?.status() ?? 0, url: finalUrl, body })) {
      return {
        ok: false,
        status: 'blocked_by_protection',
        reason: 'Preview returned Vercel Deployment Protection during browser smoke.',
      }
    }
    if (!response || response.status() >= 400) {
      return {
        ok: false,
        status: 'failed',
        reason: `Preview browser smoke returned HTTP ${response?.status() ?? '<no response>'}.`,
      }
    }
    const root = await page.locator('#root').count()
    if (root < 1 || !body.includes('/assets/')) {
      return {
        ok: false,
        status: 'failed',
        reason: 'Preview did not look like the Vite app shell.',
      }
    }
    return {
      ok: true,
      status: 'passed',
      reason: 'Preview app shell loaded through browser smoke.',
    }
  } finally {
    await browser.close()
  }
}

export async function runPreviewSmoke({ env = process.env } = {}) {
  const config = resolvePreviewSmokeConfig(env)
  const report = {
    checkedAt: new Date().toISOString(),
    previewUrl: config.previewUrl,
    status: 'failed',
    strict: config.strict,
    bypassConfigured: Boolean(config.bypassSecret),
  }

  if (config.disabled) {
    report.status = 'skipped'
    report.reason = 'VERCEL_PREVIEW_SMOKE_DISABLED=true.'
    writeReport(report)
    return report
  }

  if (!config.previewUrl) {
    report.reason = 'VERCEL_PREVIEW_URL is required.'
    writeReport(report)
    return report
  }

  let parsedUrl
  try {
    parsedUrl = new URL(config.previewUrl)
  } catch {
    report.reason = 'VERCEL_PREVIEW_URL must be a valid URL.'
    writeReport(report)
    return report
  }

  if (parsedUrl.protocol !== 'https:' && config.strict) {
    report.reason = 'Strict preview smoke requires an HTTPS preview URL.'
    writeReport(report)
    return report
  }

  const cookies = await requestBypassCookie(config.previewUrl, config.bypassSecret)
  const response = await fetchWithBypass(config.previewUrl, config.bypassSecret, cookies)
  const body = await response.text()
  const responseCookies = extractBypassCookies(response.headers)
  const allCookies = [...cookies, ...responseCookies]
  report.httpStatus = response.status
  report.finalUrl = response.url
  report.bypassCookieCount = allCookies.length

  if (isVercelProtectionResponse({ status: response.status, url: response.url, body })) {
    report.status = 'blocked_by_protection'
    report.reason = config.bypassSecret
      ? 'Preview still returned Vercel Deployment Protection with the bypass secret.'
      : 'Preview is protected and VERCEL_AUTOMATION_BYPASS_SECRET is not configured.'
    writeReport(report)
    return report
  }

  if (!response.ok) {
    report.status = 'failed'
    report.reason = `Preview returned HTTP ${response.status}.`
    writeReport(report)
    return report
  }

  const browserResult = await verifyWithPlaywright(config.previewUrl, config.bypassSecret, allCookies)
  report.status = browserResult.status
  report.reason = browserResult.reason
  writeReport(report)
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPreviewSmoke()
    .then((report) => {
      if (report.status === 'passed' || (report.status === 'skipped' && !report.strict)) {
        console.log(`Vercel preview smoke ${report.status}: ${report.previewUrl || '<none>'}`)
        return
      }
      console.error(`Vercel preview smoke ${report.status}: ${report.reason}`)
      process.exit(1)
    })
    .catch((error) => {
      const report = {
        checkedAt: new Date().toISOString(),
        previewUrl: process.env.VERCEL_PREVIEW_URL ?? '',
        status: 'failed',
        strict: process.env.VERCEL_PREVIEW_PROOF_STRICT !== 'false',
        reason: error instanceof Error ? error.message : String(error),
      }
      writeReport(report)
      console.error(`Vercel preview smoke failed: ${report.reason}`)
      process.exit(1)
    })
}
