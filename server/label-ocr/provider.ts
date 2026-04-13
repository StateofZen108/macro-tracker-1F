/// <reference types="node" />

export const LABEL_OCR_SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const GEMINI_LABEL_OCR_MODEL = 'gemini-2.5-flash'
export const GEMINI_LABEL_OCR_PLACEHOLDER_MODEL = 'gemini-placeholder'

export type LabelOcrProviderName = 'gemini'
export type LabelOcrMimeType = (typeof LABEL_OCR_SUPPORTED_MIME_TYPES)[number]
export type LabelOcrStatus = 'success' | 'placeholder' | 'not-configured' | 'invalid-request'
export type LabelOcrConfidence = 'high' | 'medium' | 'low' | 'unknown'
export type LabelOcrFieldStatus = 'present' | 'missing' | 'estimated'
export type LabelOcrNumericUnit = 'kcal' | 'g' | 'mg' | 'mcg' | 'servings'

export interface LabelOcrImageInput {
  mimeType: LabelOcrMimeType
  base64Data: string
  fileName?: string
  byteLength?: number
}

export interface LabelOcrRequest {
  provider: LabelOcrProviderName
  documentType: 'nutrition-label'
  image: LabelOcrImageInput
  locale?: string
  hints?: {
    brand?: string
    productName?: string
    market?: string
  }
}

export interface LabelOcrTextField {
  value: string | null
  status: LabelOcrFieldStatus
  confidence: LabelOcrConfidence
  sourceText: string | null
}

export interface LabelOcrNumericField {
  value: number | null
  unit: LabelOcrNumericUnit
  status: LabelOcrFieldStatus
  confidence: LabelOcrConfidence
  sourceText: string | null
}

export interface LabelOcrNutritionFields {
  servingSizeText: LabelOcrTextField
  servingsPerContainer: LabelOcrNumericField
  calories: LabelOcrNumericField
  protein: LabelOcrNumericField
  carbs: LabelOcrNumericField
  fat: LabelOcrNumericField
  fiber: LabelOcrNumericField
  sugar: LabelOcrNumericField
  sodium: LabelOcrNumericField
}

export interface LabelOcrFoodCandidate {
  name: string | null
  brand: string | null
  servingSize: number | null
  servingUnit: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
}

