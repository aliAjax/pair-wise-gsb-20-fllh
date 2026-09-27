import type { Cabinet, LedgerAction, LedgerEntry, LedgerState, Slide } from "./types";
import { uid } from "../logic/uid";

const cabinets: Cabinet[] = [
  { id: "A", name: "A柜", rows: 4, cols: 5, currentTemp: 4 },
  { id: "B", name: "B柜", rows: 3, cols: 4, currentTemp: -18 },
  { id: "C", name: "C柜", rows: 3, cols: 3, currentTemp: 23 },
];

function isoFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

/** 初始台账：包含在柜、借出（含逾期）、候补筐三种状态的玻片 */
export function seedLedger(): LedgerState {
  const slides: Slide[] = [
    {
      id: "sl-001",
      sample: "洋葱表皮",
      stain: "碘液",
      tempMin: 2,
      tempMax: 8,
      status: "stored",
      slot: { cabinetId: "A", row: 1, col: 1 },
      borrower: null,
      lentAt: null,
      dueAt: null,
    },
    {
      id: "sl-002",
      sample: "人血涂片",
      stain: "瑞氏染色",
      tempMin: 2,
      tempMax: 8,
      status: "stored",
      slot: { cabinetId: "A", row: 1, col: 2 },
      borrower: null,
      lentAt: null,
      dueAt: null,
    },
    {
      id: "sl-003",
      sample: "草履虫",
      stain: "活体观察",
      tempMin: 2,
      tempMax: 8,
      status: "lent",
      slot: { cabinetId: "A", row: 2, col: 1 },
      borrower: "王雨",
      lentAt: isoFromNow(-72),
      dueAt: isoFromNow(-24),
    },
    {
      id: "sl-004",
      sample: "酵母菌",
      stain: "亚甲基蓝",
      tempMin: -20,
      tempMax: -10,
      status: "stored",
      slot: { cabinetId: "B", row: 1, col: 1 },
      borrower: null,
      lentAt: null,
      dueAt: null,
    },
    {
      id: "sl-005",
      sample: "花粉母细胞",
      stain: "醋酸洋红",
      tempMin: -20,
      tempMax: -10,
      status: "lent",
      slot: { cabinetId: "B", row: 1, col: 2 },
      borrower: "李舟",
      lentAt: isoFromNow(-6),
      dueAt: isoFromNow(48),
    },
    {
      id: "sl-006",
      sample: "口腔上皮细胞",
      stain: "亚甲基蓝",
      tempMin: null,
      tempMax: null,
      status: "basket",
      slot: null,
      borrower: null,
      lentAt: null,
      dueAt: null,
    },
    {
      id: "sl-007",
      sample: "霉菌装片",
      stain: "乳酸酚棉蓝",
      tempMin: null,
      tempMax: null,
      status: "basket",
      slot: null,
      borrower: null,
      lentAt: null,
      dueAt: null,
    },
  ];

  const seedRows: Array<[string, string, LedgerAction, number, string]> = [
    ["sl-001", "洋葱表皮", "登记候补", -96, "新片登记，先留在候补筐等待入柜"],
    ["sl-001", "洋葱表皮", "入库", -90, "入柜 A柜 · 1排1位，保存温度 2~8℃"],
    ["sl-002", "人血涂片", "登记候补", -95, "新片登记，先留在候补筐等待入柜"],
    ["sl-002", "人血涂片", "入库", -89, "入柜 A柜 · 1排2位，保存温度 2~8℃"],
    ["sl-003", "草履虫", "登记候补", -92, "新片登记，先留在候补筐等待入柜"],
    ["sl-003", "草履虫", "入库", -85, "入柜 A柜 · 2排1位，保存温度 2~8℃"],
    ["sl-003", "草履虫", "借出", -72, "观察者 王雨，预计 48 小时内归还；原格位保留"],
    ["sl-004", "酵母菌", "登记候补", -80, "新片登记，先留在候补筐等待入柜"],
    ["sl-004", "酵母菌", "入库", -79, "入柜 B柜 · 1排1位，保存温度 -20~-10℃"],
    ["sl-005", "花粉母细胞", "登记候补", -30, "新片登记，先留在候补筐等待入柜"],
    ["sl-005", "花粉母细胞", "入库", -28, "入柜 B柜 · 1排2位，保存温度 -20~-10℃"],
    ["sl-005", "花粉母细胞", "借出", -6, "观察者 李舟，预计 48 小时后归还；原格位保留"],
    ["sl-006", "口腔上皮细胞", "登记候补", -3, "新片登记，先留在候补筐等待入柜"],
    ["sl-007", "霉菌装片", "登记候补", -1, "新片登记，先留在候补筐等待入柜"],
  ];

  const entries: LedgerEntry[] = seedRows.map(([slideId, sample, action, hours, detail]) => ({
    id: uid("ev"),
    slideId,
    sample,
    action,
    detail,
    at: isoFromNow(hours),
  }));

  entries.sort((a, b) => b.at.localeCompare(a.at));

  return { cabinets, slides, entries };
}
