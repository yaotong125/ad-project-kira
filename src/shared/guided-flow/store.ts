"use client";

/** The running guided flow lives in sessionStorage, like lejar.ai's "lejar:guided-flow" (module 951668). */
export type FlowState = { flow: string; step: number; section?: string };

const KEY = "kira:guided-flow";
export const FLOW_CHANGE = "kira:guided-flow-change";

export function readFlow(): FlowState | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.flow !== "string" || !Number.isInteger(v.step) || v.step < 0) return null;
    return typeof v.section === "string" ? { flow: v.flow, step: v.step, section: v.section } : { flow: v.flow, step: v.step };
  } catch {
    return null;
  }
}

export function writeFlow(state: FlowState) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  window.dispatchEvent(new CustomEvent(FLOW_CHANGE));
}

export function clearFlow() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent(FLOW_CHANGE));
}
