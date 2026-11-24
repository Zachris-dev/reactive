# Reactive Security Architecture and Assurance Register

**Status:** Developer alpha; **not approved for public hosting**.  
**Scope reviewed:** `feature/campaign-server`, 24 November 2026.  
**Purpose:** Explain the security decisions, map them to actual code, distinguish implemented controls from design intentions, and define conditions for future deployment. This is an engineering record, not a certification or claim of a security audit.

> **Release gate:** Do not expose the current Character Server, development identity picker, or local offline workspace as a public service. Real authentication, secure locally hosted multiplayer, attachment handling, and infrastructure defenses are incomplete. A valid message or a successful test does not establish a trusted identity.

## 1. Security objectives and trust boundaries

Reactive must preserve confidentiality, integrity and availability while remaining useful without an internet connection.

* **Confidentiality:** A campaign member cannot read another campaign's characters; players sharing a character cannot read one another's private notes; a GM does not automatically gain access to a player's private notes. Server-admin authority is distinct from campaign-GM authority. An offline device is not necessarily trusted merely because the GM recognizes its user.
* **Integrity:** Every mutation must be authorized, validated, bounded and attributable; stale edits and unacknowledged retries must not silently overwrite or duplicate committed data.
* **Availability:** Malformed requests, upload floods, resource exhaustion and connection churn should not prevent ordinary sessions. Connectivity failure must not stop an already-established local game.
* **Recoverability:** Keep prior revisions, local pending edits and verified backups; a network loss must not masquerade as successful synchronization.
* **Interoperability:** The same defined message operations can be carried over HTTPS, future encrypted LAN connections, and potentially Bluetooth. Changing transport must not weaken authorization.

These are *separate trust domains*:

1. **Untrusted client device / network:** All bytes, IDs, filenames, lengths, user-selected roles and message types may be attacker-controlled.
2. **Validated application message:** Syntax and schema checks establish only that the data is well-formed, **not who sent it**.
3. **Authenticated account or locally admitted identity:** Cloud account authentication and GM-approved offline participation are not equivalent. The latter must never be silently promoted into the former.
4. **Authorized campaign resource:** Membership, GM role, character assignment, note authorship and sharing rules must be enforced on each request, independent of what the UI displays.
5. **Storage and synchronization:** D1/SQLite, offline browser storage and future attachment storage hold different kinds of data and need individual access and recovery policies.
6. **Hosting infrastructure:** The network edge, local reverse proxy, firewall and Cloudflare may protect traffic before it reaches the Worker. The Worker cannot absorb a volumetric attack that saturates the upstream connection.

## 2. Security controls: implementation inventory

This table is intentionally conservative. “Implemented (alpha)” means code exists in the current branch, **not that production security is complete or externally verified**.

