# Reactive Character Server — local developer installation (alpha 0.1)

This is the **developer** installation, not the Cloudflare production server.
It runs the real Character Server Worker locally with a local D1 database.
**Nothing here deploys to Cloudflare.** No Cloudflare account, remote database,
Discord application, or Google OAuth credentials are needed.

The alpha currently covers the server foundation: local developer identities,
Unicode campaign names, campaign membership and multiple GMs, three invitation
types, administrator promotion and inactivity revocation, and GM inactivity
recovery. It does **not** yet implement production authentication, accounts,
integration with the main character-sheet application, backup import/export, or live opposed rolls.
Do not expose this developer server to the internet or use it as a production
campaign host yet. For security design choices, implemented protections and
release blockers, see [Security Architecture](security-architecture.md).

## Windows quick start

Prerequisites: Node.js 20+ and npm. On PowerShell, if `npm.ps1` is blocked by
execution policy, use the supplied `.cmd` scripts; they invoke `npm.cmd`.

1. Fetch the current Reactive branch from GitHub, then open a terminal **in the repository root**.
2. Install the local server's tools:

   ```bat
   server.cmd install
   ```

### npm install-script approvals (expected on recent npm versions)

Modern npm versions check dependencies that run programs during installation.
Reactive's local Cloudflare tooling uses two such dependencies:

| Dependency | Expected post-install purpose |
| --- | --- |
| `esbuild` | Prepares/checks the native build executable |
| `workerd` | Prepares/checks the local Cloudflare Worker runtime executable |

The server's `package.json` contains **version-specific** approvals for
`esbuild@0.28.2` and `workerd@1.20261119.1`. This is intentional:
the install process should not blindly approve unknown programs. The
`server.cmd install` command checks for unapproved scripts and stops if
the dependency versions have changed and need review.

**If you already installed dependencies and saw a warning** like
`2 packages have install scripts not yet covered by allowScripts`, first
update your local checkout (`git pull`) to get the reviewed approvals,
then run:

```bat
server.cmd install
```

If npm continues reporting unapproved scripts, open a terminal in
`apps/character_server` and inspect the list:

```bat
npm.cmd install-scripts ls
```

Do **not** use `approve --all` or disable install-script checking.
If the reported versions are different from the versions in this guide,
review those exact packages before approving them:

```bat
npm.cmd install-scripts approve esbuild workerd
npm.cmd rebuild esbuild workerd
```

The approval command updates the local `package.json` with the installed
versions. Contributors should review and commit that change so subsequent
installations get the same documented behavior. `npm.cmd rebuild` makes
sure approved scripts actually run even if they were skipped by the initial
installation.

This is a **local Node.js dependency approval**, not a Cloudflare login or
a permission to deploy anything.

3. Initialize the local D1 database (repeatable migrations):

   ```bat
   server.cmd init
   ```

4. Populate developer fixtures:

   ```bat
   server.cmd seed
   ```

5. Start the development server:

   ```bat
   server.cmd start
   ```

6. Open **http://127.0.0.1:8787/** in your browser.

Use the account switcher to simulate the test administrator, two GMs, or two
players. The **Campaign type** selector switches between **Normal campaigns**
and **Test campaigns** (the lists do not mix). The separate **List** selector
switches between **My campaigns** and **All campaigns (administrator)**.
Only administrators can use the latter to see all campaigns.

To create a new test campaign, select **test_Server Admin**, type its ordinary
name (for example, `Heart of Isolation`), check **Create as test campaign**,
and click **Create**. The server automatically saves the name as
`test_Heart of Isolation` and switches to the Test campaigns list. Do not
type the prefix yourself unless it is already part of the name. Test campaigns
remain hidden in the Normal campaigns view. Ordinary GMs and players cannot
browse developer-only records outside the local simulator.

### Test a campaign created by a non-administrator

After updating this branch, run `server.cmd seed` **again** to add the new
test users. Seeding is additive and does not reset your existing campaigns.
If the server is running, stop it with Ctrl+C before seeding, then restart it.

The test identities shown in the application's **Act as test account** list
include:

