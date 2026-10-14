# Character creation tests

From the repository root on Windows:

```cmd
test.cmd parser
test.cmd creation
test.cmd all
```

`test.cmd` (without arguments) also runs all available suites. `test.cmd roll` and `test.cmd result` still run the existing dice-engine subsets.

The test runner is **Node's built-in `node:test`** (Node 18+), not a third-party framework. Tests live in `tests/character_sheet/parser-and-selection.test.mjs`. The Node assertions use `node:assert/strict`. The `apps/character_sheet/web/package.json` file declares `"type": "module"` so Node can import the same ES modules the browser imports.

## What these tests exercise

- Parse the **real** `campaigns/the-eldrich-race/campaign.txt` and `skills.txt`, rather than re-creating their rules in the tests.
- Check 12 skill categories of 10 skills each, including all four Magic alternatives.
- Check culture restrictions and restrictions in both directions (race-to-culture and culture-to-race).
- Check the original Elf + Physical Adept regression and the reversed selection order.
- Check parentheses are ignored when matching names.
- Check line-numbered validation warnings/errors, including the **deliberately incorrect** `Vealan Elvish` reference.
- Check that barred incomplete cultures produce notes rather than blocking errors.
- Check that deliberately breaking a category or omitting a playable culture's language produces an error.

## Shared production code

`apps/character_sheet/web/template-parser.js` reads source text and produces structured definitions and validation diagnostics.

`apps/character_sheet/web/selection-rules.js` provides `selectionRules`, `buildCultureOptions`, `optionAvailable`, and `selectionIssues`. **Both the real creation screen and the tests call these functions.** Keeping the rules out of event handlers is essential: otherwise tests might confirm one implementation while the screen uses another.

The tests do not modify the campaign files. For malformed-input tests, they change an **in-memory copy** of the text.

## Adding a regression test

1. Reproduce the issue with a minimal selection or a copy of the campaign input.
2. Write a test with a descriptive name and an assertion for the expected outcome.
3. Run `test.cmd parser`; the new test should fail if the bug is still present.
4. Fix the production code and run the same command again.
5. Run `test.cmd all` to catch unrelated regressions.

Example:

```js
test("elf cannot become Physical Adept", () => {
  assert.equal(can({ race: "Elf" }, "magic", "Physical Adept"), false);
});
```

A passing command exits with status **0**. A failed assertion causes a nonzero exit status, which `test.cmd` forwards to the caller. This also makes the suite suitable for GitHub Actions later.

**Current limits:** this is a parser + selection-logic test suite, not a complete character-allocation, advancement, save/load, or browser-interaction suite. The `creation` and `character` command names currently invoke this same initial suite; dedicated tests should be added as those modules are implemented. Browser tests can later use Playwright to verify rendered controls, especially reactivity to changing earlier selections.
