# Installing the Reactive Character Server

This guide is for someone who wants to run **their own Reactive Character Server** for one or more tabletop RPG campaigns. You do **not** need to operate a computer as a web server, buy a domain name, or give your players access to your Cloudflare account.

**Project status (November 2026):** The Character Server is **planned, not implemented yet**. This guide explains the hosting setup and the intended installation sequence. Steps explicitly marked **Not available yet** cannot be completed until the server application and its configuration are added to this repository. Do not deploy Cloudflare's example Worker and assume it is the Reactive server.

## What the pieces do

| Part | Purpose | Who needs an account? |
| --- | --- | --- |
| GitHub | Provides the Reactive source and future server code | Installer may download without a GitHub account; Git is optional |
| Cloudflare Workers | Runs the Character Server's web API over HTTPS | Only the person operating the server |
| Cloudflare D1 | Stores users, campaigns, characters, notes, revisions, and permissions | The server operator |
| Cloudflare R2 | Stores portraits, maps, and file attachments (when implemented) | The server operator |
| Reactive player / GM apps | Connect to the server to manage permitted campaign data | Players create **Reactive** accounts, **not** Cloudflare accounts |

Cloudflare's free allowances may suit a small group, but check current pricing and limits. **R2 may ask you to enable billing even if your usage stays within its free allowance.** Email delivery may require a separate provider or paid plan. Neither R2 nor email should be assumed to be free without checking.

## Before you start

1. Have an email address you control for the Cloudflare account.
2. Have a computer with a terminal and a supported current Node.js installation. Check with `node --version` and `npm --version`. If either command is missing, install Node.js from https://nodejs.org/.
3. Use an operating system supported by the current Wrangler CLI. **Cloudflare's October 2026 Wrangler documentation lists Windows 11, macOS 13.5+, and compatible Linux; Windows 10 is not officially supported.** If you are on Windows 10, use a supported Linux environment or another supported machine for command-line deployment. A Cloudflare account and the browser dashboard alone do not yet provide a complete Reactive installation procedure.
4. Have internet access. A domain name is optional: Cloudflare can provide a `*.workers.dev` address.

**You do not need to open ports on your home router.** The server runs on Cloudflare, not on your home computer.

## Step 1 — Create a Cloudflare account

1. Visit https://dash.cloudflare.com/sign-up and register.
2. Confirm your email address and sign in.
3. Open **Workers & Pages** in the Cloudflare dashboard.
4. If prompted, choose a `workers.dev` subdomain. This will be the basis of your server's public address. You may use a custom domain later.

Do **not** invite individual players into your Cloudflare account. They will use accounts managed by Reactive itself.

## Step 2 — Download Reactive

In a terminal on the computer you will deploy from:

```sh
git clone https://github.com/Zachris-dev/reactive.git
cd reactive
```

If you do not have Git, use GitHub's **Code → Download ZIP**, extract it, and open a terminal in the extracted `reactive` directory.

**Not available yet:** The server's eventual release path (for example, a directory under `apps/`) and the exact installation command will be documented here once its source exists. The repository's existing `npm install` / build scripts are for other Reactive components; they do **not** install a Character Server.

## Step 3 — Sign in to Cloudflare from the terminal

Cloudflare's deployment utility is called **Wrangler**. Once the Character Server package is present, its dependencies should install a project-local copy of Wrangler.

For initial Cloudflare account authorization, the currently documented command is:

```sh
npx wrangler login
```

Follow the browser sign-in prompt, then return to your terminal.

If Wrangler is not installed in the current project yet, `npx` may offer to download it. You can defer this step until the server package exists rather than installing a global copy.

Never paste Cloudflare API tokens, passwords, or secret values into chat, documentation, or Git commits.

## Step 4 — Prepare a D1 database

D1 is where the Character Server will store its structured data. There are two ways to create a database.

**Dashboard method (easier for a first installation):**

1. In Cloudflare, open **Storage & databases → D1 SQL database**.
2. Choose **Create Database**.
3. Give it a recognizable name, such as `reactive-characters`.
4. Create it and keep the resulting database page open; you will need its database ID when configuring the server.

**Terminal method (alternative):**

```sh
npx wrangler d1 create reactive-characters
```

Record the database ID that Wrangler prints.

**Not available yet:** Do not guess the D1 binding name or run improvised SQL. Once the server code exists, this guide will provide its exact Wrangler configuration and the command for applying the supplied database migrations. Creating an empty D1 database does *not* create a working Character Server.

## Step 5 — Prepare R2 storage (optional until file uploads are supported)

R2 is intended for image portraits, campaign maps, and other uploaded files, **not** the character database.

1. In the Cloudflare dashboard, open **Storage & databases → R2 → Overview**.
2. Follow Cloudflare's instructions to enable R2. Check billing requirements and free-usage allowances before proceeding.
3. Create a bucket with a recognizable name, such as `reactive-files`.

Alternatively, after R2 is enabled:

```sh
npx wrangler r2 bucket create reactive-files
```

**Not available yet:** The server must define the R2 binding and file-upload permissions before this bucket is useful. Skip R2 entirely if the first alpha version does not yet implement attachments.

## Step 6 — Configure and deploy the Character Server