| Test account | Initial status | Intended scenario |
| --- | --- | --- |
| `test_Campaign Creator (player, no admin rights)` | Not an admin, no memberships | Creates `test_Invitation Playground`, automatically becomes its first GM |
| `test_Personal Invite Recipient` | No memberships | Accepts one-use player invitation |
| `test_Group Invite Recipient A` | No memberships | Accepts shared player invitation |
| `test_Group Invite Recipient B` | No memberships | Accepts same invitation |
| `test_Group Invite Overflow (rejected)` | No memberships | Verifies that a two-use group link rejects a third user |
| `test_GM Invite Recipient` | No memberships | Accepts one-use GM invitation, may then invite others |
| `test_Uninvited Outsider` | No memberships | Checks that invitations and campaign membership cannot be bypassed |

The application itself includes an **Invitation test walkthrough**. Start
by selecting the creator account and choosing **Create as test campaign**.
A non-administrator is allowed to create a campaign: the creator becomes its
first campaign GM, **not** a server administrator. Generate a personal player
invitation, switch identity and accept it. Repeat with group and GM invitations.

Group invitations may be accepted by several different people, up to the
specified maximum; opening or accepting again as an existing member must not
consume another use. A GM invitation can be accepted by only one person.
A user who accepted a player invitation cannot issue invitations until they
have GM rights. The creator and later GMs do not receive server-admin rights.

Copy each generated link before switching identities; the local simulator
does not send email or Discord messages. This is a development simulation,
**not a real login**. When retesting, use `server.cmd reset` to clear developer-created test
campaigns and invitations without affecting normal campaigns.

Commands are also available through npm from `apps/character_server`:
`npm.cmd run db:init`, `npm.cmd run db:seed`, and `npm.cmd run dev`.

## Character uploads, assignments, and notes (alpha)

After pulling the latest `feature/campaign-server`, **stop the running
server**, then run `server.cmd init` to apply migration
`0002_characters.sql`, followed by `server.cmd seed` to add the new
baseline characters and notes. **Do not delete the existing database**.
Then start with `server.cmd start`. Existing campaigns remain intact.

The **My campaign selection** section now sits **above Characters** and
shows all campaigns to which the selected test account belongs, regardless
of the separate Normal/Test filter in the Campaigns administration view.
Its default is **All my campaigns**. Choose `test_Player A`, for example:
both `test_Viking Saga` and `test_The Eldrich Race` are available.

With **All my campaigns** selected, **Load characters** lists every
character the current identity can access, grouped by its displayed
campaign name (GM-accessible characters, or characters assigned to the
player). Unassigned characters belonging only to another campaign GM are
not exposed. Selecting a specific campaign narrows the list to that
campaign. The character selector and assignment controls use the
character's actual campaign, including when loading across campaigns.

**Uploading a character or creating invitations requires selecting a
specific campaign.** The all-campaigns choice is for browsing, not for
uploading into an unspecified destination.

Use the account switcher to test these roles:

1. As a player with campaign membership, upload two characters with different
   names. Every upload automatically assigns that player to the new character.
2. As a GM, upload another character. It starts with **no assigned players**,
   but remains visible to campaign GMs.
3. Choose the GM-uploaded character, select a campaign member and choose
   **Add player to character**. Repeat with another player. Both players can
   now see the same character and its placeholder sheet token object.
   Assignment is additive, not an ownership transfer.
4. As player A, create a **Private** note and a **Shared** note on that
   character. As player B, **View accessible notes**. Player B sees the shared
   note, but not player A's private note. The campaign GM can also see the
   shared note, but cannot see player A's private note.
5. A player assigned to one character cannot list or access a different
   character unless also assigned to it. A server administrator who is not
   a campaign GM or assigned player cannot read character contents.

The `test_Viking Saga` fixture now contains `test_Auðun` assigned to
player A and `test_Shared Wanderer` assigned to players A and B. The latter
has one shared note and separate private notes for player A, player B and
the GM. `test_The Eldrich Race` also has an unassigned GM character
(`test_Watch Captain`). These baseline characters reappear after
`server.cmd reset`; ad-hoc test characters are removed.

**Placeholder token format:** `character_sheet_tokens` is currently a
small JSON object, such as `{"skill":"4.3","inventory":["rope"]}`.
It is deliberately **not** the existing character-sheet application's save
format yet. Uploading is through the local server console, not from the
player/GM applications. Characters currently have a 100-character name
limit and an 8,000-character serialized token limit. Notes are limited to
4,000 characters each.

