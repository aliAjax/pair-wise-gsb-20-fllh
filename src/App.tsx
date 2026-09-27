import { FormEvent, useEffect, useMemo, useReducer, useState } from "react";
import "./styles.css";
import type { Cabinet, LedgerState, Loan, Movement, MovementType, Slide } from "./ledger/types";
import {
  activeLoanOf,
  canStore,
  findCabinet,
  freeSlots,
  isTempOutOfRange,
  locationOf,
  overdueSlideIds,
  rangeCovers,
  slideAtSlot,
  slotCount,
  slotLabel,
} from "./ledger/occupancy";
import { clearLedger, loadLedger, saveLedger } from "./ledger/storage";
import { seedLedger } from "./ledger/seed";
import { ledgerReducer } from "./ledger/reducer";
import { fmt, toLocalInput } from "./ledger/format";

const KEEP_PRESETS = [
  { label: "常温 15~27°C", min: 15, max: 27 },
  { label: "冷藏 2~8°C", min: 2, max: 8 },
  { label: "冷冻 -25~-15°C", min: -25, max: -15 },
];

const MOVEMENT_META: Record<MovementType, { icon: string; label: string }> = {
  register: { icon: "🧫", label: "登记" },
  store: { icon: "🗄️", label: "入柜" },
  borrow: { icon: "🔬", label: "借出" },
  return: { icon: "↩️", label: "归还" },
  temp: { icon: "🌡️", label: "柜温" },
  freeze: { icon: "❄️", label: "冻结" },
  unfreeze: { icon: "✅", label: "解冻" },
};

type Modal = { kind: "slot"; cabinetId: string; slot: number } | { kind: "store"; slideId: string };

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function statusBadge(slide: Slide, overdueIds: Set<string>) {
  if (slide.status === "waiting") return <span className="badge badge-wait">候补筐</span>;
  if (slide.status === "on-loan") {
    return overdueIds.has(slide.id) ? (
      <span className="badge badge-overdue">逾期未还</span>
    ) : (
      <span className="badge badge-loan">借出中</span>
    );
  }
  return <span className="badge badge-ok">在柜</span>;
}

function MovementRow({ mv }: { mv: Movement }) {
  const meta = MOVEMENT_META[mv.type];
  return (
    <li>
      <span className={`mv-icon mv-${mv.type}`} title={meta.label}>
        {meta.icon}
      </span>
      <div>
        <p>{mv.note}</p>
        <time>{fmt(mv.at)}</time>
      </div>
    </li>
  );
}

/** 借出登记：观察者 + 预计归还时间 */
function BorrowForm({ onBorrow }: { onBorrow: (observer: string, due: string) => void }) {
  const [observer, setObserver] = useState("");
  const [due, setDue] = useState(() => toLocalInput(new Date(Date.now() + 4 * 3600_000)));
  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onBorrow(observer, due); }}>
      <label>
        <span>观察者</span>
        <input value={observer} onChange={(e) => setObserver(e.target.value)} placeholder="借用人姓名" />
      </label>
      <label>
        <span>预计归还时间</span>
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <button className="primary-action" type="submit">
        登记借出
      </button>
    </form>
  );
}

/** 空格位里直接放片：从候补筐选一张 */
function StoreHereForm({
  state,
  cabinet,
  slot,
  onStore,
}: {
  state: LedgerState;
  cabinet: Cabinet;
  slot: number;
  onStore: (slideId: string, cabinetId: string, slot: number) => void;
}) {
  const waiting = state.slides.filter((s) => s.status === "waiting");
  const [slideId, setSlideId] = useState(waiting[0]?.id ?? "");
  const slide = waiting.find((s) => s.id === slideId);
  const check = slide ? canStore(state, slide, cabinet.id, slot) : null;
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        if (slide && check?.ok) onStore(slide.id, cabinet.id, slot);
      }}
    >
      <label>
        <span>候补玻片</span>
        <select value={slideId} onChange={(e) => setSlideId(e.target.value)}>
          {waiting.map((s) => {
            const fits = rangeCovers(cabinet.range, s.keep);
            return (
              <option key={s.id} value={s.id} disabled={!fits}>
                {s.sample}（保存 {s.keep.min}~{s.keep.max}°C）{fits ? "" : " · 温度不符"}
              </option>
            );
          })}
        </select>
      </label>
      {check && !check.ok && <p className="form-error">{check.reason}</p>}
      <button className="primary-action" type="submit" disabled={!check?.ok}>
        放入 {slotLabel(cabinet.id, slot)}
      </button>
    </form>
  );
}

