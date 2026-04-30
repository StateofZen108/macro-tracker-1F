import { buildDraftAiMealCapture } from '../../src/domain/aiMealCapture.js'
import { ApiError, jsonResponse } from '../../server/http/errors.js'
import { withApiMiddleware } from '../../server/http/apiMiddleware.js'
import { API_ROUTE_CONFIGS } from '../../server/http/routeConfigs.js'

export const runtime = 'nodejs'

interface MealAiAnalyzeBody {
  imageEvidenceId?: string
  textHint?: string
  fileName?: string
}

async function handlePost(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as MealAiAnalyzeBody | null
  const imageEvidenceId = body?.imageEvidenceId?.trim()

  if (!imageEvidenceId) {
    throw new ApiError(400, 'missingImageEvidence', 'Provide an image evidence ID.')
  }

  const result = buildDraftAiMealCapture({
    imageEvidenceId,
    textHint: body?.textHint,
    fileName: body?.fileName,
  })

  return jsonResponse(200, {
    result,
  })
}

export default withApiMiddleware(API_ROUTE_CONFIGS.mealAiAnalyze, handlePost)
