import type { ActionResult, BarcodeLookupResult } from '../types'
import { fetchFoodByBarcode as fetchOpenFoodFactsBarcode } from './openFoodFacts'

export async function lookupBarcodeAcrossCatalogs(
  barcode: string,
): Promise<ActionResult<BarcodeLookupResult>> {
  return fetchOpenFoodFactsBarcode(barcode)
}