**Visibility model:** Private notes belong to their author account alone.
A shared note is visible to every currently assigned player and to all
campaign GMs. Sharing a character does not automatically share its
private notes. Notes are **server-authorized**, not merely hidden by the
browser. Notes do not yet have editing, change history, annotations,
owner-key encryption for export, or recovery functionality.

There is no single-character-per-player restriction. Campaign GMs may
assign a character to any number of current campaign members, even when
the character already has assigned players. Revoking assignments and
transferring characters between campaigns are not implemented in this
alpha.

## Offline editing and character/note synchronization (developer alpha)

After updating this branch, **stop the local server** and run:

```bat
server.cmd init
server.cmd start
```

Migration `0003_sync.sql` adds revision histories, the identity of the
author of each committed revision, and durable idempotency receipts.
Existing characters and private/shared notes are preserved. **No reset or
reseed is necessary.**

Open `http://127.0.0.1:8787/offline` in a browser **while the local
server is running**. The workspace installs a service worker to cache its
offline page. Click **Download accessible characters and notes** as an
individual test player (or GM). After that, the cached page can be
opened without the local server. Edits are written to IndexedDB
immediately when you click **Save locally**; each edit receives a stable
operation UUID and the revision from which it originated. **Refresh** can
display locally stored records without connecting to the server.

When connectivity returns, click **Synchronize my pending edits**.
The server checks character assignments or GM ownership of unassigned
characters, checks note authorship, performs compare-and-swap updates,
preserves old revisions, and acknowledges an accepted operation.
Repeated transmissions of an acknowledged operation receive the same
receipt, provided the original content is identical; changing the
content while reusing its operation ID is rejected.

If somebody else has modified the resource, the client leaves the
local data untouched and shows a conflict. **Review conflict and
rebase** explicitly displays current remote and proposed local
contents before offering a new pending operation. Rebase means
replace the latest remote content **only if the user intentionally
approves that complete replacement**; it is not an automatic merge.

**Privacy and implementation scope:** The offline IndexedDB storage
is plaintext within the local browser profile. Do not use it for
private notes on a shared or untrusted computer. The identity selector
remains a simulated localhost-only developer feature, **not real
account authentication**. The offline workspace currently supports
**previously downloaded character sheets and notes on one browser
device**. It does **not** yet integrate with the primary Character
Sheet or GM apps, support GM-owned encounters/campaign resources,
provide peer-to-peer/LAN/Bluetooth synchronization, manage file
attachments, or permit multi-device games independent of the GM's
local web server. Those pieces require additional work before
production use or a fully disconnected multi-player cottage session.

The new protocol messages are `character.replace`,
`character.revisions`, `note.replace`, and `note.revisions`.
The REST and binary endpoints use the same authorization and revision
storage. Run `test.cmd server` and `test.cmd server integration`
to exercise framing and real Wrangler/D1 synchronization cases.

## Shared communications protocol (initial security layer)

The first version of Reactive's shared communications package is in
`packages/communications/` and is used by both the client transport helper
and Character Server. It defines all **currently implemented** operations
(campaigns, memberships, invitations, characters, notes and administrator
actions), strict field schemas, protocol versioning, a binary length-delimited
envelope and strict UTF-8 decoding.

The Worker accepts binary frames at `POST /api/protocol` in **local developer
mode only**. It translates validated operations into the same permission-checked
handlers already used by the local browser console. The browser console itself
**still uses the older developer-only JSON endpoints** during migration.
Existing campaigns and test users are unaffected. No database migration is
required for this protocol update.

A security-focused unit suite now checks malformed lengths (both shorter and
longer), invalid UTF-8, duplicate JSON properties, unknown operations,
unexpected fields, nesting limits and mutation fuzz cases. D1 integration
tests also send binary frames and attempt unauthorized cross-user actions.

This is **not** yet production authentication, connection-level DDoS defense,
encrypted private-file storage or session/replay protection. The request ID
is for correlating replies and is not a credential. HTTPS is required by the
client transport outside localhost. Do not deploy the current local identity
simulator publicly. See [communications-security.md](communications-security.md)
for the full protocol specification and security boundaries.

