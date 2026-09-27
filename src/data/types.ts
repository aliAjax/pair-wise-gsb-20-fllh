export type SlideStatus = "basket" | "stored" | "lent";

export interface Cabinet {
  id: string;
  name: string;
  rows: number;
  cols: number;
  /** 柜内当前温度 ℃ */
  currentTemp: number;
}

export interface SlotRef {
  cabinetId: string;
  row: number;
  col: number;
}

export interface Slide {
  id: string;
  sample: string;
  stain: string;
  /** 保存温度范围，入库登记时填写；候补筐中的玻片为 null */
  tempMin: number | null;
  tempMax: number | null;
  status: SlideStatus;
  /** 在柜或借出时占用的格位（一个格位只放一张片，借出期间格位保留） */
  slot: SlotRef | null;
  borrower: string | null;
  lentAt: string | null;
  dueAt: string | null;
}

export type LedgerAction = "登记候补" | "入库" | "借出" | "归还" | "冻结" | "解冻";

export interface LedgerEntry {
  id: string;
  slideId: string | null;
  sample: string;
  action: LedgerAction;
  detail: string;
  at: string;
}

export interface LedgerState {
  cabinets: Cabinet[];
  slides: Slide[];
  entries: LedgerEntry[];
}