/** 候补筐发起入柜：选柜子、选空格位 */
function StoreSlotPicker({
  state,
  slide,
  onStore,
}: {
  state: LedgerState;
  slide: Slide;
  onStore: (slideId: string, cabinetId: string, slot: number) => void;
}) {
  const [cabinetId, setCabinetId] = useState(() => {
    const ok = state.cabinets.find((c) => !c.frozen && rangeCovers(c.range, slide.keep));
    return (ok ?? state.cabinets[0]).id;
  });
  const [slotPick, setSlotPick] = useState<number | null>(null);
  const cabinet = findCabinet(state, cabinetId) ?? state.cabinets[0];
  const slots = freeSlots(state, cabinet.id);
  const chosen = slotPick !== null && slots.includes(slotPick) ? slotPick : slots[0];
  const check = chosen !== undefined ? canStore(state, slide, cabinet.id, chosen) : null;
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        if (chosen !== undefined && check?.ok) onStore(slide.id, cabinet.id, chosen);
      }}
    >
      <label>
        <span>柜号</span>
        <select
          value={cabinetId}
          onChange={(e) => {
            setCabinetId(e.target.value);
            setSlotPick(null);
          }}
        >
          {state.cabinets.map((c) => {
            const fits = rangeCovers(c.range, slide.keep);
            return (
              <option key={c.id} value={c.id} disabled={c.frozen || !fits}>
                {c.name}{c.frozen ? "（已冻结）" : fits ? "" : "（温度不符）"}
              </option>
            );
          })}
        </select>
      </label>
      <label>
        <span>格位</span>
        <select value={chosen ?? ""} onChange={(e) => setSlotPick(Number(e.target.value))} disabled={slots.length === 0}>
          {slots.map((i) => (
            <option key={i} value={i}>
              {slotLabel(cabinet.id, i)}
            </option>
          ))}
        </select>
      </label>
      {slots.length === 0 && <p className="form-error">该柜暂无空位</p>}
      {check && !check.ok && <p className="form-error">{check.reason}</p>}
      <button className="primary-action" type="submit" disabled={chosen === undefined || !check?.ok}>
        确认入柜
      </button>
    </form>
  );
}

