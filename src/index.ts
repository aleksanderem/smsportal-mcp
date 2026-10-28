#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { PortalClient } from './client.js'
import { createPortalServer } from './server.js'
import { createHttpApp } from './http.js'

const base = process.env.SMSPORTAL_API_URL || 'https://smsportal.app/api/v1'
const readOnly = process.env.SMSPORTAL_READ_ONLY === 'true'
if (process.argv.includes('--http')) {
  const host = process.env.HOST || '127.0.0.1'
  const port = Number(process.env.PORT || 3002)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  const app = createHttpApp({ apiBase: base, publicOrigin: process.env.SMSPORTAL_PUBLIC_ORIGIN || 'http://localhost:18080', readOnly, trustProxy: process.env.SMSPORTAL_TRUST_PROXY === 'true' })
  const http = app.listen(port, host, () => console.error(`smsportal MCP HTTP listening on port ${port}`))
  const stop = () => { http.close(); setTimeout(() => process.exit(0), 5000).unref() }
  process.on('SIGTERM', stop); process.on('SIGINT', stop)
} else {
  const server = createPortalServer(new PortalClient(base, process.env.SMSPORTAL_API_KEY || ''), readOnly)
  await server.connect(new StdioServerTransport())
}
