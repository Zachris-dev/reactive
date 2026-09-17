# Reactive

Reactive is a tabletop roleplaying system and its supporting software. The system is intended to use the same underlying resolution structure for combat, social conflict, performances, investigation, and other meaningful actions rather than treating combat as a separate rules system.

This repository contains the Reactive rules and documentation together with the applications needed to use the system electronically.

## Project scope

The planned software consists of several cooperating parts:

- **Rules engine** — the shared implementation of Reactive's dice, Risk, Edge, doubling, fumble, opposed-roll, and resolution mechanics. Other applications use this engine rather than reimplementing the rules.
- **Dice roller** — a standalone interface to the rules engine for players, GMs, testing, and rolls made without an electronic character sheet.
- **Character sheet** — character creation, campaign-specific skill templates, play-time skill activation, round tracking, Risk skill selection, and XP/training advancement.
- **Campaign synchronization tools** — software for synchronizing campaign data between the GM, individual players, and repository-backed campaign storage while exposing each player only to material they are permitted to receive.
- **Documentation and testing** — rules text, design notes, flowcharts, worked examples, and automated tests intended to exercise the mechanics systematically, including unusual combinations of Risk, Edge, doubling, and fumbles.

The intended end-user applications should be usable on phones, tablets, and laptops, preferably through a local-first installable web application that remains useful without a network connection.

See [`docs/project-scope.md`](docs/project-scope.md) for the current architectural scope and design constraints.

## Repository layout

- `apps/dice_roller/` — standalone dice-roller application.
- `apps/character_sheet/` — digital character-sheet application.
- `packages/` — shared code such as the rules engine and character/template models.
- `docs/` — architecture, project scope, and design documentation.
- `rules/` — system rules and designer's notes.
- `flowcharts/` — player-facing and GM-facing diagrams.
- `examples/` — worked examples and edge cases.
- `tests/` — systematic and regression tests for the rules and applications.

Some of these directories are planned and will be added as implementation begins.

## Licensing

Reactive uses permissive licenses so that people may use, modify, build on, and commercially use the system and its software.

- **Software source code** is licensed under the **MIT License**. See the root [`LICENSE`](LICENSE) file.
- **Rules text, examples, diagrams, flowcharts, design documentation, and other non-code documentation** are licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**. See [`LICENSES/CC-BY-4.0.md`](LICENSES/CC-BY-4.0.md).

In short: the software may be reused under the MIT terms, and the written/visual system material may be shared and adapted, including commercially, with attribution under CC BY 4.0.
