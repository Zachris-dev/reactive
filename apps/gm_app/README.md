# Reactive GM App — first playable creature creator

Development branch: `feature/gm-npc-creator`.

## Run locally

From the repository root, start a static web server (the browser service worker requires HTTP or HTTPS):

```sh
python -m http.server 8000
```

Open `http://localhost:8000/apps/gm_app/web/` in your browser.
The first successful load installs an offline cache of the page, scripts, styles, and built-in SVG icon definitions. Reopening the same address in that browser can work without a connection after installation. Browsers may evict site data; **export backups** regularly. In particular, `file://` is not supported for offline caching.

## Encounter tab (initial version)

- A third tab provides an encounter area with unlimited side boxes. Side 1 is reserved for PCs and allies; player-character integration is still pending.
- Saved groups appear in a collapsible list to the left, and creatures in a collapsible list to the right. Drag either into any side.
- Adding a saved group copies the current group composition into an independent encounter unit, without editing its saved template. Adding a creature creates a separate one-creature encounter unit.
- Every side can be named and set to **Active** or **Reserve**. Only members of active sides are included by the encounter model's initiative participant query; actual initiative rolling and turn handling are not yet implemented.
- Side entries can be removed; Side 1 cannot be deleted. The encounter automatically saves to local storage.
- Deleting or importing away creature definitions currently referenced by the encounter is blocked.
- No automatic ally/enemy classification is imposed. Relations between sides, player characters, and initiative controls will be added later.

## Group Planner tab

- Creature Creator and Group Planner are tabs of the same offline GM app.
- Create, copy and delete saved groups, with names and free-text notes.
- Group members store only creature IDs and counts; the creature library remains authoritative for stats, names and icons.
- Drag creature icons into the active group, or double-click a creature entry to add one.
- The group displays each creature type as a compact marker and quantity tile (no visible creature names; names remain in tooltips/accessibility labels).
- Select a marker and use +1, +3, +5, +9 or +19 to increase the count, or −1 and −10 to decrease it. Decreasing to zero removes the member entry; Remove all also removes that creature entry from the group.
- Group edits save locally immediately. New Copy creates a separate group with the same composition, not copied creature definitions.
- Creatures referenced by groups display an editing warning; deleting them or importing a creature library that breaks references is blocked.
- Group Planner state is separate from the future encounter planner; encounter composition will use independent snapshots so play changes cannot modify saved templates.
- Run `test.cmd gm` for both character and group regression tests.

## Implemented in v1

- Create, rename, describe, and delete individual GM NPCs/monsters.
- Use **New Copy** to create a fully independent copy of the currently selected creature with a new ID, retaining the name, type, description, icon, color, Magic choice, group defaults, and individual overrides (including explicit zero). The copy is selected for immediate editing.
- Assign a free-form creature type (such as Goblins, Highland Beasts, High Emeri Humans); the library lists members of each type together, with type filtering and jump-to-section controls. These library types are separate from future encounter groups.
- Choose from eight bundled, recolorable SVG-style markers.
- Use the twelve skill groups already present in the character-sheet UI, including selectable Magic disciplines.
- Select or drag repeatable values 5, 10, ... 95 onto skills or groups; assign an explicit **0** to an individual skill to override a higher group default. Group defaults remain 5–95; remove them with × instead of assigning 0.
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

The automated tests cover sparse values, explicit zero overrides, inheritance, clearing, round-trip serialization, type grouping/filtering, backward compatibility with earlier untyped saves, value validation, duplicate IDs, the skill catalogue, and compatibility markers.

## Deliberate v1 limitations

This is a first-pass encounter composition interface, not a complete encounter-management engine. Individual turns, initiative rolls, inter-side relations, live sharing, and NPC use in an opposed roll are subsequent features. It is a separate browser page, not embedded into the player character editor. The group catalogue currently mirrors the existing character sheet's static campaign definitions; extracting those into one shared module is the next integration task. Icons are bundled and available offline rather than downloaded on demand; remote/custom portraits and a larger icon library come later. Browser local storage is appropriate only for this initial small-text NPC library, not image files or larger synchronized campaigns. Image storage should move to IndexedDB.

When the GM app is developed further, keep the creationMode discriminator immutable, continue to treat missing skills as zero, and do not conflate GM group defaults with player character group bonuses.