| Protection | Status | Evidence / qualification |
| --- | --- | --- |
| Local-development-only API gate | Implemented (alpha) | `apps/character_server/src/worker.mjs`: checks `DEV_AUTH=local-only` and request URL hostname; `wrangler.local.jsonc` binds development server to `127.0.0.1`. This is not a real identity proof and must not be trusted behind a proxy that can rewrite the host. |
| Production login / identity lifecycle | **Not implemented** | `actorFor` accepts `x-dev-user` for synthetic `test_` accounts in the simulator. There are no production sessions, passwords, OAuth verification, secure session cookies or device revocation. |
| Shared typed message registry | Implemented (alpha) | `packages/communications/protocol.mjs`; used by Worker binary endpoint `POST /api/protocol` and client transport helper. The developer console still uses existing JSON REST routes. |
| Binary framing and length checks | Implemented (alpha) | 16-byte header, magic `RCTV`, protocol version, type, correlation ID, payload byte length and reserved flags; frame must be exactly the declared size; 65,536-byte payload ceiling. |
| Strict protocol JSON validation | Implemented (alpha) | Fatal UTF-8 decoder; approved message types; type-specific required/optional fields; reject unknown fields and noncanonical/duplicate-key JSON; reject excess nesting and invalid Unicode. Individual business handlers also validate fields. Nested character-sheet payloads still use a generic JSON schema and need a dedicated character-sheet schema. |
| Transport confidentiality | **Partially enforced in client helper only** | `packages/communications/client.mjs` rejects non-HTTPS URLs except loopback. No production TLS endpoint, PKI/TOFU process, local TLS identity, Bluetooth secure channel or verified Cloudflare deployment is configured. The protocol envelope does not encrypt or sign data. |
| Campaign and role authorization | Implemented for present routes | `worker.mjs` queries memberships, GM role, character assignments, and note authorship. Synthetic developer identities are not secure account authentication. Revalidate all operations during future migrations. |
| Private note isolation | Implemented for present routes | Notes list uses shared visibility or author ID; note replacement/history require author; GM and other assigned players are denied author-private histories. Offline IndexedDB copies are **not encrypted**. |
| Invitation handling | Implemented (alpha) | Random invitation tokens are stored as SHA-256 digests, with expiry and use limits; member/GM checks in handlers. Real authentication and production abuse throttling remain absent. |
| Parameterized database operations | Implemented in existing handlers | Queries use D1 `prepare(...).bind(...)`; avoid SQL string composition with user-provided values. Dynamic fixed SQL clauses selected by server logic are not an invitation to interpolate input. |
| Version checks and history | Implemented for character and note replacement | `0003_sync.sql`, `worker.mjs`: previous revision rows, expected-version checks, receipts, per-update payload hash and HTTP 409 on divergence. History is paginated. Needs real D1 integration and race testing before relying on concurrency guarantees. |
| Retry idempotency | Implemented for character/note replacements | A UUID operation ID is checked against an actor, resource, kind and payload digest. Correlation request IDs are **not** replay protection. Other operations do not yet share this mechanism. |
| Durable offline pending edits | Prototype | `apps/character_server/src/offline-page.mjs`: cached page, IndexedDB outbox, explicit server acknowledgments and manual conflict rebase. Data is not encrypted; no verified device identity; not integrated into the primary GM/Character Sheet apps. |
| Audit trail | Partial | `audit_events` records selected campaign/admin/assignment/note operations; comprehensive security events, actor/session provenance, retention/redaction and tamper resistance not implemented. |
| File upload validation and safe storage | **Not implemented** | Attachment types, extension administration, content scanning, file signatures, filename/path isolation and per-file permission checks remain design requirements. Character JSON upload is not arbitrary-file attachment support. |
| Rate limiting and DDoS defense | **Not implemented** | No live thresholds, WAF configuration, CIDR block list, trusted-address exceptions or abuse-response dashboard in this branch. |
| Backup / disaster recovery | **Not implemented** | Prior revisions are not equivalent to off-device backups; no encrypted export, backup rotation or restore verification yet. |
| Production monitoring / incident response | **Not implemented** | No real-time alerts, incident runbook, log retention policy or administrative security dashboard. |

## 3. Protocol design and reasons

The shared protocol is deliberately **strict about structure but not about legitimate user content**. Its exact wire layout, registered message names and compatibility contract are documented in [communications-security.md](communications-security.md).

* **Whitelist message types.** Unknown operations and fields fail validation, reducing accidental feature exposure and malformed-input ambiguity. The server independently authorizes the semantic operation.
* **Length in UTF-8 bytes.** A length specified in characters is not interchangeable with transmitted bytes; both shorter and longer declared lengths must fail. Cap the entire body before allocating large buffers.
* **Reject ambiguous encodings.** Fatal UTF-8 decoding, canonical JSON and a strict schema minimize inconsistent interpretations between endpoints. The current canonical serializer also rejects alternate otherwise-valid JSON spellings; that is a compatibility requirement, not a cryptographic guarantee.
* **Accept freeform note text as data.** Unicode, punctuation and harmless literal markup can legitimately appear in notes; do not pretend that excluding apostrophes or brackets is a complete injection defense. When displaying a note, use text-only rendering rather than `innerHTML`; keep SQL parameterized. Restrict structured numbers, names and enums individually.
* **Never treat message identifiers as secrets.** A request ID correlates a response. A synchronization UUID identifies one attempted operation. Neither authenticates the sender.
* **Use standard cryptography and TLS.** No homegrown time-rolling tokens or custom encryption. Authentication and signed device identities should use vetted primitives and revocable credentials.
* **Reject errors safely.** Do not expose database internals or SQL in client-facing responses. Keep useful diagnostic details in carefully access-controlled server logs.

**Compatibility:** Protocol version 1 is hardcoded; version negotiation is not yet implemented. Protocol changes must add schemas on both client and server and include negative tests. The REST developer routes still exist and must receive equivalent protections while present.

## 4. Identity and authorization rules

**The server must decide permissions, not the client.** The caller cannot acquire GM authority by asserting `is_gm`, inventing an account ID, altering a character ID or renaming a file.

Current authorization intent:

* Campaign membership allows campaign participation; the GM role permits management and invitations.
* A player's character update requires assignment to that character. A GM may update an unassigned GM character, but GM role by itself does not authorize overwriting an assigned player's sheet.
* Multiple assigned players may access a shared character; note visibility still follows individual note ownership and sharing rules.
* A private note's author alone can edit its content and read its full revision history; shared notes are readable by permitted character participants, but shared visibility does not grant editing rights to everyone.
* Server administrators manage server-level policy and account recovery, not unrestricted reading of private player data. Some administrative metadata listing exists; a comprehensive production privacy policy for filenames and virtual paths remains to be implemented.
* For future file storage, the requested virtual path `campaign/user/character/filename` is **organizational metadata**, never an authorization credential or physical filesystem path.

