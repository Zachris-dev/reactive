# Reactive Dice Roller

This is the command-line test interface for the shared Reactive rules engine.

The first implementation is intentionally text based so that the rules can be inspected and tested before a graphical character sheet or dice roller is built.

## Current commands

Skills are supplied as integer tenths: `40` means 4.0, `33` means 3.3.

```text
npm run roll -- roll 33
npm run roll -- roll 33 25
npm run roll -- roll --a-skills "40,32,11" --b-skills "36,23"
```

One skill/skill list performs a simple roll. Two sides perform one opposed contest frame.

Skill lists reserve later entries for nested Risk contests. Once a list is exhausted, further Risk tests use Skill 0. Doubling never consumes another skill because it remains part of the same test.

The current milestone implements the complete low-level simple-roll chain and the first opposed contest frame, including fractional rounding, Risk detection, Edge detection, doubling, fumbles, roll values, and the both-sides-Edge automatic double-Risk interaction. The higher-level nested Risk state machine is the next engine step.

## Logging

`roll` defaults to `verbose` output. It also accepts:

```text
--log trace
--log verbose
--log summary
--log quiet
```

The rules engine itself does not print. It returns structured roll state and events; this tester decides how much to display.
