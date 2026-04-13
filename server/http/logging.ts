interface ApiLogEvent {
  event: string
  status: number
  latencyMs: number
  scope?: string
  recordId?: string
  deviceId?: string
  message?: string
}

export function logApiEvent(event: ApiLogEvent): void {
  const payload = {
    timestamp: new Date().toISOString(),
    ...event,
  }

  const output = JSON.stringify(payload)
  if (event.status >= 500) {
    console.error(output)
    return
  }

  console.info(output)
}
