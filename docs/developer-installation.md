# Reactive Character Server — local developer installation (alpha 0.1)

This is the **developer** installation, not the Cloudflare production server.
It runs the real Character Server Worker locally with a local D1 database.
**Nothing here deploys to Cloudflare.** No Cloudflare account, remote database,
Discord application, or Google OAuth credentials are needed.

The alpha currently covers the server foundation: local developer identities,
Unicode campaign names, campaign membership and multiple GMs, three invitation
types, administrator promotion and inactivity revocation, and GM inactivity
recovery. It does **not** yet implement production authentication, accounts,
character storage, notes, backup import/export, or live opposed rolls.
Do not expose this developer server to the internet or use it as a production
campaign host yet.

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

Try generating a single-use player invitation, a group player invitation,
and a single-use GM invitation; switch identity to accept one. This is a
development simulation, **not a real login**.

Commands are also available through npm from `apps/character_server`:
`npm.cmd run db:init`, `npm.cmd run db:seed`, and `npm.cmd run dev`.

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
Their names and IDs start with `test_`. They include two campaign GMs, two
players, one administrator, and campaigns named with Latin and Japanese text.
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

To start over, stop the local server and remove the **local** Wrangler state
directory under `apps/character_server/.wrangler/`, then run `server.cmd init`
and `server.cmd seed` again. **Do not do this if you have data you want to
keep.** Never run reset operations against a Cloudflare remote database.

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
