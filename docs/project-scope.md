# Reactive Project Scope

This document records the intended scope of the Reactive software project so that early implementation decisions remain compatible with later character-sheet and campaign-management features.

## Core principle

Reactive should have one shared implementation of its mechanics. User interfaces call the rules engine; they do not reproduce the rules themselves.

The system is intended to support the same Setup → Contest → Effect structure across very different kinds of scenes, from seconds of combat to hours-long social, artistic, or other extended actions.

Human-readable system rules, examples, and explanations of the reasons behind rules belong under `RULES/`. Approved rules flowcharts belong under `RULES/charts/`. Software architecture and implementation planning remain under `docs/`.

## Major components

### Shared rules engine

The rules engine is responsible for Reactive's mechanical state and calculations, including:

- skill values stored and passed as integer tenths (`35` represents `3.5`);
- fractional skill rounding;
- 3d6 rolls;
- Risk and nested Risk contests;
- Edge;
- doubling and per-roll multipliers;
- fumbles and fumble severity;
- opposed rolls;
- result calculation and success levels;
- retaining complete roll history and flags needed by later resolution and narration.

Random number generation must be replaceable with supplied dice values so the mechanics can be tested exhaustively and unusual roll chains can be reproduced exactly.

### Dice roller

The dice roller is a standalone user interface to the shared rules engine. It should be useful for GM rolls, testing, and play where a digital character sheet is not being used.

The dice roller must not own character data or duplicate rules that belong in the rules engine.

### Character sheet

The character sheet is the primary player-facing application.

It is expected to support:

- campaign templates containing the available character-sheet templates;
- character-sheet templates containing 12 groups of 10 skills plus creation and advancement constraints;
- character creation using draggable group aptitudes and skill values;
- template validation and legal/illegal drop targets;
- a character becoming self-contained after creation rather than depending on its original template;
- base skills stored as integer tenths;
- effective skills displayed in play after group bonuses are applied;
- a creation-only effective-skill cap of 4.0;
- warning display when creation points would be wasted by the cap;
- normalization of wasted starting points when the character is finalized;
- clickable skills that start rolls through the shared rules engine;
- tracking skills already used during the current round;
- Risk selection that permits only relevant skills not previously used that round, falling back to Skill 0 when none are available;
- an End Round action that clears round-use state;
- creation, play, and XP/training interfaces;
- XP/training applied to base skills, with automatic improvement when thresholds are reached.

### Campaign synchronization

The long-term goal is a campaign helper rather than only a dice roller and isolated character sheet.

Campaign synchronization should support:

- a GM-side synchronized campaign store;
- player-specific synchronized data containing only material that player is authorized to receive;
- player character data and player notes;
- shared campaign material and handouts;
- GM-only material that is never downloaded to unauthorized player devices;
- repository-backed storage and version history where practical;
- offline/local-first use, with durable changes synchronized when a connection is available;
- conflicts preserved rather than silently overwritten;
- conflicting versions presented to the GM for resolution;
- transient local UI state remaining local unless it is part of a live shared interaction.

Separate repositories or equivalent true access boundaries should be used where necessary. Merely hiding GM files in the player UI is not considered access control.

### Live session synchronization

Some game actions require participants to share temporary state in real time rather than merely synchronize files after the fact.

In particular, an opposed roll may involve a GM and player, or two player-controlled sides, rolling from separate devices. The live synchronization layer should therefore be able to:

- create a shared opposed-roll session identified with the relevant campaign and participants;
- let each participating client submit or perform its own side of the roll through the shared rules engine;
- synchronize roll state needed by the opposed-roll procedure, including completion state, pending Risk, Edge use, doubling chains, fumbles, and nested Risk contests;
- preserve which participant is the recipient of Risk and propagate Risk and fumble state correctly through nested contests;
- allow one side to continue rolling when the other has completed or fumbled;
- hand the completed opposed-roll state to the common resolution procedure;
- avoid exposing hidden character or GM-only information merely because two clients are participating in the same roll;
- cope with temporary connection loss without silently inventing or discarding a roll result.

Live roll synchronization is conceptually separate from durable repository synchronization. Repository-backed storage is appropriate for campaign history and persistent data, while a live opposed roll may need a lower-latency session channel. The exact transport should remain an implementation choice until the rules engine and application data models are stable.

## Testing goals

Automated tests should systematically explore the rules rather than rely only on hand-written examples.

At minimum, tests should cover all basic 3d6 outcomes across relevant skill values and deliberately generated chains involving:

- Risk;
- Edge;
- doubling;
- fumbles of increasing severity;
- simultaneous and nested Risks;
- opposed rolls;
- propagation of Risk and fumble state through nested contests;
- result modifiers and success-level calculation.

Property-style tests should also check invariants such as fumble severity never decreasing, Edge not stacking, and Risk being cancelled when a fumble invalidates a still-pending Risk state.

## Platform direction

The preferred direction is a web-first, installable application usable on phones, tablets, and laptops. A Progressive Web App or similar local-first approach is attractive because it allows a common codebase while retaining offline use. Native packaging can be considered later if useful.

This is a design direction rather than a requirement to commit to a specific framework before the data models and rules engine are stable.
