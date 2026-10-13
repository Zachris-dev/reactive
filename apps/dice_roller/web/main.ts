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
    dice: [], cursor: 0, steps: [], opponentRisk: false,
    useEdge: false, committed: false
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
  mode = value;
  localStorage.setItem(storageKey, value);
  const entry = current();
  if (entry?.stage === "dice" && !entry.committed) {
    entry.dice = entry.dice.map((_, i) => mode === "automatic" ? randomDie(entry.dice.length === 4 && i === 0 ? 10 : 6) : null);
    entry.cursor = 0;
  }
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
  entry.stage = "dice";
}
function digit(n: number): void {
  const entry = current();
  if (!entry || entry.committed || finished) return;
  if (entry.stage === "skill") {
    if (entry.slot === 0) entry.whole = n;
    else entry.fraction = n;
    entry.slot = entry.slot === 0 ? 1 : 0;
  } else if (entry.stage === "dice" && mode === "manual") {
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
  finished = true;
  render();
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
  let html = '<div class="readout">' +
    button(entry.whole === null ? "–" : String(entry.whole), "slot:0", !editable, "digit-display " + (editable && entry.slot === 0 ? "active" : "")) +
    '<span class="point">.</span>' +
    button(fractionalDisplay, "slot:1", !editable, "digit-display " + (editable && entry.slot === 1 ? "active" : "")) +
    '</div>';
  if (editable) html += keypad([0,1,2,3,4,5,6,7,8,9]) +
    '<p class="under-keypad">Skill input</p><div class="action-gap"></div>' +
    button("Continue →", "continue", entry.whole === null, "primary continue");
  return html;
}
function diceView(entry: Entry, editable: boolean): string {
  const value = entry.whole! * 10 + (entry.fraction ?? 0);
  const hasD10 = value % 10 !== 0 && entry.steps.length === 0;
  const heading = hasD10 ? '<p class="hint">d10 for fractional skill rounding (0 = 10)</p>' : "";
  let html = heading;
  if (hasD10) {
    html += '<div class="dice-row">' + dieBox(entry, 0, "d10", editable) + '</div>';
    if (editable && mode === "manual") html += keypad([1,2,3,4,5,6,7,8,9,10]);
  }
  const offset = hasD10 ? 1 : 0;
  html += '<p class="hint">3d6' + (entry.steps.length ? " — doubling ×" + (2 ** entry.steps.length) : "") + '</p>';
  html += '<div class="dice-row">' + [0,1,2].map(i => dieBox(entry, i + offset, "Die " + (i+1), editable)).join("") + '</div>';
  if (editable && mode === "manual") html += '<div class="three-keypads">' +
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
    (editable && mode === "manual" && entry.cursor === i ? "active" : "") + '"' +
    (!editable || mode !== "manual" ? ' disabled' : '') + '><span class="die-value">' +
    (value ?? "–") + '</span><small>' + label + '</small></button>';
}
function resultView(entry: Entry, editable: boolean): string {
  const r = entry.result!;
  const flags = [
    r.pendingRisk ? '<strong class="flag">Risk</strong>' : "",
    r.edgeAvailable ? '<strong class="flag">Edge available</strong>' : "",
    r.fumbleSeverity !== null ? '<strong class="flag danger">Fumble ' + r.fumbleSeverity + '</strong>' : "",
    entry.steps.length > 1 ? '<strong class="flag">Doubling ×' + (2 ** (entry.steps.length-1)) + '</strong>' : ""
  ].join("");
  let html = '<div class="result-total"><span>Preliminary total</span><strong>' + r.finalTotal +
    '</strong><small>Roll ' + r.finalRollValue + ' + skill ' + r.skill.rounded + '</small></div>' +
    '<div class="flags">' + flags + '</div>' +
    '<p class="hint">Dice: ' + r.steps.map(s => s.dice.join(", ") + (s.isTriple ? " → triple" : "")).join(" | ") + '</p>';
  if (editable) {
    if (r.edgeAvailable) html += button(entry.useEdge ? "Edge: use ✓" : "Edge: don't use", "edge", false, "secondary");
    html += button(entry.opponentRisk ? "Opponent Risk: Yes ✓" : "Opponent Risk: No", "opponent-risk", false, "secondary");
    html += '<div class="action-gap"></div>';
    if (r.pendingRisk || entry.opponentRisk) html += button("Continue to Risk skill →", "risk", false, "primary continue");
    else html += button("Finish roll", "finish", false, "primary continue");
  } else {
    html += '<p class="hint">Opponent Risk: ' + (entry.opponentRisk ? "Yes" : "No") +
      (r.edgeAvailable ? " · Edge used: " + (entry.useEdge ? "Yes" : "No") : "") + '</p>';
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
    if (entry.stage === "result") body =
      '<div class="step-history"><h3>Confirmed skill</h3>' + skillView(entry, false) + '</div>' +
      '<div class="step-history"><h3>Confirmed dice</h3>' +
      '<p>' + entry.steps.map((step, i) => '3d6 #' + (i+1) + ': ' + step.dice.join(", ")).join(" · ") +
      (entry.skill?.fractionDie !== undefined ? ' · d10: ' + entry.skill.fractionDie : '') +
      '</p></div>' + resultView(entry, active);
    return '<section class="pane ' + (active ? "current" : "past") + '"><div class="pane-heading">' +
      '<span>Contest ' + (i + 1) + '</span><span>' + (entry.stage === "skill" ? "Skill" : entry.stage === "dice" ? "Dice" : "Preliminary result") +
      '</span></div>' + body + '</section>';
  }).join("");
  root!.innerHTML = '<header><h1>Reactive Dice Roller</h1><div class="modes">' +
    button("Automatic", "mode:auto", false, mode === "automatic" ? "selected" : "") +
    button("Manual", "mode:manual", false, mode === "manual" ? "selected" : "") +
    '</div></header><main>' + cards +
    (finished ? '<section class="pane"><h2>Roll completed</h2>' + button("New roll", "new", false, "primary") + '</section>' : "") +
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
  if (action.startsWith("choose:") && entry.stage === "dice" && mode === "manual") {
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
    if (entry?.stage === "dice" && mode === "manual") {
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
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => undefined));
}
newRoll();
