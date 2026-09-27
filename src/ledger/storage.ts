// 本机留档层：台账的 localStorage 读写，与资料结构、占用判断互不相知

import type { LedgerState } from "./types";

const STORAGE_KEY = "hxwl-06-slide-ledger-v1";

export function loadLedger(): LedgerState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LedgerState;
    if (!parsed || !Array.isArray(parsed.cabinets) || !Array.isArray(parsed.slides)) return null;
    if (!Array.isArray(parsed.loans) || !Array.isArray(parsed.movements)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLedger(state: LedgerState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时保持页面可用，仅丢失留档
  }
}

export function clearLedger(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}
