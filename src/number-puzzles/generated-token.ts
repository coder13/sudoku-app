const tokenPattern = /^(?:v1\.[A-Za-z0-9_-]{1,1800}|v2\.[A-Za-z0-9_-]{1,1800}\.[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/

export function generatedNumberToken(value: unknown): string | undefined {
  return typeof value === 'string' && tokenPattern.test(value) ? value : undefined
}