export interface LabelOcrWarning {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

export interface LabelOcrImageSummary {
  mimeType: LabelOcrMimeType
  fileName: string | null
  byteLength: number | null
}

export interface LabelOcrResponse {
  provider: LabelOcrProviderName
  status: LabelOcrStatus
  model: typeof GEMINI_LABEL_OCR_MODEL | typeof GEMINI_LABEL_OCR_PLACEHOLDER_MODEL
  message: string
  extractedAt: string
  image: LabelOcrImageSummary
  candidate: LabelOcrFoodCandidate | null
  fields: LabelOcrNutritionFields
  rawText: string | null
  warnings: LabelOcrWarning[]
}

export interface LabelOcrProviderAdapter {
  name: LabelOcrProviderName
  isConfigured(): boolean
  extract(input: LabelOcrRequest): Promise<LabelOcrResponse>
}

interface GeminiJsonTextField {
  value?: string | null
  status?: LabelOcrFieldStatus | null
  confidence?: LabelOcrConfidence | null
  sourceText?: string | null
}

interface GeminiJsonNumericField {
  value?: number | null
  unit?: string | null
  status?: LabelOcrFieldStatus | null
  confidence?: LabelOcrConfidence | null
  sourceText?: string | null
}

interface GeminiJsonPayload {
  message?: string | null
  candidate?: {
    name?: string | null
    brand?: string | null
    servingSize?: number | null
    servingUnit?: string | null
    calories?: number | null
    protein?: number | null
    carbs?: number | null
    fat?: number | null
    fiber?: number | null
  } | null
  fields?: {
    servingSizeText?: GeminiJsonTextField | null
    servingsPerContainer?: GeminiJsonNumericField | null
    calories?: GeminiJsonNumericField | null
    protein?: GeminiJsonNumericField | null
    carbs?: GeminiJsonNumericField | null
    fat?: GeminiJsonNumericField | null
    fiber?: GeminiJsonNumericField | null
    sugar?: GeminiJsonNumericField | null
    sodium?: GeminiJsonNumericField | null
  } | null
  rawText?: string | null
  warnings?: Array<{
    code?: string | null
    severity?: 'info' | 'warning' | 'error' | null
    message?: string | null
  }> | null
}

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LABEL_OCR_MODEL}:generateContent`

const GEMINI_JSON_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    candidate: {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'] },
        brand: { type: ['string', 'null'] },
        servingSize: { type: ['number', 'null'] },
        servingUnit: { type: ['string', 'null'] },
        calories: { type: ['number', 'null'] },
        protein: { type: ['number', 'null'] },
        carbs: { type: ['number', 'null'] },
        fat: { type: ['number', 'null'] },
        fiber: { type: ['number', 'null'] },
      },
      required: [
        'name',
        'brand',
        'servingSize',
        'servingUnit',
        'calories',
        'protein',
        'carbs',
        'fat',
        'fiber',
      ],
    },
    fields: {
      type: 'object',
      properties: {
        servingSizeText: {
          type: 'object',
          properties: {
            value: { type: ['string', 'null'] },
            status: { type: 'string', enum: ['present', 'missing', 'estimated'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] },
            sourceText: { type: ['string', 'null'] },
          },
          required: ['value', 'status', 'confidence', 'sourceText'],
        },
        servingsPerContainer: {
          type: 'object',
          properties: {
            value: { type: ['number', 'null'] },
            unit: { type: 'string' },
            status: { type: 'string', enum: ['present', 'missing', 'estimated'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] },
            sourceText: { type: ['string', 'null'] },
          },
          required: ['value', 'unit', 'status', 'confidence', 'sourceText'],
        },
        calories: {
          type: 'object',
          properties: {
            value: { type: ['number', 'null'] },
            unit: { type: 'string' },
            status: { type: 'string', enum: ['present', 'missing', 'estimated'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] },
            sourceText: { type: ['string', 'null'] },
          },
          required: ['value', 'unit', 'status', 'confidence', 'sourceText'],
        },
        protein: {
          type: 'object',
          properties: {
            value: { type: ['number', 'null'] },
            unit: { type: 'string' },
            status: { type: 'string', enum: ['present', 'missing', 'estimated'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] },
            sourceText: { type: ['string', 'null'] },
          },
          required: ['value', 'unit', 'status', 'confidence', 'sourceText'],
        },
        carbs: {
          type: 'object',
          properties: {
            value: { type: ['number', 'null'] },
            unit: { type: 'string' },
            status: { type: 'string', enum: ['present', 'missing', 'estimated'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] },
            sourceText: { type: ['string', 'null'] },
          },
          required: ['value', 'unit', 'status', 'confidence', 'sourceText'],
        },
        fat: {
          type: 'object',
          properties: {
            value: { type: ['number', 'null'] },
            unit: { type: 'string' },
            status: { type: 'string', enum: ['present', 'missing', 'estimated'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] },
            sourceText: { type: ['string', 'null'] },
          },
          required: ['value', 'unit', 'status', 'confidence', 'sourceText'],
        },
        fiber: {
          type: 'object',
          properties: {
            value: { type: ['number', 'null'] },
            unit: { type: 'string' },
            status: { type: 'string', enum: ['present', 'missing', 'estimated'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] },
            sourceText: { type: ['string', 'null'] },
          },
          required: ['value', 'unit', 'status', 'confidence', 'sourceText'],
        },
        sugar: {
          type: 'object',
          properties: {
            value: { type: ['number', 'null'] },
            unit: { type: 'string' },
            status: { type: 'string', enum: ['present', 'missing', 'estimated'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] },
            sourceText: { type: ['string', 'null'] },
          },
          required: ['value', 'unit', 'status', 'confidence', 'sourceText'],
        },
        sodium: {
          type: 'object',
          properties: {
            value: { type: ['number', 'null'] },
            unit: { type: 'string' },
            status: { type: 'string', enum: ['present', 'missing', 'estimated'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] },
            sourceText: { type: ['string', 'null'] },
          },
          required: ['value', 'unit', 'status', 'confidence', 'sourceText'],
        },
      },
      required: [
        'servingSizeText',
        'servingsPerContainer',
        'calories',
        'protein',
        'carbs',
        'fat',
        'fiber',
        'sugar',
        'sodium',
      ],
    },
    rawText: { type: ['string', 'null'] },
    warnings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning', 'error'] },
          message: { type: 'string' },
        },
        required: ['code', 'severity', 'message'],
      },
    },
  },
  required: ['message', 'candidate', 'fields', 'rawText', 'warnings'],
} as const

const OCR_PROMPT = [
  'You are extracting nutrition-label data from a single packaged food image.',
  'Return only JSON that matches the provided schema.',
  'Rules:',
  '- Extract values only if visible in the image.',
  '- Use null for unknown or unreadable values.',
  '- Do not invent the food name or brand if they are not visible.',
  '- Prefer per-serving values for candidate calories, protein, carbs, fat, and fiber when a serving panel is visible.',
  '- servingSizeText should preserve the label wording when visible, such as "55 g" or "2 cookies".',
  '- servingsPerContainer should be numeric only when readable.',
  '- For field status use present when directly visible, estimated when inferred from nearby label context, and missing when not found.',
  '- For confidence use high, medium, low, or unknown.',
  '- sugar means total sugars.',
  '- Include concise warnings for anything ambiguous or inferred.',
  '- rawText should be a compact transcription of the nutrition rows you used.',
].join('\n')

export class LabelOcrProviderError extends Error {
  code: string

  status: number

  constructor(code: string, message: string, status = 502) {
    super(message)
    this.name = 'LabelOcrProviderError'
    this.code = code
    this.status = status
  }
}

function stripDataUrlPrefix(base64Data: string): string {
  const separatorIndex = base64Data.indexOf(',')
  if (base64Data.startsWith('data:') && separatorIndex !== -1) {
    return base64Data.slice(separatorIndex + 1)
  }

  return base64Data
}

export function estimateBase64ByteLength(base64Data: string): number {
  const normalized = stripDataUrlPrefix(base64Data).trim()
  if (!normalized) {
    return 0
  }

  const paddingMatches = normalized.match(/=+$/)
  const paddingLength = paddingMatches ? paddingMatches[0].length : 0
  return Math.floor((normalized.length * 3) / 4) - paddingLength
}

function buildTextField(): LabelOcrTextField {
  return {
    value: null,
    status: 'missing',
    confidence: 'unknown',
    sourceText: null,
  }
}

function buildNumericField(unit: LabelOcrNumericUnit): LabelOcrNumericField {
  return {
    value: null,
    unit,
    status: 'missing',
    confidence: 'unknown',
    sourceText: null,
  }
}

export function createEmptyNutritionFields(): LabelOcrNutritionFields {
  return {
    servingSizeText: buildTextField(),
    servingsPerContainer: buildNumericField('servings'),
    calories: buildNumericField('kcal'),
    protein: buildNumericField('g'),
    carbs: buildNumericField('g'),
    fat: buildNumericField('g'),
    fiber: buildNumericField('g'),
    sugar: buildNumericField('g'),
    sodium: buildNumericField('mg'),
  }
}

export function createImageSummary(image?: LabelOcrImageInput): LabelOcrImageSummary {
  if (!image) {
    return {
      mimeType: 'image/jpeg',
      fileName: null,
      byteLength: null,
    }
  }

  return {
    mimeType: image.mimeType,
    fileName: image.fileName ?? null,
    byteLength: image.byteLength ?? estimateBase64ByteLength(image.base64Data),
  }
}

export function createEmptyFoodCandidate(): LabelOcrFoodCandidate {
  return {
    name: null,
    brand: null,
    servingSize: null,
    servingUnit: null,
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    fiber: null,
  }
}

export function getGeminiApiKey(): string | null {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? null
  if (!apiKey) {
    return null
  }

  const trimmed = apiKey.trim()
  return trimmed ? trimmed : null
}

export function validateLabelOcrRequest(input: LabelOcrRequest): string | null {
  if (input.provider !== 'gemini') {
    return 'Only the Gemini OCR provider is supported in this build.'
  }

  if (input.documentType !== 'nutrition-label') {
    return 'The OCR endpoint accepts only nutrition-label documents.'
  }

  if (!LABEL_OCR_SUPPORTED_MIME_TYPES.includes(input.image.mimeType)) {
    return `Unsupported image mime type: ${String(input.image.mimeType)}.`
  }

  const normalizedBase64 = stripDataUrlPrefix(input.image.base64Data).trim()
  if (!normalizedBase64) {
    return 'A single nutrition-label image is required.'
  }

  if (input.image.byteLength !== undefined && input.image.byteLength <= 0) {
    return 'Image byteLength must be greater than zero when provided.'
  }

  return null
}

export function buildNotConfiguredResponse(
  provider: LabelOcrProviderName,
  input?: Pick<LabelOcrRequest, 'image'>,
): LabelOcrResponse {
  return {
    provider,
    status: 'not-configured',
    model: GEMINI_LABEL_OCR_PLACEHOLDER_MODEL,
    message: 'Gemini OCR credentials are not configured for this environment.',
    extractedAt: new Date().toISOString(),
    image: createImageSummary(input?.image),
    candidate: null,
    fields: createEmptyNutritionFields(),
    rawText: null,
    warnings: [
      {
        code: 'provider-not-configured',
        severity: 'info',
        message: 'Set GEMINI_API_KEY or GOOGLE_API_KEY to enable live Gemini OCR extraction.',
      },
    ],
  }
}

export function buildInvalidRequestResponse(
  message: string,
  input?: Partial<Pick<LabelOcrRequest, 'image'>>,
): LabelOcrResponse {
  return {
    provider: 'gemini',
    status: 'invalid-request',
    model: GEMINI_LABEL_OCR_PLACEHOLDER_MODEL,
    message,
    extractedAt: new Date().toISOString(),
    image: createImageSummary(input?.image),
    candidate: null,
    fields: createEmptyNutritionFields(),
    rawText: null,
    warnings: [
      {
        code: 'invalid-request',
        severity: 'error',
        message,
      },
    ],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeFieldStatus(value: unknown): LabelOcrFieldStatus {
  return value === 'present' || value === 'estimated' || value === 'missing' ? value : 'missing'
}

function normalizeConfidence(value: unknown): LabelOcrConfidence {
  return value === 'high' || value === 'medium' || value === 'low' || value === 'unknown'
    ? value
    : 'unknown'
}

function normalizeNumericUnit(
  value: unknown,
  fallback: LabelOcrNumericUnit,
): LabelOcrNumericUnit {
  return value === 'kcal' ||
    value === 'g' ||
    value === 'mg' ||
    value === 'mcg' ||
    value === 'servings'
    ? value
    : fallback
}

function normalizeTextField(field: GeminiJsonTextField | null | undefined): LabelOcrTextField {
  return {
    value: readString(field?.value),
    status: normalizeFieldStatus(field?.status),
    confidence: normalizeConfidence(field?.confidence),
    sourceText: readString(field?.sourceText),
  }
}

function normalizeNumericField(
  field: GeminiJsonNumericField | null | undefined,
  fallbackUnit: LabelOcrNumericUnit,
): LabelOcrNumericField {
  return {
    value: readNumber(field?.value),
    unit: normalizeNumericUnit(field?.unit, fallbackUnit),
    status: normalizeFieldStatus(field?.status),
    confidence: normalizeConfidence(field?.confidence),
    sourceText: readString(field?.sourceText),
  }
}

function normalizeWarnings(
  warnings: GeminiJsonPayload['warnings'],
  fallbackMessage: string,
): LabelOcrWarning[] {
  const normalizedWarnings =
    warnings?.flatMap((warning, index) => {
      const message = readString(warning?.message)
      if (!message) {
        return []
      }

      return [
        {
          code: readString(warning?.code) ?? `warning-${index + 1}`,
          severity:
            warning?.severity === 'info' ||
            warning?.severity === 'warning' ||
            warning?.severity === 'error'
              ? warning.severity
              : 'warning',
          message,
        },
      ]
    }) ?? []

  if (normalizedWarnings.length > 0) {
    return normalizedWarnings
  }

  return [
    {
      code: 'review-required',
      severity: 'info',
      message: fallbackMessage,
    },
  ]
}

function extractResponseText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) {
    return null
  }

  for (const candidate of payload.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      continue
    }

    for (const part of candidate.content.parts) {
      if (isRecord(part) && typeof part.text === 'string' && part.text.trim()) {
        return part.text.trim()
      }
    }
  }

  return null
}

function parseJsonText(value: string): GeminiJsonPayload | null {
  const directCandidate = value.trim()
  const candidates = [directCandidate]

  if (directCandidate.startsWith('```')) {
    const fenced = directCandidate
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    if (fenced && fenced !== directCandidate) {
      candidates.push(fenced)
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as GeminiJsonPayload
      if (isRecord(parsed)) {
        return parsed
      }
    } catch {
      continue
    }
  }

  return null
}

