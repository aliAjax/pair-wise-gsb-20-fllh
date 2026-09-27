import type { LedgerState } from "../data/types";

/**
 * 本机留档：台账数据保存在浏览器 localStorage，
 * 重开页面后仍可按样本查位置与取放记录。
 */
const STORAGE_KEY = "hxwl-06-cabinet-ledger-v1";

export function loadLedger(): LedgerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LedgerState;
    if (!Array.isArray(parsed.cabinets) || !Array.isArray(parsed.slides) || !Array.isArray(parsed.entries)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLedger(state: LedgerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 本机存储不可用时只影响刷新后的留档，不阻断台账操作
  }
}

export function clearLedger(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
