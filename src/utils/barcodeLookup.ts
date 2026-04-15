import type { ActionResult, BarcodeLookupResult } from '../types'
import { fetchFoodByBarcode as fetchOpenFoodFactsBarcode } from './openFoodFacts'

export async function lookupBarcodeAcrossCatalogs(
  barcode: string,
): Promise<ActionResult<BarcodeLookupResult>> {
  const normalizedBarcode = barcode.replace(/\D/g, '')
  if (normalizedBarcode.length < 8) {
    return {
      ok: false,
      error: {
        code: 'invalidBarcode',
        message: 'Enter a valid barcode with at least 8 digits.',
      },
    }
  }

  try {
    const url = new URL('/api/food-catalog/barcode', window.location.origin)
    url.searchParams.set('barcode', normalizedBarcode)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (response.ok) {
      const payload = (await response.json()) as BarcodeLookupResult
      return {
        ok: true,
        data: payload,
      }
    }
  } catch {
    // Fall back to the legacy direct OFF lookup when the local route is unavailable.
  }

  return fetchOpenFoodFactsBarcode(normalizedBarcode)
}
