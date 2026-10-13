# Simple Dice Roller web prototype

From the repository root:

    npm install
    npm run build:web

Serve the repository's \`apps/dice_roller/web\` directory using an HTTP static file server
(for example \`python -m http.server 8000 --directory apps/dice_roller/web\`)
and open http://localhost:8000.

The web build uses esbuild to bundle the shared TypeScript rules engine.
No network is needed to roll dice once the app files are available locally.

Manual mode: type digits or use the on-screen buttons. The fractional d10,
if needed, appears above the 3d6 dice. The same Continue confirms both.
A triple requests another 3d6 without rerolling the fraction.
The manual/automatic preference persists in localStorage.

This first prototype tracks *one participant's* dice, including Risk triggered
by that participant or reported from an opponent. It does not calculate a full
opposed outcome or campaign effects.