**Offline identity:** A GM may admit a participant locally when cloud authentication is unavailable, but must record that as *GM-approved local access*, not a cloud-authenticated account. Future cached public keys and signed challenges could verify previously registered devices, subject to certificate/key rotation and revocation staleness. Proxy-entered rolls must distinguish the player/character performing an action from the GM or other person recording it. Neither feature is implemented yet.

**Session design still required:** Real provider-validated login or equivalent offline local account authentication, Secure/HttpOnly/SameSite cookies where browser-appropriate, CSRF defenses, expiry and revocation, device association, least privilege and explicit reauthorization for sensitive operations. Account-level revocation must not be circumvented by changing the network address.

## 5. Synchronization security and ownership

**Responsibility:** GMs synchronize GM-owned campaign/encounter/NPC data; players synchronize their own characters and private/shared notes. The local GM may observe that participant synchronization is outstanding where the status can be reported without revealing private content. **GM campaign events are not a substitute for an individual player's online authentication.**

The implemented character/note replacement sequence is:

1. Client retains original server revision, locally persists proposed change and generates an operation UUID.
2. Server authorizes the authenticated actor and checks that the supplied version is current.
3. Accepted update preserves the prior revision, advances the resource version and writes an idempotency receipt tied to the submitted payload digest.
4. Client deletes the pending operation **only after** confirming the server acknowledgment. If the acknowledgment is lost, retransmit the **same** UUID and content.
5. Stale revisions return a conflict; the offline prototype preserves the local change and offers **explicit review** before rebasing. It does not merge automatically.

**Limitations to fix:** Concurrent submissions and transactional edge cases need a verified Wrangler/D1 run and stress tests. Current receipt matching should be supplemented with complete end-to-end duplicate-response handling and time-consistent authorization. The prototype stores browser IndexedDB data in cleartext; browser profile compromise or shared-device use can expose cached private notes. No player/GM multi-device offline reconciliation, encrypted attachment sync or campaign event journal is operational yet.

**Do not claim successful synchronization just because a request was sent.** A changed transport path, lost response, or offline period must not erase unacknowledged local work.

## 6. Future attachment policy

