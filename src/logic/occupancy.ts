import type { Cabinet, Slide, SlotRef } from "../data/types";

export function slotKey(ref: Pick<SlotRef, "row" | "col">): string {
  return `${ref.row}-${ref.col}`;
}

/** 占用判断：该格位当前是否被一张玻片占据（在柜或借出保留的格位都算占用） */
export function slideAt(slides: Slide[], cabinetId: string, row: number, col: number): Slide | undefined {
  return slides.find(
    (slide) =>
      slide.slot !== null &&
      slide.slot.cabinetId === cabinetId &&
      slide.slot.row === row &&
      slide.slot.col === col,
  );
}

export function isSlotFree(slides: Slide[], cabinetId: string, row: number, col: number): boolean {
  return slideAt(slides, cabinetId, row, col) === undefined;
}

/** 柜子中所有空闲格位（冻结状态不在此判断，由入柜流程另行拦截） */
export function freeSlots(cabinet: Cabinet, slides: Slide[]): SlotRef[] {
  const result: SlotRef[] = [];
  for (let row = 1; row <= cabinet.rows; row += 1) {
    for (let col = 1; col <= cabinet.cols; col += 1) {
      if (isSlotFree(slides, cabinet.id, row, col)) {
        result.push({ cabinetId: cabinet.id, row, col });
      }
    }
  }
  return result;
}

/**
 * 温度冻结判断：柜内（在柜状态）玻片的保存温度范围不包含柜子当前温度时，
 * 该柜视为冻结。借出中的玻片不在柜内，不参与判断。
 */
export function frozenSlides(cabinet: Cabinet, slides: Slide[]): Slide[] {
  return slides.filter(
    (slide) =>
      slide.status === "stored" &&
      slide.slot?.cabinetId === cabinet.id &&
      slide.tempMin !== null &&
      slide.tempMax !== null &&
      (cabinet.currentTemp < slide.tempMin || cabinet.currentTemp > slide.tempMax),
  );
}

export function isCabinetFrozen(cabinet: Cabinet, slides: Slide[]): boolean {
  return frozenSlides(cabinet, slides).length > 0;
}

/** 借出登记的预计归还时间早于当前时间即逾期 */
export function isOverdue(slide: Slide, now: Date): boolean {
  return slide.status === "lent" && slide.dueAt !== null && new Date(slide.dueAt).getTime() < now.getTime();
}

export function formatSlot(ref: SlotRef, cabinets: Cabinet[]): string {
  const cabinet = cabinets.find((item) => item.id === ref.cabinetId);
  const name = cabinet ? cabinet.name : `${ref.cabinetId}柜`;
  return `${name} · ${ref.row}排${ref.col}位`;
}

/** 样本当前位置的文字描述，用于检索结果与借还台账 */
export function locationText(slide: Slide, cabinets: Cabinet[]): string {
  if (slide.status === "basket") {
    return "候补筐（新片尚未入柜）";
  }
  if (slide.slot === null) {
    return "未知格位";
  }
  const pos = formatSlot(slide.slot, cabinets);
  return slide.status === "lent" ? `借出中 · 归属格位 ${pos}` : `在柜 · ${pos}`;
}

export function tempRangeText(slide: Slide): string {
  if (slide.tempMin === null || slide.tempMax === null) {
    return "入库时登记";
  }
  return `${slide.tempMin}~${slide.tempMax}℃`;
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}