function buildPrompt(input: LabelOcrRequest): string {
  const hintLines = [
    input.locale ? `Expected market locale: ${input.locale}.` : null,
    input.hints?.brand ? `Known brand hint: ${input.hints.brand}.` : null,
    input.hints?.productName ? `Known product name hint: ${input.hints.productName}.` : null,
    input.hints?.market ? `Known market hint: ${input.hints.market}.` : null,
  ].filter((line): line is string => Boolean(line))

  return [OCR_PROMPT, ...hintLines].join('\n')
}

function buildSuccessResponse(
  input: LabelOcrRequest,
  payload: GeminiJsonPayload,
): LabelOcrResponse {
  const message = readString(payload.message) ?? 'OCR draft ready for review.'
  const candidate = payload.candidate
    ? {
        name: readString(payload.candidate.name),
        brand: readString(payload.candidate.brand),
        servingSize: readNumber(payload.candidate.servingSize),
        servingUnit: readString(payload.candidate.servingUnit),
        calories: readNumber(payload.candidate.calories),
        protein: readNumber(payload.candidate.protein),
        carbs: readNumber(payload.candidate.carbs),
        fat: readNumber(payload.candidate.fat),
        fiber: readNumber(payload.candidate.fiber),
      }
    : createEmptyFoodCandidate()

  const fields = payload.fields
    ? {
        servingSizeText: normalizeTextField(payload.fields.servingSizeText),
        servingsPerContainer: normalizeNumericField(payload.fields.servingsPerContainer, 'servings'),
        calories: normalizeNumericField(payload.fields.calories, 'kcal'),
        protein: normalizeNumericField(payload.fields.protein, 'g'),
        carbs: normalizeNumericField(payload.fields.carbs, 'g'),
        fat: normalizeNumericField(payload.fields.fat, 'g'),
        fiber: normalizeNumericField(payload.fields.fiber, 'g'),
        sugar: normalizeNumericField(payload.fields.sugar, 'g'),
        sodium: normalizeNumericField(payload.fields.sodium, 'mg'),
      }
    : createEmptyNutritionFields()

  return {
    provider: 'gemini',
    status: 'success',
    model: GEMINI_LABEL_OCR_MODEL,
    message,
    extractedAt: new Date().toISOString(),
    image: createImageSummary(input.image),
    candidate,
    fields,
    rawText: readString(payload.rawText),
    warnings: normalizeWarnings(payload.warnings, message),
  }
}

