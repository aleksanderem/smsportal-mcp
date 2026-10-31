# SMS Portal|app MCP server

Send and read SMS from your own Android phone through AI agents such as Claude, Cursor or any
other [Model Context Protocol](https://modelcontextprotocol.io) client.

[smsportal.app](https://smsportal.app) turns an Android phone into an SMS gateway: messages go out
from your own number and SIM, and incoming SMS are available through the API. This server exposes
that account to AI agents. It is not affiliated with SMSPortal (Pty) Ltd of South Africa.

## Use the hosted server (recommended)

1. Create an account at [smsportal.app](https://smsportal.app), pair your Android phone and create an
   API key in the dashboard.
2. Add the server to your client.

**Claude Code**

```sh
claude mcp add --transport http smsportal https://smsportal.app/mcp \
  --header "Authorization: Bearer $SMSPORTAL_API_KEY"
```

**Claude Desktop and other clients without custom headers** (via `mcp-remote`, Node.js 18+)

```json
{
  "mcpServers": {
    "smsportal": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://smsportal.app/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer YOUR_SMSPORTAL_API_KEY" }
    }
  }
}
```

Step-by-step guide: [smsportal.app/en/integrations/mcp](https://smsportal.app/en/integrations/mcp).

## Tools

| Tool | What it does |
|---|---|
| `smsportal_list_devices` | Phones paired with the account and their last heartbeat and SIM state |
| `smsportal_get_stats` | Sent, received and device totals |
| `smsportal_list_messages` | Search sent and received SMS by text, number, phone, status and time |
| `smsportal_read_received_sms` | Incoming SMS already synchronised by the phone |
| `smsportal_get_send_status` | Per-recipient status of a batch returned by `smsportal_send_sms` |
| `smsportal_send_sms` | Send an exact message to up to 50 E.164 numbers from your phone |

API acceptance is not proof of delivery; check the send status afterwards. Set
`SMSPORTAL_READ_ONLY=true` to remove the sending tool.

## Run it yourself

```sh
git clone https://github.com/aleksanderem/smsportal-mcp && cd smsportal-mcp
npm ci && npm run build
```

Local (stdio) client entry:

```json
{
  "mcpServers": {
    "smsportal": {
      "command": "node",
      "args": ["/path/to/smsportal-mcp/dist/index.js"],
      "env": { "SMSPORTAL_API_KEY": "YOUR_SMSPORTAL_API_KEY" }
    }
  }
}
```

| Variable | Default | Meaning |
|---|---|---|
| `SMSPORTAL_API_KEY` | — | API key (stdio mode) |
| `SMSPORTAL_API_URL` | `https://smsportal.app/api/v1` | API base URL |
| `SMSPORTAL_READ_ONLY` | `false` | `true` hides the sending tool |
| `SMSPORTAL_PUBLIC_ORIGIN` | `http://localhost:18080` | HTTP mode: the only browser origin allowed |
| `SMSPORTAL_TRUST_PROXY` | `false` | HTTP mode: trust one reverse-proxy hop for the caller address |
| `HOST`, `PORT` | `127.0.0.1`, `3002` | HTTP mode listener |

HTTP mode (`node dist/index.js --http`, or the `Dockerfile`) serves Streamable HTTP at `/mcp`, takes
the API key from `Authorization: Bearer` (or an `x-api-key` header, for hosts that cannot add the
`Bearer` prefix), validates it before every request and rate-limits per
caller network.

## Development

```sh
npm ci && npm test
```

Security reports: see [SECURITY.md](SECURITY.md). License: MIT.
