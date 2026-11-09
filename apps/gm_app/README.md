# Reactive GM App — first playable creature creator

Development branch: `feature/gm-npc-creator`.

## Run locally

From the repository root, start a static web server (the browser service worker requires HTTP or HTTPS):

```sh
python -m http.server 8000
```

Open `http://localhost:8000/apps/gm_app/web/` in your browser.
The first successful load installs an offline cache of the page, scripts, styles, and built-in SVG icon definitions. Reopening the same address in that browser can work without a connection after installation. Browsers may evict site data; **export backups** regularly. In particular, `file://` is not supported for offline caching.

## Implemented in v1

- Create, rename, describe, and delete individual GM NPCs/monsters.
- Choose from eight bundled, recolorable SVG-style markers.
- Use the twelve skill groups already present in the character-sheet UI, including selectable Magic disciplines.
- Select or drag repeatable values 5, 10, ... 95 onto any skill or group.
- Individual skill assignments always *replace*, never add to, inherited group assignments.
- Remove or overwrite any assignment; unassigned values resolve to zero without being saved.
- Autosave the creature library to same-browser local storage.
- Import and export the entire GM creature library as JSON files. Import replaces the library after confirmation.
- Block GM-origin documents at the player sheet save parser boundary.
- Use the existing rules-engine skill input convention: `{name, supplied}`, with `20` representing skill 2.0.

Run tests:

```cmd
test.cmd gm
test.cmd
```

The automated tests cover sparse values, overrides (higher and lower), clearing, round-trip serialization, value validation, duplicate IDs, the skill catalogue, and compatibility markers.

## Deliberate v1 limitations

This is **creature creation**, not encounter management. Group membership, turns, initiative, live sharing, and NPC use in an opposed roll are subsequent features. It is a separate browser page, not embedded into the player character editor. The group catalogue currently mirrors the existing character sheet's static campaign definitions; extracting those into one shared module is the next integration task. Icons are bundled and available offline rather than downloaded on demand; remote/custom portraits and a larger icon library come later. Browser local storage is appropriate only for this initial small-text NPC library, not image files or larger synchronized campaigns. Image storage should move to IndexedDB.

When the GM app is developed further, keep the creationMode discriminator immutable, continue to treat missing skills as zero, and do not conflate GM group defaults with player character group bonuses.