## Automated tests

From the repository root:

```bat
test.cmd server
test.cmd server -v
test.cmd server integration
```

Or from `apps/character_server`: `npm.cmd test`.
The tests currently run the pure permission/invitation logic and local API
security checks without modifying your persistent D1 database. The suite uses
a controlled clock and tests exact 90-day boundaries.

The optional `test.cmd server integration` command starts an actual local
Wrangler Worker backed by an **isolated temporary D1 database**, loads the
fixture SQL, exercises campaign permissions and invitation workflows, then
deletes that temporary database. It requires `server.cmd install` first.

**Testing limitation:** The D1 integration runner has not yet been validated
against a working Wrangler installation in this coding environment. It may
need adjustments after the first local run. Cloudflare deployment, full
browser automation, and real OAuth flows remain future work. A green suite
does not imply production authentication has been implemented.

## Fixture design and safe cleanup

Versioned SQL fixtures live in `apps/character_server/fixtures/seed.sql`.
Their names and IDs start with `test_`. They include two initial campaign GMs, ordinary players,
one administrator, and additional unassigned accounts for all three invitation
workflows. The fixtures also include campaigns named with Latin and Japanese text.
The seed uses `INSERT OR IGNORE`, so repeating `server.cmd seed` does not
delete your locally edited data.

Fixtures are **not** ordinary player or GM records: the database also marks
them as `is_test_data=1`. The developer identity switcher is available only
on loopback and when the local-only configuration is in use. Developer
authentication is never an acceptable production setting.

The initial seed has historical activity timestamps, useful when exploring
inactivity behavior; ordinary requests refresh the selected account's activity
time. The test suite itself uses a frozen clock and does not depend on the
fixture timestamps or any persistent local database state.

### Selective reset of test data

To repeat the invitation walkthrough, stop the local server with Ctrl+C and run:

```bat
server.cmd reset
server.cmd start
```

The reset command prints what it will do and **requires you to type
`RESET`** before proceeding. It uses the fixed local-only D1 configuration;
it never contacts a remote Cloudflare database.

**What reset removes:** developer-created test campaigns such as
`test_Heart of Isolation` and `test_Invitation Playground`, their
memberships, invitation links, and invitation-use counters. It clears
changed membership and invitation history in the three seeded test
campaigns too. Old invite links should no longer be usable.

**What reset preserves:** every **normal campaign** (including the normal
`The Eldrich Race`), all memberships and invitations belonging to normal
campaigns, the predefined test user identities, and the three baseline test
campaigns `test_Viking Saga`, `test_The Eldrich Race` and
`test_霧の王国`. It restores the predefined test users' administrator
status and seeded memberships, so invitation recipients start unassigned
again. It also restores their seeded inactivity timestamps. Baseline sample characters,
player assignments and their example notes are restored by the seed step.

The command runs `fixtures/reset.sql` then `fixtures/seed.sql`. Its
deletion criteria use the database's `is_test_data` marker, **not**
campaign name prefixes. For example, a normal campaign containing
`test_` in its name is not targeted.

The reset now includes characters, character-player assignments and notes
belonging to test campaigns. Normal campaign characters and notes survive.
As new resource tables are added, their test-data cleanup rules must also
be added and tested before exposing those features in the developer build.

**Full local database deletion is different:** removing
`apps/character_server/.wrangler/` destroys *all* local database content,
including normal campaigns. Do not do that to reset test scenarios.

Never run developer reset operations against a Cloudflare remote database.

## Security boundaries and scope

- The development test-user header is accepted **only when the configured
  value is `DEV_AUTH=local-only` and the request's URL host is localhost or
  127.0.0.1**. The developer command binds to 127.0.0.1.
- This is a convenience feature for local development, not authentication
  suitable for production or for exposure behind a public proxy.
- There is deliberately no `wrangler deploy` command or production Wrangler
  configuration in this alpha.
- Accounts and fixture data are intentionally synthetic.
- There is no automatic account provisioning from Google or Discord yet.
- Backend authorization checks are mandatory. Hiding an item in the UI is not
  considered sufficient protection.

Future developer installation stages will add full API integration tests with
isolated D1 instances, character/notes fixtures, authenticated import/export
and a local campaign-server mode **without** developer impersonation.