**Not available yet — requires server code.** When the Character Server is implemented, this section must be updated with the **tested, exact commands**, rather than placeholders, for:

1. Installing the server package's dependencies from its actual repository directory.
2. Setting the Cloudflare Worker name and the provided D1/R2 binding names and IDs.
3. Setting the authentication/session secret through Wrangler's secret facility (never in a committed configuration file).
4. Applying the project's versioned D1 migrations to the **remote** database, not just a local development database.
5. Building and deploying the Worker with the server package's supported command.
6. Verifying a documented health endpoint and opening the actual setup URL.

Cloudflare generally deploys Workers through `npx wrangler deploy`, but **running that command at the repository root today will not deploy the planned Character Server**.

A successful deployment should produce an HTTPS URL similar in shape to:

```text
https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
```

The precise address is shown by Cloudflare; do not guess it.

## Step 7 — Create the first Reactive administrator

**Not available yet — requires the server's setup interface.**

Once implemented, the first visit to the server's setup page should allow its owner to create the initial **Reactive server administrator** account. This is separate from the Cloudflare login.

The installer should:

1. Open the server's setup page over HTTPS.
2. Create the first Reactive administrator account and a strong password.
3. Save any offered recovery information somewhere safe.
4. Verify that initial setup is locked after the first administrator exists.
5. Sign in to the new account.

A server administrator is **not automatically a campaign GM**. Administrators may appoint other administrators, but ordinary administrator revocation follows the agreed inactivity rules.

## Step 8 — Create a campaign and invite players

**Not available yet — requires the campaign-management interface.**

The intended first-run process is:

1. An authorized user creates a campaign and becomes its first GM.
2. The GM invites members or grants other members GM privileges.
3. Players register or sign in with their own Reactive accounts.
4. Players connect their character-sheet apps to the server URL and join the campaign.
5. Players upload or create characters. The GM may maintain NPCs and campaign resources with their own visibility settings.

**Important:** Every GM also has player capabilities. Several people can be GMs in one campaign. Do not share an administrator login just to let someone join a game.

## Step 9 — Check that everything works

When the server is available, test with **two separate Reactive accounts**, one GM and one ordinary player:

- Both accounts can log in over HTTPS.
- The player sees only their own characters, notes, and player-published material.
- The GM can see GM-shared material, but not player-private notes or another GM's personal secrets.
- A character saved on one device can be retrieved on another.
- A stale version cannot silently overwrite a newer one.
- A campaign export can be downloaded without server-administrator approval.
- A server administrator sees file sizes and storage metadata, but not secret titles or content in the normal admin interface.

These are **acceptance checks for the future implementation**, not claims that the current repository already supports them.

## Routine operation, backup, and recovery

- **Keep the Worker and server dependencies updated** using future release instructions. Apply database migrations before deploying a version that requires them.
- **Export your campaigns periodically.** Do not depend only on revision history or the recycle bin; both have finite retention periods.
- **Back up the database and attachments** according to the future server's documented backup procedure. A campaign export protects campaign material, but is not automatically a complete account/database backup.
- **Check Cloudflare usage and billing**, especially R2 storage and any email-sending provider.
- **Keep credentials private.** Players use their own Reactive logins; neither players nor GMs need access to your Cloudflare dashboard.
- **Distinguish access roles.** Campaign GMs administer their campaign, while server administrators maintain accounts, resources, and quotas; neither role should automatically expose private narrative content.
- **If a player loses access**, use the future account-recovery process. Private notes encrypted into an old campaign export may still require the password used for that export.

The server is designed for small trusted gaming groups, with visibility controls to avoid spoilers. It is not intended to resist someone who directly controls the Cloudflare account and its underlying storage.

## Troubleshooting

| Symptom | First thing to check |
| --- | --- |
| `node` or `npm` is not recognized | Install a supported Node.js release and reopen the terminal. |
| Wrangler reports an unsupported OS | Check Cloudflare's current Wrangler requirements; use a supported environment. |
| `wrangler login` does not complete | Sign into the correct Cloudflare account in the opened browser, then retry. |
| D1 database exists but server does not work | Creating a database is only preparation; the Worker, bindings, and server schema are still required. |
| R2 bucket creation asks for billing | Review Cloudflare's R2 subscription/pricing; do not assume creating the bucket incurs no billing setup. |
| A generic "Hello World" Worker appears | You deployed an example, not Reactive's Character Server. |
| Another player cannot log in | They need a Reactive account after the server setup is complete, not Cloudflare credentials. |
| Updates fail or a device shows an older character | Check connectivity and revision-conflict handling before replacing data. |

## Official references

These links are useful if Cloudflare's dashboard labels or commands change:

- [Cloudflare Workers: getting started](https://developers.cloudflare.com/workers/get-started/guide/)
- [Cloudflare Wrangler: installation and supported systems](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [Cloudflare D1: getting started](https://developers.cloudflare.com/d1/get-started/)
- [Cloudflare R2: getting started](https://developers.cloudflare.com/r2/get-started/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Node.js downloads](https://nodejs.org/)

**Documentation maintenance note:** Before releasing the Character Server alpha, replace every **Not available yet** section with commands verified against the actual source tree, configuration, migrations, and first-run UI. Test the procedure from a fresh Cloudflare account; do not remove these warnings until the end-to-end installation works.
