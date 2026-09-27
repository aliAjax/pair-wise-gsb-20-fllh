// 台账状态流转：每个动作都追加一条取放记录，reducer 保持纯函数

import type { LedgerState, Loan, Movement, MovementType, Slide } from "./types";
import { canStore, findCabinet, isTempOutOfRange, slotLabel } from "./occupancy";
import { fmt } from "./format";

export type LedgerAction =
  | { type: "register"; slide: Slide; at: string }
  | { type: "store"; slideId: string; cabinetId: string; slot: number; at: string }
  | { type: "borrow"; loan: Loan; at: string }
  | { type: "return"; slideId: string; at: string }
  | { type: "recordTemp"; cabinetId: string; temp: number; at: string }
  | { type: "unfreeze"; cabinetId: string; at: string }
  | { type: "reset"; state: LedgerState };

function record(
  state: LedgerState,
  type: MovementType,
  at: string,
  note: string,
  slideId: string | null,
  cabinetId: string | null,
  slot: number | null
): Movement {
  return { id: `mv-${state.movements.length + 1}-${at}`, at, type, slideId, cabinetId, slot, note };
}

export function ledgerReducer(state: LedgerState, action: LedgerAction): LedgerState {
  switch (action.type) {
    case "register": {
      const slide = action.slide;
      const mv = record(state, "register", action.at, `登记新片「${slide.sample}」，暂存候补筐`, slide.id, null, null);
      return { ...state, slides: [...state.slides, slide], movements: [...state.movements, mv] };
    }

    case "store": {
      const slide = state.slides.find((s) => s.id === action.slideId);
      if (!slide) return state;
      if (!canStore(state, slide, action.cabinetId, action.slot).ok) return state;
      const cabinet = findCabinet(state, action.cabinetId);
      const label = `${cabinet ? cabinet.name : action.cabinetId} ${slotLabel(action.cabinetId, action.slot)}`;
      const slides = state.slides.map((s) =>
        s.id === slide.id ? { ...s, status: "stored" as const, cabinetId: action.cabinetId, slot: action.slot } : s
      );
      const mv = record(state, "store", action.at, `「${slide.sample}」入柜 ${label}`, slide.id, action.cabinetId, action.slot);
      return { ...state, slides, movements: [...state.movements, mv] };
    }

    case "borrow": {
      const loan = action.loan;
      const slide = state.slides.find((s) => s.id === loan.slideId);
      if (!slide || slide.status !== "stored") return state;
      const slides = state.slides.map((s) => (s.id === slide.id ? { ...s, status: "on-loan" as const } : s));
      const mv = record(
        state,
        "borrow",
        action.at,
        `「${slide.sample}」借出 · 观察者 ${loan.observer} · 预计归还 ${fmt(loan.dueAt)}`,
        slide.id,
        slide.cabinetId,
        slide.slot
      );
      return { ...state, slides, loans: [...state.loans, loan], movements: [...state.movements, mv] };
    }

    case "return": {
      const slide = state.slides.find((s) => s.id === action.slideId);
      if (!slide) return state;
      const loan = state.loans.find((l) => l.slideId === slide.id && l.returnedAt === null);
      if (!loan) return state;
      const loans = state.loans.map((l) => (l.id === loan.id ? { ...l, returnedAt: action.at } : l));
      const slides = state.slides.map((s) => (s.id === slide.id ? { ...s, status: "stored" as const } : s));
      const label = slide.cabinetId !== null && slide.slot !== null ? slotLabel(slide.cabinetId, slide.slot) : "";
      const mv = record(state, "return", action.at, `「${slide.sample}」归还入柜 ${label}`, slide.id, slide.cabinetId, slide.slot);
      return { ...state, loans, slides, movements: [...state.movements, mv] };
    }

    case "recordTemp": {
      const cabinet = findCabinet(state, action.cabinetId);
      if (!cabinet || !Number.isFinite(action.temp)) return state;
      let cabinets = state.cabinets.map((c) => (c.id === cabinet.id ? { ...c, currentTemp: action.temp } : c));
      const movements = [
        ...state.movements,
        record(
          state,
          "temp",
          action.at,
          `${cabinet.name} 柜温记录 ${action.temp}°C（保存范围 ${cabinet.range.min}~${cabinet.range.max}°C）`,
          null,
          cabinet.id,
          null
        ),
      ];
      const outOfRange = action.temp < cabinet.range.min || action.temp > cabinet.range.max;
      if (outOfRange && !cabinet.frozen) {
        const reason = `柜温 ${action.temp}°C 超出保存范围 ${cabinet.range.min}~${cabinet.range.max}°C`;
        cabinets = cabinets.map((c) => (c.id === cabinet.id ? { ...c, frozen: true, freezeReason: reason } : c));
        movements.push(record(state, "freeze", action.at, `${cabinet.name} 冻结：${reason}，解决前暂停入柜`, null, cabinet.id, null));
      }
      return { ...state, cabinets, movements };
    }

    case "unfreeze": {
      const cabinet = findCabinet(state, action.cabinetId);
      if (!cabinet || !cabinet.frozen) return state;
      if (isTempOutOfRange(cabinet)) return state; // 温度未恢复，问题未解决，不能解冻
      const cabinets = state.cabinets.map((c) => (c.id === cabinet.id ? { ...c, frozen: false, freezeReason: null } : c));
      const mv = record(state, "unfreeze", action.at, `${cabinet.name} 温度恢复 ${cabinet.currentTemp}°C，解除冻结`, null, cabinet.id, null);
      return { ...state, cabinets, movements: [...state.movements, mv] };
    }

    case "reset":
      return action.state;

    default:
      return state;
  }
}
