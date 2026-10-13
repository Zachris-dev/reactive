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

One skill performs a simple roll. Two sides perform a complete opposed roll, including any nested Risk contests. Opposed CLI output also runs each returned contest through the resolution engine with no additional selected modifiers, so it reports Equal, Carryover, or Success Level as a baseline result.

For opposed rolls, each side's skill list is consumed one entry per contest frame. Later entries are used for nested Risk contests. Once a list is exhausted, further Risk tests use Skill 0. Doubling never consumes another skill because it remains part of the same test.

A side's own Risk trigger places Risk on that same side. One-sided Edge may place Risk on the opponent; both sides having Edge in the same contest creates automatic double Risk.

Every opposed contest frame produces its own return value for later resolution. If Risk creates a nested contest, that Risk contest returns first; the engine then unwinds to the enclosing contest, eventually returning the original opposed roll last. A deep Risk chain can therefore produce many resolution results.

Risk flags accumulate through the stack. A fumble in a nested contest propagates outward to each enclosing return value, forcing that side's total to 0 there and preserving the greatest fumble severity. A fumble in an enclosing contest does not rewrite a deeper result that was already rolled.


## Resumable opposed-roll sessions

Normal play does not have to finish an entire opposed roll in one call. The shared engine now exposes a serializable session with `startOpposedSession()` and `advanceOpposedSession()`. It advances automatically until it reaches something the outside application must supply:

- a fractional-rounding d10;
- a 3d6 result, including another 3d6 after a triple;
- a one-sided Edge decision;
- newly selected skills for a Risk contest; or
- comparative scores ready for resolution.

A Risk therefore pauses before the new contest. The player and GM can select the next relevant unused skills, those new skills are rounded independently if necessary, and then rolling continues. Once the deepest Risk contest is finished, score resolution proceeds deepest to original. The score request also exposes the complete returned-contest array, so a GM interface can display the entire tangled contest stack at once while highlighting the result currently being resolved.

Each skill presentation is preserved as data, including its display name. When a caller supplies only a numeric value, the engine generates a name from the unrounded value. An exact 4.0 skill from the standalone roller is:

```text
{ name: "Skill 4.0", supplied: 40, rounded: 4 }
```

A fractional 3.3 that rounded up on a d10 result of 2 is:

```text
{ name: "Skill 3.3", supplied: 33, rounded: 4, fractionDie: 2 }
```

A character sheet can instead supply the real skill name:

```text
{ name: "Longsword", supplied: 33, rounded: 4, fractionDie: 2 }
```

The name always describes the selected, unrounded skill; it is not regenerated from the rounded value.

Doubling remains part of the same test and therefore reuses that stored rounded value. A newly selected Risk skill is a new presentation and receives its own fractional-rounding roll when needed. All previous dice steps and presented skills remain in the session state.

The batch `rollOpposed()` helper used by the CLI and deterministic cases now drives this same resumable session automatically. This keeps automated tests on the same control-flow path intended for the eventual graphical application.

## Deterministic engine cases

The repository also contains an ordered suite of deliberately non-random cases. These begin with ordinary simple rolls and then introduce fractional rounding, Edge, Risk, doubling and fumbles before moving into opposed rolls, nested Risk, both-side Risk, Edge-created Risk, doubling inside Risk contests, deeper nesting, propagated fumbles, a five-frame Risk chain that verifies five separate return values in deepest-first resolution order, and separate fractional rounding for newly selected Risk skills. The later cases exercise result resolution: Equal versus Carryover, Effect modifiers and Risk, modifier-created/worsened fumbles, double-fumble results on both sides, preservation of doubled-Risk versus circumstances fumble provenance for GM narration, and the rule that Risk reduces ordinary success but never the Success Level supplied by an opponent fumble.

Run the readable walkthrough with:

```text
cases.cmd
```

or:

```text
npm run cases
```

The same logging levels are available:

```text
cases.cmd --log trace
cases.cmd --log verbose
cases.cmd --log summary
cases.cmd --log quiet
```

`test.cmd` also runs these deterministic cases in quiet assertion mode after the ordinary unit tests, so a regression in any defined scenario fails the normal test suite.

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


## Result resolution

Opposed roll generation and result resolution are separate stages. The shared engine exposes `resolveOpposedReturn()` for resolving one returned contest.

The UI/game-state layer decides which stored scene and character modifiers apply to this particular result. Resolution receives only the selected effective signed entries. Mitigation is calculated before submission, including the rule that excess mitigation cannot become a bonus. Penalties are negative and explicit bonuses are positive; the engine preserves the submitted names and values in the resolution history.

Resolution order is:

1. apply the selected roll-total modifiers to each returned total;
2. a modified total of 0 creates Fumble 1, -1 creates Fumble 2, and so on, preserving any worse fumble already produced by rolling; resolution also preserves whether the fumble came from doubled Risk during the roll, from circumstances during resolution, or from both;
3. compare the modified totals;
4. difference 0 is Equal, difference 1 is Carryover to the higher side, and difference 2+ is Success for the higher side;
5. only Success applies the signed Effect modifiers selected for that winning side, then divides the adjusted margin by 2 and floors it;
6. Risk on the winner reduces only the ordinary Success Level by 1;
7. a fumble imposes a minimum effect level equal to its severity after that Risk adjustment. A level supplied by the opponent's fumble is not reduced by the winner's Risk; fumbles can also create an effect on an otherwise Equal/Carryover contest and can produce effects on both sides after a double fumble.

Scene/character modifier storage, mitigation, duration, and whether a stored modifier applies to a particular roll remain outside the resolution calculation.