async function callGeminiApi(input: LabelOcrRequest, apiKey: string): Promise<GeminiJsonPayload> {
  const normalizedBase64 = stripDataUrlPrefix(input.image.base64Data).trim()
  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildPrompt(input) },
            {
              inline_data: {
                mime_type: input.image.mimeType,
                data: normalizedBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: GEMINI_JSON_SCHEMA,
        temperature: 0.1,
      },
    }),
  })

  const payload = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    const message =
      isRecord(payload) &&
      isRecord(payload.error) &&
      typeof payload.error.message === 'string' &&
      payload.error.message.trim()
        ? payload.error.message.trim()
        : `Gemini OCR request failed with status ${response.status}.`
    throw new LabelOcrProviderError('providerUnavailable', message, 502)
  }

  const responseText = extractResponseText(payload)
  if (!responseText) {
    throw new LabelOcrProviderError(
      'malformedProviderResponse',
      'Gemini OCR returned no structured text payload.',
      502,
    )
  }

  const parsedPayload = parseJsonText(responseText)
  if (!parsedPayload) {
    throw new LabelOcrProviderError(
      'malformedProviderResponse',
      'Gemini OCR returned malformed JSON for the nutrition label review payload.',
      502,
    )
  }

  return parsedPayload
}

class GeminiLabelOcrProvider implements LabelOcrProviderAdapter {
  readonly name = 'gemini' as const

  isConfigured(): boolean {
    return getGeminiApiKey() !== null
  }

  async extract(input: LabelOcrRequest) {
    const apiKey = getGeminiApiKey()
    if (!apiKey) {
      return buildNotConfiguredResponse(this.name, input)
    }

    const geminiPayload = await callGeminiApi(input, apiKey)
    return buildSuccessResponse(input, geminiPayload)
  }
}

const provider = new GeminiLabelOcrProvider()

export async function extractNutritionLabel(input: LabelOcrRequest) {
  const validationError = validateLabelOcrRequest(input)
  if (validationError) {
    return buildInvalidRequestResponse(validationError, input)
  }

  return provider.extract(input)
}
