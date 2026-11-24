# Reactive communications protocol (v1, developer alpha)

## Shared source of truth

Client and server import the same modules:

- `packages/communications/protocol.mjs` — registry, schemas, encoder/decoder
- `packages/communications/client.mjs` — browser/Node HTTPS transport helper

The Worker imports the same registry and exposes `POST /api/protocol` for
binary messages. This endpoint **currently works only in localhost-only
developer mode**. The existing browser console still uses its legacy JSON
REST calls while migration proceeds. Do not deploy the identity simulator.

### Wire format

```text
byte offset  size   meaning
0            4      ASCII RCTV
4            1      protocol version (1)
5            2      registered numeric message type (unsigned BE)
7            4      request correlation ID (unsigned BE)
11           4      JSON body length in UTF-8 BYTES (unsigned BE)
15           1      reserved flags, must be zero
16           N      canonical compact UTF-8 JSON
```

There must be **exactly** `16+N` bytes. There is a 65,536-byte body
ceiling. Invalid UTF-8, unknown message types, nonzero reserved flags,
unexpected fields, wrong types, duplicate JSON keys, trailing data,
unpaired Unicode surrogates, or excessive nesting are rejected.

Canonical encoding deliberately means the JSON bytes must round-trip
unchanged through `JSON.parse` and `JSON.stringify`. It is a protocol
constraint, **not** a cryptographic signature. The shared encoder produces
the required format. Ordinary freeform note text may contain newlines,
quotation marks, control characters and valid Unicode; it is always data,
never markup or executable code. Valid JSON embedded inside a character
sheet is validated as structured JSON rather than being treated as script.
Each application-level field has additional validation in its server handler.

**Request IDs are correlation identifiers only.** They are not secret,
unpredictable credentials or protection against replay. Sessions and
authentication will be implemented separately using standard secure
session techniques. The transport helper requires HTTPS outside loopback.
TLS provides confidentiality and integrity in transit. This protocol
is not encryption and should never be described as such.

## Registered operations

| Type | Function |
| --- | --- |
| `campaign.list` | List accessible campaigns (or admin metadata list) |
| `campaign.mine` | List all campaigns of authenticated user |
| `campaign.create` | Create a campaign |
| `campaign.members` | List members of a specified campaign |
| `invitation.create` | Generate an invitation (GM only) |
| `invitation.accept` | Accept invitation |
| `character.list` | List available characters of a campaign |
| `character.list-all` | List accessible characters across campaigns |
| `character.upload` | Upload placeholder sheet JSON to campaign |
| `character.read` | Retrieve sheet JSON and assignment information |
| `character.assign` | Add an assigned player (GM only) |
| `note.list` | Read notes visible to caller |
| `note.create` | Create private/shared note |
| `account.me` | Read own identity |
| `admin.users` | List admin-visible user metadata |
| `admin.promote` | Promote account to administrator |
| `admin.revoke` | Revoke eligible inactive admin |
| `admin.gm-recover` | Restore campaign GM access after inactivity |
| `operation.result` | Typed response with HTTP status and result data |

All operations reuse the existing Worker endpoints and their permission
checks. A properly encoded request does **not** authorize itself. The
server independently identifies the authenticated caller and checks
the requested operation's privileges.

### Example (a local test client)

```js
import {sendMessage} from "./packages/communications/client.mjs";

const response=await sendMessage({
  url:"http://127.0.0.1:8787/api/protocol",
  type:"character.list-all",
  payload:{},
  requestId:1,
  headers:{"x-dev-user":"test_player_a"}
});
console.log(response.status,response.data);
```

The example developer identity header is **only for the local simulator**.
A deployed client must use the future actual authentication flow, without
accepting an identity claimed by a user-controlled header.

## Revision synchronization operations

The following operations are now implemented in the local developer alpha:

- `character.replace`: assigned players update their character sheets; a
  GM can update an unassigned GM character. Expected revision, UUID operation
  ID, and content hash protect against stale changes and altered retries.
- `character.revisions`: read previous and current sheet revisions under
  the same character access rules, with bounded pages and an optional
  `before_version` cursor.
- `note.replace`: only the original note author can change its text, with
  expected revision and immutable historical copies. Empty replacement text
  is permitted.
- `note.revisions`: only the note's author may read its complete history,
  including previously shared/private versions. Large histories are paginated
  using `before_version`.

Do not introduce a new public message type until its storage, authorization
and concurrency behavior are implemented. Future planned operations include:

- `attachment.*` — private binary file storage and administrator policy
- `session.*` — real authentication, token rotation and revocation
- `roll.*` — authoritative live dice operations

The current protocol does **not** contain session secrets or authentication-based replay protection,
rate limits, file inspection, or DDoS mitigation. Those require separate
implementation and infrastructure configuration. The operation UUID + content digest provides idempotent retry detection for
character/note replacement only, not general replay protection or login.
The developer server remains unsuitable for public hosting until these security requirements
and production authentication are complete.

## Tests and migration

`test.cmd server` runs protocol framing, schema and mutation tests alongside
authorization tests. `test.cmd server integration` exercises binary messages
through real local Wrangler/D1 and checks both unauthorized operations and
malformed frame rejection. The integration suite uses isolated temporary
local state, not your real campaign database.

For each new operation: add exactly one entry to the registry, a strict
schema and an authorized server handler; extend both positive and negative
tests. Keep the shared client and server on one protocol version until a
negotiated versioning mechanism is implemented.
