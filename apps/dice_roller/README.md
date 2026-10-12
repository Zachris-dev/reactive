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

One skill performs a simple roll. Two sides perform a complete opposed roll, including any nested Risk contests.

For opposed rolls, each side's skill list is consumed one entry per contest frame. Later entries are used for nested Risk contests. Once a list is exhausted, further Risk tests use Skill 0. Doubling never consumes another skill because it remains part of the same test.

A side's own Risk trigger places Risk on that same side. One-sided Edge may place Risk on the opponent; both sides having Edge in the same contest creates automatic double Risk.

Ordinary totals from nested Risk contests do not replace the initial opposed totals. Risk flags accumulate through the stack, while a fumble in a nested contest propagates back and forces that side's final opposed total to 0. The greatest fumble severity is retained.

## Optional Edge policy

A one-sided Edge is a player choice after the contest result is known. The command-line tester needs a repeatable policy for that choice:

```text
--edge never
--edge always
```

The default is `never`. This setting does not affect the both-sides-Edge rule, which always produces automatic double Risk.

## Logging

`roll` defaults to `verbose` output. It also accepts:

```text
--log trace
--log verbose
--log summary
--log quiet
```

The rules engine itself does not print. It returns structured roll state and events; this tester decides how much to display.