function App() {
  const [state, dispatch] = useReducer(ledgerReducer, null, (): LedgerState => loadLedger() ?? seedLedger());
  const [now, setNow] = useState(() => new Date());
  const [modal, setModal] = useState<Modal | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // 新片登记表单
  const [newSample, setNewSample] = useState("");
  const [newStain, setNewStain] = useState("");
  const [newKeep, setNewKeep] = useState(0);

  // 柜温记录表单
  const [tempCabinetId, setTempCabinetId] = useState(state.cabinets[0].id);
  const [tempInput, setTempInput] = useState("");

  // 本机留档：每次状态变化后落盘，重开页面可继续查
  useEffect(() => {
    saveLedger(state);
  }, [state]);

  // 逾期判断随时间刷新
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 3600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const overdueIds = useMemo(() => overdueSlideIds(state, now), [state, now]);
  const waitingSlides = state.slides.filter((s) => s.status === "waiting");
  const storedCount = state.slides.filter((s) => s.status === "stored").length;
  const loanCount = state.slides.filter((s) => s.status === "on-loan").length;
  const frozenCount = state.cabinets.filter((c) => c.frozen).length;

  const q = query.trim().toLowerCase();
  const matches = q
    ? state.slides.filter((s) => s.sample.toLowerCase().includes(q) || s.stain.toLowerCase().includes(q))
    : [];

  function handleRegister(e: FormEvent) {
    e.preventDefault();
    const sample = newSample.trim();
    if (!sample) {
      setFlash("请填写样本名称");
      return;
    }
    const keep = KEEP_PRESETS[newKeep];
    const at = new Date().toISOString();
    const slide: Slide = {
      id: uid("sl"),
      sample,
      stain: newStain.trim() || "未标注",
      status: "waiting",
      cabinetId: null,
      slot: null,
      keep: { min: keep.min, max: keep.max },
      createdAt: at,
    };
    dispatch({ type: "register", slide, at });
    setFlash(`「${sample}」已登记，先放入候补筐`);
    setNewSample("");
    setNewStain("");
  }

  function handleRecordTemp(e: FormEvent) {
    e.preventDefault();
    const cabinet = findCabinet(state, tempCabinetId);
    const temp = Number(tempInput);
    if (!cabinet) return;
    if (tempInput.trim() === "" || !Number.isFinite(temp)) {
      setFlash("请输入有效温度");
      return;
    }
    const out = temp < cabinet.range.min || temp > cabinet.range.max;
    dispatch({ type: "recordTemp", cabinetId: cabinet.id, temp, at: new Date().toISOString() });
    setFlash(
      out
        ? `已记录 ${temp}°C：超出保存范围，${cabinet.name} 已冻结，解决前不能入柜`
        : `已记录 ${cabinet.name} 柜温 ${temp}°C`
    );
    setTempInput("");
  }

  function handleUnfreeze(cabinet: Cabinet) {
    if (isTempOutOfRange(cabinet)) {
      setFlash(`${cabinet.name} 柜温仍超出范围，问题解决前不能解除冻结`);
      return;
    }
    dispatch({ type: "unfreeze", cabinetId: cabinet.id, at: new Date().toISOString() });
    setFlash(`${cabinet.name} 已解除冻结，可以入柜`);
  }

  function handleStore(slideId: string, cabinetId: string, slot: number) {
    const slide = state.slides.find((s) => s.id === slideId);
    if (!slide) return;
    const check = canStore(state, slide, cabinetId, slot);
    if (!check.ok) {
      setFlash(check.reason);
      return;
    }
    dispatch({ type: "store", slideId, cabinetId, slot, at: new Date().toISOString() });
    setFlash(`「${slide.sample}」已入柜 ${slotLabel(cabinetId, slot)}`);
    setModal(null);
  }

  function handleBorrow(slide: Slide, observer: string, dueLocal: string) {
    const name = observer.trim();
    if (!name) {
      setFlash("请填写观察者");
      return;
    }
    const due = new Date(dueLocal);
    if (Number.isNaN(due.getTime())) {
      setFlash("请填写预计归还时间");
      return;
    }
    if (due.getTime() <= Date.now()) {
      setFlash("预计归还时间需晚于当前时间");
      return;
    }
    const at = new Date().toISOString();
    const loan: Loan = { id: uid("ln"), slideId: slide.id, observer: name, borrowedAt: at, dueAt: due.toISOString(), returnedAt: null };
    dispatch({ type: "borrow", loan, at });
    setFlash(`「${slide.sample}」已借出给 ${name}，预计 ${fmt(loan.dueAt)} 归还`);
    setModal(null);
  }

  function handleReturn(slide: Slide) {
    dispatch({ type: "return", slideId: slide.id, at: new Date().toISOString() });
    setFlash(`「${slide.sample}」已归还入柜`);
    setModal(null);
  }

  function handleReset() {
    if (!window.confirm("确定清空本机台账并恢复示例数据吗？")) return;
    clearLedger();
    dispatch({ type: "reset", state: seedLedger() });
    setModal(null);
    setFlash("已恢复示例台账");
  }

  function renderModal() {
    if (!modal) return null;
    if (modal.kind === "store") {
      const slide = state.slides.find((s) => s.id === modal.slideId);
      if (!slide) return null;
      return (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">候补筐 → 入柜</p>
                <h3>「{slide.sample}」入柜登记</h3>
              </div>
              <button onClick={() => setModal(null)}>关闭</button>
            </div>
            <p className="modal-sub">
              染色 {slide.stain} · 保存要求 {slide.keep.min}~{slide.keep.max}°C · 一个格位只放一张片
            </p>
            <StoreSlotPicker state={state} slide={slide} onStore={handleStore} />
          </div>
        </div>
      );
    }

    const cabinet = findCabinet(state, modal.cabinetId);
    if (!cabinet) return null;
    const slide = slideAtSlot(state, cabinet.id, modal.slot);
    const loan = slide ? activeLoanOf(state, slide.id) : undefined;
    const overdue = slide ? overdueIds.has(slide.id) : false;
    const history = slide ? state.movements.filter((m) => m.slideId === slide.id).slice(-6).reverse() : [];
    return (
      <div className="modal-backdrop" onClick={() => setModal(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <p className="eyebrow">{cabinet.name}</p>
              <h3>格位 {slotLabel(cabinet.id, modal.slot)}</h3>
            </div>
            <button onClick={() => setModal(null)}>关闭</button>
          </div>

          {slide ? (
            <>
              <dl className="detail-list">
                <div>
                  <dt>样本</dt>
                  <dd>{slide.sample}</dd>
                </div>
                <div>
                  <dt>染色方式</dt>
                  <dd>{slide.stain}</dd>
                </div>
                <div>
                  <dt>保存要求</dt>
                  <dd>
                    {slide.keep.min}~{slide.keep.max}°C
                  </dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{statusBadge(slide, overdueIds)}</dd>
                </div>
                {loan && (
                  <div>
                    <dt>借出</dt>
                    <dd>
                      {loan.observer} · 应还 {fmt(loan.dueAt)}
                      {overdue && <span className="badge badge-overdue">已逾期</span>}
                    </dd>
                  </div>
                )}
              </dl>

              {slide.status === "stored" && (
                <>
                  <h4>借出登记</h4>
                  <BorrowForm onBorrow={(o, d) => handleBorrow(slide, o, d)} />
                </>
              )}
              {slide.status === "on-loan" && (
                <button className="primary-action" onClick={() => handleReturn(slide)}>
                  归还入柜
                </button>
              )}

              <h4>取放记录</h4>
              <ul className="timeline">
                {history.map((m) => (
                  <MovementRow key={m.id} mv={m} />
                ))}
              </ul>
            </>
          ) : cabinet.frozen ? (
            <p className="freeze-note">❄ {cabinet.freezeReason}。问题解决前不能继续入柜。</p>
          ) : waitingSlides.length === 0 ? (
            <p className="empty-hint">空位。候补筐暂无玻片，可先在左侧登记新片。</p>
          ) : (
            <>
              <p className="modal-sub">空位，可从候补筐选一张片放入（一格一片）。</p>
              <StoreHereForm state={state} cabinet={cabinet} slot={modal.slot} onStore={handleStore} />
            </>
          )}
        </div>
      </div>
    );
  }

  const metrics = [
    { label: "在柜玻片", value: storedCount },
    { label: "借出中", value: loanCount },
    { label: "逾期未还", value: overdueIds.size },
    { label: "候补筐", value: waitingSlides.length },
    { label: "冻结柜", value: frozenCount },
  ];
  const statusColors = ["status-ok", "status-watch", "status-danger", "status-wait", "status-frozen"];

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-06 · port 5106</p>
          <h1>玻片柜位台账</h1>
          <p className="subtitle">
            入库登记样本、柜号、格位与保存温度，一格一片；借出登记观察者和预计归还时间，逾期在柜位图上标红；
            新片先留候补筐，柜温超范围自动冻结，解决前不能入柜。
          </p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>React + Vite + TypeScript + CSS</strong>
          <span>资料 / 占用判断 / 本机留档分层，台账保存在本机 localStorage，重开不丢。</span>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m, i) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={statusColors[i % statusColors.length]} />
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="aside-stack">
          <section className="panel">
            <h2>新片登记</h2>
            <p className="panel-hint">新片先留在候补筐，分配格位后才算入柜。</p>
            <form className="form-grid" onSubmit={handleRegister}>
              <label>
                <span>样本名称</span>
                <input value={newSample} onChange={(e) => setNewSample(e.target.value)} placeholder="如：洋葱表皮" />
              </label>
              <label>
                <span>染色方式</span>
                <input value={newStain} onChange={(e) => setNewStain(e.target.value)} placeholder="如：碘液" />
              </label>
              <label>
                <span>保存温度</span>
                <select value={newKeep} onChange={(e) => setNewKeep(Number(e.target.value))}>
                  {KEEP_PRESETS.map((p, i) => (
                    <option key={p.label} value={i}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-action" type="submit">
                登记到候补筐
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>柜温记录</h2>
            <p className="panel-hint">超出保存范围会自动冻结对应柜子。</p>
            <form className="form-grid" onSubmit={handleRecordTemp}>
              <label>
                <span>柜号</span>
                <select value={tempCabinetId} onChange={(e) => setTempCabinetId(e.target.value)}>
                  {state.cabinets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}（{c.range.min}~{c.range.max}°C）
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>实测温度（°C）</span>
                <input value={tempInput} onChange={(e) => setTempInput(e.target.value)} placeholder="如：22" inputMode="decimal" />
              </label>
              <button type="submit">记录柜温</button>
            </form>
          </section>

          <section className="panel">
            <h2>样本查询</h2>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入样本名 / 染色方式" />
            {q &&
              (matches.length === 0 ? (
                <p className="empty-hint">没有找到「{query}」相关的玻片。</p>
              ) : (
                <div className="search-results">
                  {matches.map((s) => {
                    const history = state.movements.filter((m) => m.slideId === s.id).slice(-5).reverse();
                    return (
                      <article key={s.id} className="search-hit">
                        <div className="hit-head">
                          <strong>{s.sample}</strong>
                          {statusBadge(s, overdueIds)}
                        </div>
                        <p className="hit-loc">位置：{locationOf(state, s)}</p>
                        <ul>
                          {history.map((m) => (
                            <li key={m.id}>
                              <time>{fmt(m.at)}</time>
                              <span>{m.note}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    );
                  })}
                </div>
              ))}
          </section>
        </aside>

        <section>
          <div className="section-heading cabinet-heading">
            <div>
              <p>一格一片 · 逾期标红 · 冻结禁入</p>
              <h2>柜位图</h2>
            </div>
            <div className="legend">
              <span><i className="dot-stored" />在柜</span>
              <span><i className="dot-loan" />借出</span>
              <span><i className="dot-overdue" />逾期</span>
              <span><i className="dot-empty" />空位</span>
            </div>
          </div>

          {state.cabinets.map((cabinet) => {
            const out = isTempOutOfRange(cabinet);
            const free = freeSlots(state, cabinet.id).length;
            return (
              <article key={cabinet.id} className={`cabinet panel${cabinet.frozen ? " frozen" : ""}`}>
                <header className="cabinet-head">
                  <div>
                    <h3>{cabinet.name}</h3>
                    <p>
                      保存 {cabinet.range.min}~{cabinet.range.max}°C · 当前 {cabinet.currentTemp}°C · 空余 {free}/
                      {slotCount(cabinet)}
                    </p>
                  </div>
                  {cabinet.frozen ? (
                    <div className="cabinet-flags">
                      <span className="badge badge-frozen">❄ 已冻结</span>
                      {!out && <button onClick={() => handleUnfreeze(cabinet)}>解除冻结</button>}
                    </div>
                  ) : (
                    <span className={`badge ${out ? "badge-warn" : "badge-ok"}`}>{out ? "温度异常" : "正常"}</span>
                  )}
                </header>
                {cabinet.frozen && (
                  <p className="freeze-note">
                    ❄ {cabinet.freezeReason}。问题解决前不能继续入柜{out ? "；请先记录恢复后的柜温" : "，温度已恢复，可解除冻结"}。
                  </p>
                )}
                <div className="slot-grid" style={{ gridTemplateColumns: `repeat(${cabinet.cols}, minmax(0, 1fr))` }}>
                  {Array.from({ length: slotCount(cabinet) }, (_, i) => {
                    const slide = slideAtSlot(state, cabinet.id, i);
                    const overdue = slide ? overdueIds.has(slide.id) : false;
                    const loan = slide ? activeLoanOf(state, slide.id) : undefined;
                    const cls = slide
                      ? overdue
                        ? "slot slot-overdue"
                        : slide.status === "on-loan"
                          ? "slot slot-loan"
                          : "slot slot-stored"
                      : "slot slot-empty";
                    return (
                      <button
                        key={i}
                        className={cls}
                        onClick={() => setModal({ kind: "slot", cabinetId: cabinet.id, slot: i })}
                      >
                        <span className="slot-label">{slotLabel(cabinet.id, i)}</span>
                        {slide ? (
                          <>
                            <strong>{slide.sample}</strong>
                            <small>
                              {overdue && loan
                                ? `逾期 · 应还 ${fmt(loan.dueAt)}`
                                : slide.status === "on-loan"
                                  ? `借出 · ${loan ? loan.observer : ""}`
                                  : "在柜"}
                            </small>
                          </>
                        ) : (
                          <small>空位</small>
                        )}
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      </section>

      <section className="lower-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p>新片缓冲</p>
              <h2>候补筐（{waitingSlides.length}）</h2>
            </div>
          </div>
          {waitingSlides.length === 0 ? (
            <p className="empty-hint">候补筐已清空，新登记的玻片会先出现在这里。</p>
          ) : (
            <div className="basket-list">
              {waitingSlides.map((s) => (
                <article key={s.id} className="basket-item">
                  <div>
                    <h3>{s.sample}</h3>
                    <p>
                      {s.stain} · 保存 {s.keep.min}~{s.keep.max}°C · 登记于 {fmt(s.createdAt)}
                    </p>
                  </div>
                  <button className="primary-action" onClick={() => setModal({ kind: "store", slideId: s.id })}>
                    入柜
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>本机留档</p>
              <h2>取放记录</h2>
            </div>
            <button onClick={handleReset}>重置示例数据</button>
          </div>
          <ul className="timeline">
            {state.movements
              .slice(-12)
              .reverse()
              .map((m) => (
                <MovementRow key={m.id} mv={m} />
              ))}
          </ul>
        </section>
      </section>

      {renderModal()}
      {flash && <div className="toast">{flash}</div>}
    </main>
  );
}

export default App;
