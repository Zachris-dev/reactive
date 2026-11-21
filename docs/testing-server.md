# Character Server testing conventions

The Character Server uses the same testing approach as the other Reactive apps:
tests are committed alongside the implementation and can be run from the
repository root with `test.cmd server` or `test.cmd server -v`. After installing
Wrangler, run `test.cmd server integration` for an isolated local-D1 smoke
suite; this runner is newly written and awaits validation on a local machine.

## Layers

1. **Policy unit tests:** deterministic authorization, Unicode names,
   invitation expiry and exact time boundaries.
2. **HTTP boundary tests:** local development authentication is disabled for
   remote hosts and absent config, without accessing D1.
3. **D1/API integration tests:** an initial real Worker + local D1 runner
   with isolated persistence and fixture creation, to be validated and expanded.
4. **Browser workflows (next milestone):** admin/GM/player interface flows,
   invited users, and regressions.

## Rules

- Never run automated tests against a production Cloudflare database.
- Never depend on a manually populated or shared live server.
- Use `test_` names and internal `is_test_data` markers for persistent fixtures.
- Prefer a parameterized clock instead of sleeping for time-based checks.
- Test unauthorized access as thoroughly as successful access.
- Keep production authentication distinct from development impersonation.
- Every bug fix should gain a regression test.
