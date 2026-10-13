import {
  completeSimpleRoll,
  evaluateRollStep,
  presentStoredSkill,
  type PresentedSkill,
  type RollStep,
  type SimpleRollResult
} from "../../../packages/rules_engine/src";

type Mode = "automatic" | "manual";
type Stage = "skill" | "dice" | "result";
type Die = number | null;
interface Entry {
  id: number;
  stage: Stage;
  whole: Die;
  fraction: Die;
  slot: 0 | 1;
  skill?: PresentedSkill;
  dice: Die[];
  diceMode: Mode;
  cursor: number;
  steps: RollStep[];
  result?: SimpleRollResult;
  opponentRisk: boolean;
  useEdge: boolean;
  committed: boolean;
}
const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app element");

const storageKey = "reactive-dice-mode";
let mode: Mode = localStorage.getItem(storageKey) === "manual" ? "manual" : "automatic";
let entries: Entry[] = [];
let finished = false;
let nextId = 1;
let notice = "";

function newEntry(): Entry {
  return {
    id: nextId++, stage: "skill", whole: null, fraction: null, slot: 0,
    dice: [], diceMode: mode, cursor: 0, steps: [], opponentRisk: false,
    useEdge: true, committed: false
  };
}
function randomDie(sides: number): number {
  // Uniform integer using rejection sampling, with secure browser entropy.
  const limit = Math.floor(4294967296 / sides) * sides;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return (buffer[0] % sides) + 1;
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch] ?? ch));
}
function current(): Entry | undefined {
  return entries[entries.length - 1];
}
function setMode(value: Mode): void {
  const entry = current();
  // Switching to automatic can generate a roll only if none of the dice
  // in the current pane has been entered or generated yet.
  // A partial or complete roll must never be silently replaced.
  if (value === "automatic" &&
      entry?.stage === "dice" &&
      !entry.committed &&
      entry.diceMode === "manual" &&
      entry.dice.every(die => die === null)) {
    const fractional = entry.dice.length === 4;
    entry.dice = entry.dice.map((_, i) => randomDie(fractional && i === 0 ? 10 : 6));
    entry.diceMode = "automatic";
  }
  mode = value;
  localStorage.setItem(storageKey, value);
  render();
}
function prepareDice(entry: Entry): void {
  const value = entry.whole! * 10 + (entry.fraction ?? 0);
  // Fractional skill is presented after the optional d10 has been collected.
  if (value % 10 === 0) entry.skill = presentStoredSkill({ name: "Skill " + (value / 10).toFixed(1), supplied: value });
  else entry.skill = undefined;
  entry.dice = Array.from({length: value % 10 === 0 ? 3 : 4},
    (_, i) => mode === "automatic" ? randomDie(i === 0 && value % 10 !== 0 ? 10 : 6) : null);
  entry.cursor = 0;
  entry.diceMode = mode;
  entry.stage = "dice";
}
function digit(n: number): void {
  const entry = current();
  if (!entry || entry.committed || finished) return;
  if (entry.stage === "skill") {
    if (entry.slot === 0) entry.whole = n;
    else entry.fraction = n;
    entry.slot = entry.slot === 0 ? 1 : 0;
  } else if (entry.stage === "dice" && entry.diceMode === "manual") {
    const hasD10 = (entry.whole! * 10 + (entry.fraction ?? 0)) % 10 !== 0 && entry.steps.length === 0;
    if (hasD10 && entry.cursor === 0) {
      entry.dice[0] = n === 0 ? 10 : n;
    } else if (n >= 1 && n <= 6) {
      entry.dice[entry.cursor] = n;
    } else return;
    entry.cursor = (entry.cursor + 1) % entry.dice.length;
  }
  notice = "";
  render();
}
function continueStep(): void {
  const entry = current();
  if (!entry || entry.committed || finished) return;
  if (entry.stage === "skill") {
    if (entry.whole === null) return;
    prepareDice(entry);
  } else if (entry.stage === "dice") {
    if (entry.dice.some(d => d === null)) return;
    try {
      const value = entry.whole! * 10 + (entry.fraction ?? 0);
      const hasD10 = value % 10 !== 0 && entry.steps.length === 0;
      const numbers = entry.dice as number[];
      if (!entry.skill) {
        entry.skill = presentStoredSkill({ name: "Skill " + (value / 10).toFixed(1), supplied: value }, numbers[0]);
      }
      const offset = hasD10 ? 1 : 0;
      const triple = [numbers[offset], numbers[offset + 1], numbers[offset + 2]] as [number,number,number];
      const step = evaluateRollStep(entry.skill, triple, entry.steps.length);
      entry.steps.push(step);
      if (step.isTriple) {
        entry.diceMode = mode;
        entry.dice = Array.from({length: 3}, () => mode === "automatic" ? randomDie(6) : null);
        entry.cursor = 0;
      } else {
        entry.result = completeSimpleRoll(entry.skill, entry.steps);
        entry.stage = "result";
      }
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e);
    }
  }
  render();
}
function nextRisk(): void {
  const entry = current();
  if (!entry || entry.stage !== "result" || !entry.result) return;
  if (!entry.result.pendingRisk && !entry.opponentRisk) return;
  entry.committed = true;
  entries.push(newEntry());
  render();
}
function finish(): void {
  const entry = current();
  if (!entry || entry.stage !== "result") return;
  entry.committed = true;
  newRoll();
}
function newRoll(): void {
  entries = [newEntry()];
  finished = false;
  notice = "";
  render();
}
function button(label: string, action: string, disabled = false, cls = ""): string {
  return '<button type="button" class="' + cls + '" data-action="' + action + '"' +
    (disabled ? " disabled" : "") + '>' + escapeHtml(label) + '</button>';
}
function keypad(values: number[]): string {
  return '<div class="keypad">' + values.map(n => button(String(n), "digit:" + n, false, "key")).join("") + '</div>';
}
function skillView(entry: Entry, editable: boolean): string {
  const fractionalDisplay = entry.fraction === null ? (entry.whole === null ? "–" : "0") : String(entry.fraction);
  let html = '<p class="skill-label">' + (editable ? 'Input skill' : 'Skill') + '</p><div class="readout">' +
    button(entry.whole === null ? "–" : String(entry.whole), "slot:0", !editable, "digit-display " + (editable && entry.slot === 0 ? "active" : "")) +
    '<span class="point">.</span>' +
    button(fractionalDisplay, "slot:1", !editable, "digit-display " + (editable && entry.slot === 1 ? "active" : "")) +
    '</div>';
  if (editable) html += keypad([0,1,2,3,4,5,6,7,8,9]) +
    '<div class="action-gap"></div>' +
    button("Continue →", "continue", entry.whole === null, "primary continue");
  return html;
}
function diceView(entry: Entry, editable: boolean): string {
  const value = entry.whole! * 10 + (entry.fraction ?? 0);
  const hasD10 = value % 10 !== 0 && entry.steps.length === 0;
  const heading = hasD10 ? '<p class="hint">Skill fraction roll (d10; 0 = 10)</p>' : "";
  let html = heading;
  if (hasD10) {
    html += '<div class="dice-row">' + dieBox(entry, 0, "d10", editable) + '</div>';
    if (entry.dice[0] !== null) {
      const die = entry.dice[0]!;
      const fraction = value % 10;
      html += '<p class="rounding-note">' + die +
        (die <= fraction ? ' ≤ ' : ' > ') + fraction +
        ', round ' + (die <= fraction ? 'up' : 'down') + '</p>';
    }
    if (editable && entry.diceMode === "manual") html += keypad([1,2,3,4,5,6,7,8,9,10]);
  }
  const offset = hasD10 ? 1 : 0;
  if (entry.steps.length) html += '<p class="hint">Doubling ×' + (2 ** entry.steps.length) + '</p>';
  html += '<div class="dice-row">' + [0,1,2].map(i => dieBox(entry, i + offset, "Die " + (i+1), editable)).join("") + '</div>';
  if (editable && entry.diceMode === "manual") html += '<div class="three-keypads">' +
    [0,1,2].map(i => '<div class="die-keypad"><span>Die ' + (i + 1) + '</span>' +
      [1,2,3,4,5,6].map(n => button(String(n), "choose:" + (i + offset) + ":" + n, false, "key")).join("") +
      '</div>').join("") + '</div>';
  if (editable) html += '<div class="action-gap"></div>' +
    button("Continue →", "continue", entry.dice.some(d => d === null), "primary continue");
  return html;
}
function dieBox(entry: Entry, i: number, label: string, editable: boolean): string {
  const value = entry.dice[i];
  return '<button type="button" data-action="die:' + i + '" class="die-box ' +
    (editable && entry.diceMode === "manual" && entry.cursor === i ? "active" : "") + '"' +
    (!editable || entry.diceMode !== "manual" ? ' disabled' : '') + '><span class="die-value">' +
    (value ?? "–") + '</span><small>' + label + '</small></button>';
}
function resultView(entry: Entry, editable: boolean): string {
  const r = entry.result!;
  const fraction = r.skill.supplied % 10;
  const roundedUp = r.skill.rounded > Math.floor(r.skill.supplied / 10);
  const fractionExplanation = fraction === 0
    ? ''
    : '<p class="rounding-note">' + r.skill.fractionDie +
      (roundedUp ? ' ≤ ' : ' > ') + fraction + ', round ' +
      (roundedUp ? 'up' : 'down') + '</p>';
  const diceBoxes = (dice: readonly number[]) => '<div class="dice-row">' +
    dice.map((value, i) => '<div class="die-box result-die"><span class="die-value">' +
      value + '</span><small>Die ' + (i + 1) + '</small></div>').join('') + '</div>';
  const displayedSteps = r.steps.map((step, i) =>
    '<div class="result-step">' + (r.steps.length > 1
      ? '<p class="hint">Roll ' + (i + 1) + (step.isTriple ? ' — triple' : '') +
        ' (×' + step.multiplier + ')</p>' : '') + diceBoxes(step.dice) +
    '</div>').join('');
  const total = r.steps[r.steps.length - 1].sum;
  let html = '<div class="result-skill"><span>Skill for test:</span>' +
    '<strong>' + r.skill.rounded + '</strong>' + fractionExplanation + '</div>' +
    '<p class="result-label">Dice</p>' + displayedSteps +
    '<p class="calculation">Total: ' + total + ' → |' + total +
    ' − 10| = ' + Math.abs(total - 10) +
    (r.steps.length > 1 ? ' (doubling: highest roll value ' + r.finalRollValue + ')' : '') +
    ' + skill ' + r.skill.rounded + ' = <strong>' + r.finalTotal +
    '</strong></p>';
  // A fumble overrides the usual total. Do not imply that the arithmetic
  // calculated the forced zero.
  if (r.fumbleSeverity !== null) {
    html += '<p class="hint">Fumble overrides the calculated total to 0.</p>';
  }
  html += '<div class="result-flags">' +
    (r.pendingRisk ? '<div class="event-box risk-box">RISK!</div>' : '') +
    (r.edgeAvailable
      ? (editable
          ? button(entry.useEdge ? 'EDGE (press to pass)' : 'EDGE passed (press to use)', 'edge', false, 'event-box edge-box')
          : '<div class="event-box edge-box">' + (entry.useEdge ? 'EDGE' : 'EDGE passed') + '</div>')
      : '') +
    (r.fumbleSeverity !== null ? '<div class="event-box fumble-box">FUMBLE' +
      (r.fumbleSeverity > 1 ? ' ' + r.fumbleSeverity : '') + '</div>' : '') +
    '</div>';
  if (editable) {
    html += button(entry.opponentRisk ? 'Opponent Risk: Yes ✓' : 'Opponent Risk: No', 'opponent-risk', false, 'secondary');
    html += '<div class="action-gap"></div>';
    if (r.pendingRisk || entry.opponentRisk) html += button('Continue to Risk skill →', 'risk', false, 'primary continue');
    else html += button('Finish roll', 'finish', false, 'primary continue');
  } else {
    html += '<p class="hint">Opponent Risk: ' + (entry.opponentRisk ? 'Yes' : 'No') + '</p>';
  }
  return html;
}

