// 初始示例台账：三个温度柜、在柜/借出/候补的玻片，以及对应的取放记录

import type { Cabinet, LedgerState, Loan, Movement, Slide } from "./types";

export function seedLedger(): LedgerState {
  const t = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

  const cabinets: Cabinet[] = [
    { id: "A", name: "A柜 · 常温切片柜", rows: 3, cols: 4, range: { min: 15, max: 27 }, currentTemp: 22, frozen: false, freezeReason: null },
    { id: "B", name: "B柜 · 冷藏柜", rows: 3, cols: 4, range: { min: 2, max: 8 }, currentTemp: 5, frozen: false, freezeReason: null },
    {
      id: "C",
      name: "C柜 · 冷冻柜",
      rows: 2,
      cols: 4,
      range: { min: -25, max: -15 },
      currentTemp: -8,
      frozen: true,
      freezeReason: "柜温 -8°C 超出保存范围 -25~-15°C",
    },
  ];

  const slides: Slide[] = [
    { id: "s1", sample: "洋葱表皮", stain: "碘液", status: "stored", cabinetId: "A", slot: 0, keep: { min: 15, max: 27 }, createdAt: t(50) },
    { id: "s2", sample: "人血涂片", stain: "瑞氏染色", status: "stored", cabinetId: "A", slot: 1, keep: { min: 15, max: 27 }, createdAt: t(49) },
    { id: "s3", sample: "草履虫", stain: "活体观察", status: "on-loan", cabinetId: "A", slot: 2, keep: { min: 15, max: 27 }, createdAt: t(30) },
    { id: "s4", sample: "南瓜茎纵切", stain: "番红-固绿", status: "stored", cabinetId: "B", slot: 0, keep: { min: 2, max: 8 }, createdAt: t(25) },
    { id: "s5", sample: "酵母菌涂片", stain: "亚甲蓝", status: "waiting", cabinetId: null, slot: null, keep: { min: 2, max: 8 }, createdAt: t(6) },
    { id: "s6", sample: "蛙血涂片", stain: "瑞氏染色", status: "waiting", cabinetId: null, slot: null, keep: { min: 15, max: 27 }, createdAt: t(5) },
  ];

  const loans: Loan[] = [
    { id: "l1", slideId: "s2", observer: "李楠", borrowedAt: t(20), dueAt: t(14), returnedAt: t(16) },
    { id: "l2", slideId: "s3", observer: "王晓", borrowedAt: t(26), dueAt: t(2), returnedAt: null },
  ];

  const mv = (
    id: number,
    hoursAgo: number,
    type: Movement["type"],
    note: string,
    slideId: string | null = null,
    cabinetId: string | null = null,
    slot: number | null = null
  ): Movement => ({ id: `mv-${id}`, at: t(hoursAgo), type, slideId, cabinetId, slot, note });

  const movements: Movement[] = [
    mv(1, 50, "register", "登记新片「洋葱表皮」，暂存候补筐", "s1"),
    mv(2, 49, "register", "登记新片「人血涂片」，暂存候补筐", "s2"),
    mv(3, 48, "store", "「洋葱表皮」入柜 A柜 · 常温切片柜 A-01", "s1", "A", 0),
    mv(4, 48, "store", "「人血涂片」入柜 A柜 · 常温切片柜 A-02", "s2", "A", 1),
    mv(5, 30, "register", "登记新片「草履虫」，暂存候补筐", "s3"),
    mv(6, 29, "store", "「草履虫」入柜 A柜 · 常温切片柜 A-03", "s3", "A", 2),
    mv(7, 26, "borrow", "「草履虫」借出 · 观察者 王晓", "s3", "A", 2),
    mv(8, 25, "register", "登记新片「南瓜茎纵切」，暂存候补筐", "s4"),
    mv(9, 24, "store", "「南瓜茎纵切」入柜 B柜 · 冷藏柜 B-01", "s4", "B", 0),
    mv(10, 20, "borrow", "「人血涂片」借出 · 观察者 李楠", "s2", "A", 1),
    mv(11, 16, "return", "「人血涂片」归还入柜 A-02", "s2", "A", 1),
    mv(12, 8, "temp", "B柜 · 冷藏柜 柜温记录 5°C（保存范围 2~8°C）", null, "B"),
    mv(13, 6, "register", "登记新片「酵母菌涂片」，暂存候补筐", "s5"),
    mv(14, 5, "register", "登记新片「蛙血涂片」，暂存候补筐", "s6"),
    mv(15, 3, "temp", "C柜 · 冷冻柜 柜温记录 -8°C（保存范围 -25~-15°C）", null, "C"),
    mv(16, 3, "freeze", "C柜 · 冷冻柜 冻结：柜温 -8°C 超出保存范围 -25~-15°C，解决前暂停入柜", null, "C"),
  ];

  return { cabinets, slides, loans, movements };
}
