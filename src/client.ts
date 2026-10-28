import { isIP } from 'node:net'
export class PortalError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

export function apiUrl(value: string): string {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('SMSPORTAL_API_URL must be an http(s) URL without credentials, query or fragment.')
  }
  return url.href.replace(/\/$/, '')
}

/** The origin is operator configuration. Tool inputs cannot select a URL or headers. */
export class PortalClient {
  private readonly base: string
  constructor(base: string, private readonly key: string, private readonly timeoutMs = 15000, private readonly callerIp?: string) {
    this.base = apiUrl(base)
    if (!key || /[\s\r\n]/.test(key) || key.length > 512) throw new Error('A valid SMSPORTAL_API_KEY is required.')
    if (callerIp !== undefined && !isIP(callerIp)) throw new Error('Invalid caller address.')
  }

  async request(path: string, query: Record<string, unknown> = {}, body?: unknown): Promise<unknown> {
    const url = new URL(`${this.base}${path}`)
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(name, String(value))
    }
    let response: Response
    try {
      response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'x-api-key': this.key, ...(this.callerIp && { 'x-forwarded-for': this.callerIp }), accept: 'application/json', ...(body !== undefined && { 'content-type': 'application/json' }) },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      throw new PortalError(503, body === undefined
        ? 'SMS Portal is unavailable. Check the configured server and try again later.'
        : 'The send outcome is unknown. Check message history before retrying; a retry could send a duplicate SMS.')
    }
    if (!response.ok) {
      await response.body?.cancel()
      const messages: Record<number, string> = {
        400: 'Invalid request or no enabled sending phone. Check inputs and your phone configuration.',
        401: 'Invalid or revoked API key, or blocked account. Create a valid key in your SMS Portal account.',
        403: 'This API key does not permit the operation.',
        404: 'Device or SMS batch not found on this account.',
        429: 'SMS Portal rate or plan limit reached. Check your account usage before retrying.',
      }
      throw new PortalError(response.status, messages[response.status] || (body === undefined
        ? 'SMS Portal returned an error. Try again later.'
        : 'The send outcome is unknown. Check message history before retrying.'))
    }
    // Bound memory use even if an upstream/proxy returns an unexpectedly large response.
    const reader = response.body?.getReader()
    if (!reader) throw new PortalError(502, 'SMS Portal returned an empty response.')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length
        if (size > 1_000_000) {
          await reader.cancel()
          throw new Error('Response too large')
        }
        chunks.push(value)
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    } catch {
      throw new PortalError(502, body === undefined
        ? 'Unexpected SMS Portal response. Narrow your filters or reduce limit.'
        : 'Could not read the send response. Check message history before retrying; acceptance is unknown.')
    }
  }
}
