import type { ActionResult, RemoteCatalogResponse } from '../types'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } }
}

export async function searchRemoteFoodCatalog(input: {
  query: string
  limit?: number
  cursor?: string
  locale?: 'en-GB' | 'en-US'
}): Promise<ActionResult<RemoteCatalogResponse>> {
  const query = input.query.trim()
  if (!query) {
    return fail('invalidSearchQuery', 'Enter a search term first.')
  }

  const url = new URL('/api/food-catalog/search', window.location.origin)
  url.searchParams.set('q', query)
  if (typeof input.limit === 'number') {
    url.searchParams.set('limit', `${input.limit}`)
  }
  if (input.locale) {
    url.searchParams.set('locale', input.locale)
  }
  if (input.cursor) {
    url.searchParams.set('cursor', input.cursor)
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return fail('foodCatalogSearchFailed', 'Unable to search the food catalog right now.')
    }

    const payload = (await response.json()) as RemoteCatalogResponse
    return ok(payload)
  } catch {
    return fail('foodCatalogSearchFailed', 'Unable to search the food catalog right now.')
  }
}