Attachment support has been designed but **has not been built**. Initial proposed formats: `.txt`, `.pdf`, `.doc`, `.docx`, `.odt`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.xlsx`, `.xls`, `.ods`, `.csv` and `.tsv`.

When implemented:

* Admin-managed allowlist and maximum size **per type**, enforced server-side without requiring code changes for ordinary format registration. Do not equate an allowed extension with verified safe content.
* Validate signature/container and extension where feasible; quarantine suspicious files; scan potentially active documents; never execute document macros or embedded code on the server.
* Serve downloads with appropriate content disposition and `nosniff`; use safe or sandboxed previews rather than executing arbitrary embedded content. Control decompression bombs and oversized image dimensions.
* Preserve a private internal storage ID separate from any virtual path. Reject traversal and encoded separators. Handle duplicate names without data collision.
* Before disabling an extension, show the administrator counts and a paginated affected-file inventory, including historical versions, without exposing private filenames beyond the administrator's authorized metadata. Default to blocking future uploads while retaining authorized access to existing files.
* Store file bytes privately; verify access again at every download, revision, sharing or export step. Expiring upload/download links should be narrowly scoped.

The format policy must not become a generic “allow arbitrary executable attachment” bypass.

## 7. Abuse controls, rate limits and DDoS response

**Planned; no live functionality yet.** Use layered limits per authenticated account, IP and global resource budget, with different thresholds for logins, invitations, uploads and expensive queries. Connection counts alone are insufficient: persistent legitimate multiplayer connections differ from rapid connection churn, and a distributed attack may stay below every individual IP threshold.

* Apply edge/provider DDoS protections where available; block floods before they consume Worker/database resources. For a locally hosted server, use router/firewall/reverse-proxy defenses, acknowledging that they cannot stop upstream bandwidth saturation.
* Prefer gradual rate limits, temporary address blocks and bounded counters with expiry. Treat /24 IPv4 and /64 IPv6 subnet restrictions as higher-impact actions requiring stronger evidence than a single-address throttle.
* Consider narrow allow exceptions for previously legitimate addresses inside a blocked CIDR range; **an IP allow exception must not skip normal authentication, authorization or application rate limits**. Shared IP addresses and changing mobile/IPv6 addresses demand care.
* Keep a path for legitimate players to reconnect, reverse false positives, and inspect audit reasons. Limit security logs and block entries themselves to avoid a resource-exhaustion amplifier.
* Stress tests must run against isolated infrastructure, not uncontrolled production traffic.

## 8. Threat-to-test matrix

| Threat or failure | Required negative / recovery tests | State |
| --- | --- | --- |
| Incorrect declared payload length | Declared shorter **and** longer than actual, trailing bytes, truncation, multibyte Unicode | Unit tests added |
| Invalid structured input | Wrong field types, unknown operations, unpaired surrogates, invalid UTF-8, duplicate JSON keys, excess nesting, fuzzed frames | Unit tests added |
| Cross-campaign and cross-player reads/writes | Outsider characters, wrong campaign IDs, GM trying private notes, non-author note edits, admin not automatically seeing player data | Integration cases added; full Wrangler run unverified |
| Malicious freeform text | Quotes, control characters, literal HTML/script never interpreted as instructions or executed when rendered | Some schema/rendering behavior present; dedicated browser XSS tests needed |
| Lost synchronization acknowledgment | Retry identical UUID and payload; reject altered payload with same UUID; verify exactly one committed revision | Integration cases added; full Wrangler run unverified |
| Concurrent offline branches | Two players edit one shared character from the same revision; only one wins; preserve the other's local edits | Integration case added; high-contention/load test needed |
| Malicious file or path | Spoofed signatures, traversal, compressed bombs, archive inflation, disabled extensions, private exports | Not yet implemented |
| Session fixation, theft, expiry, CSRF | Invalid/expired/revoked sessions, concurrent sessions, same-origin policies, cross-site writes | Not yet implemented |
| Connection floods / DDoS | Rates, connection churn, subnet exceptions, expiry, resource exhaustion and false positives | Not yet implemented |
| Offline/device compromise | Lost device, shared browser, stolen local copy, revoked online identity, newly paired device | Not yet implemented |
| Database/backup failure | Interrupted write, restoration, migration rollback plan, partial sync and eventual reconciliation | Partial revision history; restore tests absent |

Commands: `test.cmd server` runs unit tests; `test.cmd server integration` launches isolated Wrangler/D1 integration tests. **The latter has not yet been verified against a working Wrangler installation by the assistant.** Tests are evidence of the cases they cover, not proof that no other attack is possible.

Every denied write test should verify **three things**: an appropriate denial, **no unauthorized state change**, and that later valid operations still succeed. Tests must use untrusted callers, not only the approved shared encoder.

## 9. Release-blocking work and operational checklist

Do not call the system production-secure until the following are implemented and verified:

- [ ] Replace synthetic `x-dev-user` authentication with real account sessions and locally authenticated identities; ensure remote access cannot invoke developer impersonation by proxy/rewrite/host spoofing.
- [ ] Enforce HTTPS/TLS, meaningful server identity verification, secure headers and session/CSRF protections across every deployed transport and legacy route.
- [ ] Review authorization route by route, including history, note privacy, GM/player separation, invitation claims, admin metadata, future attachments and exports.
- [ ] Verify atomic compare-and-swap, replay receipts and concurrency under real Wrangler/D1; add failure-injection and many-session offline regression tests.
- [ ] Implement durable, privacy-preserving encrypted device storage where required, secure backups, tested recovery and device revocation behavior.
- [ ] Define and enforce a complete character-sheet schema and input limits; audit all UI rendering and file preview behavior for XSS/content injection.
- [ ] Add edge/host DDoS protection, application rate limiting, quotas, safe temporary CIDR policies and bounded security logs.
- [ ] Add production audit events, incident handling, dependency updates, code review, reproducible migrations and continuous security testing.
- [ ] Implement independent local multiplayer admission and encryption without relying on cloud login; never claim GM approval equals cloud identity.
- [ ] Validate public-host configuration in an isolated staging deployment and perform a focused security review before release.

## 10. Maintenance rules

1. **Update this document whenever security-sensitive code changes**. Mark entries as implemented only when real code exists; distinguish planned protection from operational protection.
2. For each new message: register its schema, define its authoritative actor/resource checks, model failure and replay behavior, and add positive, negative and boundary tests.
3. For each new storage object: specify ownership, read/write authorization, revisioning, export/download behavior, retention and test-fixture cleanup.
4. Record known limitations prominently. Prefer an explicit “unsupported” status over implied security.
5. Keep the lower-level protocol specification in [communications-security.md](communications-security.md), the developer setup in [developer-installation.md](developer-installation.md), and this document as the overall security architecture and assurance checklist.

**Design rule:** The game may continue offline, but permissions and identity claims must remain accurately labeled, data may never be silently lost or overwritten, and the security posture must not depend on the client behaving honestly.
