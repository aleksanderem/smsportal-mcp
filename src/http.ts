import { isIP } from 'node:net'
import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { PortalClient, PortalError, apiUrl } from './client.js'
import { createPortalServer } from './server.js'

export interface HttpConfig { apiBase: string; publicOrigin: string; readOnly?: boolean; trustProxy?: boolean; requestsPerMinute?: number }

export function createHttpApp(config: HttpConfig) {
  const base = apiUrl(config.apiBase)
  const originUrl = new URL(config.publicOrigin)
  if (config.publicOrigin !== originUrl.origin) throw new Error('SMSPORTAL_PUBLIC_ORIGIN must be an origin without path.')
  const allowedHosts = new Set([originUrl.host, 'localhost', '127.0.0.1'])
  const app = express()
  app.disable('x-powered-by')
  // Enable only when the listener is reachable exclusively through the known proxy.
  if (config.trustProxy) app.set('trust proxy', 1)
  const buckets = new Map<string, { count: number; expires: number }>()
  const requestLimit = config.requestsPerMinute ?? 60
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }) })
  // Native MCP clients typically omit Origin. Browser requests must match the configured site.
  app.use('/mcp', (req, res, next) => {
    if (!allowedHosts.has((req.headers.host || '').split(':')[0]) && req.headers.host !== originUrl.host) {
      res.status(403).json({ error: 'Host not allowed' }); return
    }
    if (req.headers.origin && req.headers.origin !== originUrl.origin) {
      res.status(403).json({ error: 'Origin not allowed' }); return
    }
    if (req.method !== 'POST') { res.status(405).setHeader('Allow', 'POST'); res.end(); return }
    const address = req.ip || req.socket.remoteAddress || ''
    if (!isIP(address)) { res.status(400).json({ error: 'Invalid caller address.' }); return }
    const bucketKey = callerNetwork(address)
    const now = Date.now()
    let bucket = buckets.get(bucketKey)
    if (!bucket || bucket.expires <= now) {
      // Bound memory without timers or allowing address rotation to evict active buckets.
      if (buckets.size >= 10000) {
        for (const [key, entry] of buckets) if (entry.expires <= now) buckets.delete(key)
        if (buckets.size >= 10000) { res.status(429).setHeader('Retry-After', '60'); res.end(); return }
      }
      bucket = { count: 0, expires: now + 60000 }
      buckets.set(bucketKey, bucket)
    }
    if (++bucket.count > requestLimit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.expires - now) / 1000))))
      res.status(429).json({ error: 'MCP request limit reached. Wait before retrying.' }); return
    }
    next()
  })
  app.use(express.json({ limit: '128kb' }))
  app.all('/mcp', async (req, res) => {
    const match = /^Bearer ([^\s]{1,512})$/.exec(req.headers.authorization || '')
    if (!match) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="smsportal"')
      res.status(401).json({ error: 'Provide your SMS Portal API key as Authorization: Bearer <key>.' }); return
    }
    const client = new PortalClient(base, match[1], 15000, req.ip || req.socket.remoteAddress)
    // Validate even discovery/initialization: no public unauthenticated MCP session.
    try { await client.request('/gateway/stats') } catch (error) {
      const status = error instanceof PortalError && [401, 403, 429].includes(error.status) ? error.status : 503
      if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="smsportal"')
      res.status(status).json({ error: status === 401 ? 'Invalid or revoked SMS Portal API key.' : 'SMS Portal authentication unavailable.' }); return
    }
    // Each request gets its own key and server. Nothing carries another user's auth into the next call.
    const server = createPortalServer(client, config.readOnly)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => { void transport.close(); void server.close() })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed.' })
    }
  })
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof error === 'object' && error !== null && 'status' in error && error.status === 413 ? 413 : 400
    res.status(status).json({ error: status === 413 ? 'Request too large.' : 'Invalid JSON request.' })
  })
  return app
}

/** Group a rotating IPv6 interface into its /64, matching the API throttle. */
function callerNetwork(address: string): string {
  if (address.startsWith('::ffff:') && isIP(address.slice(7)) === 4) return address.slice(7)
  if (isIP(address) === 4) return address
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1)
  const [left, right] = normalized.split('::')
  const head = left ? left.split(':') : []
  const tail = right ? right.split(':') : []
  const groups = normalized.includes('::') ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head
  return `${groups.slice(0, 4).join(':')}::/64`
}