function render(): void {
  const cards = entries.map((entry, i) => {
    const active = i === entries.length - 1 && !finished && !entry.committed;
    let body = "";
    if (entry.stage === "skill") body = skillView(entry, active);
    if (entry.stage === "dice") body =
      '<div class="step-history"><h3>Confirmed skill</h3>' + skillView(entry, false) + '</div>' +
      diceView(entry, active);
    if (entry.stage === "result") body = resultView(entry, active);
    return '<section class="pane ' + (active ? "current" : "past") + '"><div class="pane-heading">' +
      '<span>Contest ' + (i + 1) + '</span><span>' + (entry.stage === "skill" ? "Skill" : entry.stage === "dice" ? "Dice" : "Preliminary result") +
      '</span></div>' + body + '</section>';
  }).join("");
  root!.innerHTML = '<header><h1>Reactive Dice Roller</h1><div class="modes">' +
    button("Automatic", "mode:auto", false, mode === "automatic" ? "selected" : "") +
    button("Manual", "mode:manual", false, mode === "manual" ? "selected" : "") +
    '</div></header><main>' + cards +
    (notice ? '<p role="alert" class="error">' + escapeHtml(notice) + '</p>' : "") +
    '</main>';
}
root.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!target || target.disabled) return;
  const action = target.dataset.action!;
  const entry = current();
  if (action === "mode:auto") return setMode("automatic");
  if (action === "mode:manual") return setMode("manual");
  if (action === "new") return newRoll();
  if (!entry || finished || entry.committed) return;
  if (action.startsWith("digit:")) return digit(Number(action.slice(6)));
  if (action.startsWith("slot:") && entry.stage === "skill") { entry.slot = Number(action.slice(5)) as 0|1; return render(); }
  if (action.startsWith("die:") && entry.stage === "dice") { entry.cursor = Number(action.slice(4)); return render(); }
  if (action.startsWith("choose:") && entry.stage === "dice" && entry.diceMode === "manual") {
    const [, indexText, valueText] = action.split(":");
    const index = Number(indexText), value = Number(valueText);
    entry.dice[index] = value;
    entry.cursor = (index + 1) % entry.dice.length;
    return render();
  }
  if (action === "continue") return continueStep();
  if (action === "opponent-risk" && entry.stage === "result") { entry.opponentRisk = !entry.opponentRisk; return render(); }
  if (action === "edge" && entry.stage === "result") { entry.useEdge = !entry.useEdge; return render(); }
  if (action === "risk") return nextRisk();
  if (action === "finish") return finish();
});
document.addEventListener("keydown", event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  const target = event.target as HTMLElement;
  if (target.matches("input,textarea,select") || target.isContentEditable) return;
  if (event.key >= "0" && event.key <= "9") {
    const entry = current();
    if (entry?.stage === "dice" && entry.diceMode === "manual") {
      const hasD10 = (entry.whole! * 10 + (entry.fraction ?? 0)) % 10 !== 0 && entry.steps.length === 0;
      if (!(hasD10 && entry.cursor === 0) && Number(event.key) > 6) return;
    }
    event.preventDefault();
    digit(Number(event.key));
  } else if (event.key === "Enter") {
    event.preventDefault();
    continueStep();
  }
});
// During development do not register a service worker or cache application files.
// Remove any earlier dice-roller service worker and its old application cache.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then(registrations =>
    Promise.all(registrations.filter(registration =>
      registration.scope.startsWith(new URL("./", location.href).href)
    ).map(registration => registration.unregister()))
  ).catch(() => undefined);
}
if ("caches" in window) {
  void caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("reactive-dice-")).map(key => caches.delete(key))
  )).catch(() => undefined);
}
newRoll();
