// 资料层：柜位台账涉及的全部数据结构

export interface TempRange {
  min: number;
  max: number;
}

export interface Cabinet {
  id: string; // 柜号，如 "A"
  name: string;
  rows: number;
  cols: number;
  range: TempRange; // 柜子允许的保存温度范围
  currentTemp: number; // 最近一次记录的柜内温度
  frozen: boolean; // 温度超范围后冻结，解决前不能入柜
  freezeReason: string | null;
}

export type SlideStatus = "waiting" | "stored" | "on-loan";

export interface Slide {
  id: string;
  sample: string; // 样本名
  stain: string; // 染色方式
  status: SlideStatus; // waiting=候补筐 stored=在柜 on-loan=借出中
  cabinetId: string | null;
  slot: number | null; // 0 起始的格位序号；借出期间保留原格位
  keep: TempRange; // 该玻片要求的保存温度
  createdAt: string;
}

export interface Loan {
  id: string;
  slideId: string;
  observer: string; // 观察者（借用人）
  borrowedAt: string;
  dueAt: string; // 预计归还时间
  returnedAt: string | null;
}

export type MovementType =
  | "register" // 登记新片（进候补筐）
  | "store" // 入柜
  | "borrow" // 借出
  | "return" // 归还
  | "temp" // 柜温记录
  | "freeze" // 温度超范围冻结
  | "unfreeze"; // 解除冻结

export interface Movement {
  id: string;
  at: string;
  type: MovementType;
  slideId: string | null;
  cabinetId: string | null;
  slot: number | null;
  note: string;
}

export interface LedgerState {
  cabinets: Cabinet[];
  slides: Slide[];
  loans: Loan[];
  movements: Movement[];
}
