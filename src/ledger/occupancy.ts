// 占用判断层：格位、温度、借还状态的纯函数判断，不碰界面也不碰存储

import type { Cabinet, LedgerState, Loan, Slide, TempRange } from "./types";

export function slotCount(cabinet: Cabinet): number {
  return cabinet.rows * cabinet.cols;
}

export function slotLabel(cabinetId: string, slot: number): string {
  return `${cabinetId}-${String(slot + 1).padStart(2, "0")}`;
}

export function findCabinet(state: LedgerState, cabinetId: string): Cabinet | undefined {
  return state.cabinets.find((c) => c.id === cabinetId);
}

/** 某格位上的玻片（借出中的玻片仍占原格位） */
export function slideAtSlot(state: LedgerState, cabinetId: string, slot: number): Slide | undefined {
  return state.slides.find((s) => s.cabinetId === cabinetId && s.slot === slot);
}

export function isSlotOccupied(state: LedgerState, cabinetId: string, slot: number): boolean {
  return slideAtSlot(state, cabinetId, slot) !== undefined;
}

export function freeSlots(state: LedgerState, cabinetId: string): number[] {
  const cabinet = findCabinet(state, cabinetId);
  if (!cabinet) return [];
  const result: number[] = [];
  for (let i = 0; i < slotCount(cabinet); i += 1) {
    if (!isSlotOccupied(state, cabinetId, i)) result.push(i);
  }
  return result;
}

export function activeLoanOf(state: LedgerState, slideId: string): Loan | undefined {
  return state.loans.find((l) => l.slideId === slideId && l.returnedAt === null);
}

export function isOverdue(loan: Loan, now: Date): boolean {
  return loan.returnedAt === null && new Date(loan.dueAt).getTime() < now.getTime();
}

export function overdueSlideIds(state: LedgerState, now: Date): Set<string> {
  const ids = new Set<string>();
  for (const loan of state.loans) {
    if (isOverdue(loan, now)) ids.add(loan.slideId);
  }
  return ids;
}

export function isTempOutOfRange(cabinet: Cabinet): boolean {
  return cabinet.currentTemp < cabinet.range.min || cabinet.currentTemp > cabinet.range.max;
}

/** 柜子温度范围是否覆盖玻片的保存要求 */
export function rangeCovers(outer: TempRange, inner: TempRange): boolean {
  return outer.min <= inner.min && outer.max >= inner.max;
}

export type StoreCheck = { ok: true } | { ok: false; reason: string };

/** 入柜校验：柜子存在、未冻结、格位合法、一格一片、温度匹配 */
export function canStore(state: LedgerState, slide: Slide, cabinetId: string, slot: number): StoreCheck {
  const cabinet = findCabinet(state, cabinetId);
  if (!cabinet) return { ok: false, reason: "柜号不存在" };
  if (cabinet.frozen) return { ok: false, reason: `${cabinet.name}已冻结，温度问题解决前不能入柜` };
  if (slot < 0 || slot >= slotCount(cabinet)) return { ok: false, reason: "格位超出范围" };
  if (isSlotOccupied(state, cabinetId, slot)) {
    return { ok: false, reason: `格位 ${slotLabel(cabinetId, slot)} 已有玻片，一个格位只放一张片` };
  }
  if (!rangeCovers(cabinet.range, slide.keep)) {
    return {
      ok: false,
      reason: `${cabinet.name}（${cabinet.range.min}~${cabinet.range.max}°C）不满足「${slide.sample}」的保存要求 ${slide.keep.min}~${slide.keep.max}°C`,
    };
  }
  return { ok: true };
}

/** 玻片当前位置的文字描述，供按样本查询 */
export function locationOf(state: LedgerState, slide: Slide): string {
  if (slide.status === "waiting" || slide.cabinetId === null || slide.slot === null) return "候补筐（未入柜）";
  const cabinet = findCabinet(state, slide.cabinetId);
  const where = cabinet
    ? `${cabinet.name} · 格位 ${slotLabel(slide.cabinetId, slide.slot)}`
    : `格位 ${slotLabel(slide.cabinetId, slide.slot)}`;
  if (slide.status === "on-loan") {
    const loan = activeLoanOf(state, slide.id);
    return `${where}（借出中 · ${loan ? loan.observer : "未知"}）`;
  }
  return where;
}
