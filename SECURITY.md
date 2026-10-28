# Security

Report vulnerabilities privately through GitHub: **Security → Report a vulnerability** in this
repository, or by email to support@smsportal.app. Please do not open public issues for security
problems. We aim to reply within 3 working days.

## What this server can and cannot do

- It acts only with the API key the caller supplies. It stores no keys, sessions or messages.
- The API address is fixed by the operator (`SMSPORTAL_API_URL`); tool inputs cannot choose a
  URL, header or redirect target.
- Every HTTP request is authenticated against the smsportal API before any MCP session starts.
- `SMSPORTAL_READ_ONLY=true` removes the sending tool entirely.
- SMS text is returned as data. Clients should treat it as untrusted input, never as instructions.
