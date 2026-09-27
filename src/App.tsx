import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type { Cabinet, LedgerEntry, LedgerState, Slide } from "./data/types";
import { seedLedger } from "./data/seed";
import { loadLedger, saveLedger, clearLedger } from "./storage/local";
import {
  fmtTime,
  formatSlot,
  freeSlots,
  frozenSlides,
  isCabinetFrozen,
  isOverdue,
  locationText,
  slotKey,
} from "./logic/occupancy";
import { uid } from "./logic/uid";
import { CabinetMap } from "./components/CabinetMap";
import { SearchPanel } from "./components/SearchPanel";

const project = {
  id: "hxwl-06",
  port: 5106,
  title: "显微镜玻片柜位台账",
  subtitle: "入库登记 · 一个格位一张片 · 借还跟踪 · 超温冻结 · 本机留档",
};

interface Notice {
  kind: "ok" | "err";
  text: string;
}

function withEntry(state: LedgerState, entry: Omit<LedgerEntry, "id" | "at">): LedgerState {
  return {
    ...state,
    entries: [{ id: uid("ev"), at: new Date().toISOString(), ...entry }, ...state.entries],
  };
}

function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function App() {
  const [state, setState] = useState<LedgerState>(() => loadLedger() ?? seedLedger());
  const [now, setNow] = useState(() => new Date());
  const [notice, setNotice] = useState<Notice | null>(null);

  // 新片登记
  const [newSample, setNewSample] = useState("");
  const [newStain, setNewStain] = useState("");

  // 入库登记
  const [storeSlideId, setStoreSlideId] = useState("");
  const [storeCabinetId, setStoreCabinetId] = useState("A");
  const [storeSlot, setStoreSlot] = useState("");
  const [tempMin, setTempMin] = useState("2");
  const [tempMax, setTempMax] = useState("8");

  // 借出登记
  const [lendSlideId, setLendSlideId] = useState("");
  const [borrower, setBorrower] = useState("");
  const [dueAt, setDueAt] = useState(() => localInputValue(new Date(Date.now() + 86_400_000)));

  // 本机留档 + 定时刷新逾期判断
  useEffect(() => {
    saveLedger(state);
  }, [state]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const basketSlides = useMemo(
    () => state.slides.filter((slide) => slide.status === "basket"),
    [state.slides],
  );
  const storedSlides = useMemo(
    () => state.slides.filter((slide) => slide.status === "stored"),
    [state.slides],
  );
  const lentSlides = useMemo(
    () => state.slides.filter((slide) => slide.status === "lent"),
    [state.slides],
  );
  const overdueCount = lentSlides.filter((slide) => isOverdue(slide, now)).length;
  const frozenCabinets = state.cabinets.filter((cabinet) => isCabinetFrozen(cabinet, state.slides));

  const selectedCabinet = state.cabinets.find((cabinet) => cabinet.id === storeCabinetId);
  const availableSlots = selectedCabinet ? freeSlots(selectedCabinet, state.slides) : [];
  const selectedStoreSlide = basketSlides.some((slide) => slide.id === storeSlideId) ? storeSlideId : "";
  const selectedLendSlide = storedSlides.some((slide) => slide.id === lendSlideId) ? lendSlideId : "";
  const selectedSlot = availableSlots.some((slot) => slotKey(slot) === storeSlot) ? storeSlot : "";

  // 新片先入候补筐
  function registerSlide() {
    const sample = newSample.trim();
    const stain = newStain.trim() || "未标注";
    if (!sample) {
      setNotice({ kind: "err", text: "请填写样本名称。" });
      return;
    }
    const slide: Slide = {
      id: uid("sl"),
      sample,
      stain,
      tempMin: null,
      tempMax: null,
      status: "basket",
      slot: null,
      borrower: null,
      lentAt: null,
      dueAt: null,
    };
    setState((prev) =>
      withEntry(
        { ...prev, slides: [...prev.slides, slide] },
        { slideId: slide.id, sample, action: "登记候补", detail: "新片登记，先留在候补筐等待入柜" },
      ),
    );
    setNewSample("");
    setNewStain("");
    setNotice({ kind: "ok", text: `「${sample}」已登记，新片先放在候补筐，待分配格位后入柜。` });
  }

  // 从候补筐入柜
  function storeSlide() {
    const slide = state.slides.find((item) => item.id === storeSlideId);
    const cabinet = state.cabinets.find((item) => item.id === storeCabinetId);
    if (!slide || slide.status !== "basket" || !cabinet) {
      setNotice({ kind: "err", text: "请先从候补筐选择一张玻片。" });
      return;
    }
    const min = Number(tempMin);
    const max = Number(tempMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      setNotice({ kind: "err", text: "保存温度范围填写有误，低温不得高于高温。" });
      return;
    }
    if (isCabinetFrozen(cabinet, state.slides)) {
      setNotice({ kind: "err", text: `${cabinet.name} 已冻结，温度问题解决前不能继续入柜。` });
      return;
    }
    const slot = availableSlots.find((item) => slotKey(item) === storeSlot);
    if (!slot) {
      setNotice({ kind: "err", text: "请选择空闲格位，一个格位只放一张片。" });
      return;
    }
    if (cabinet.currentTemp < min || cabinet.currentTemp > max) {
      setNotice({
        kind: "err",
        text: `${cabinet.name} 当前 ${cabinet.currentTemp}℃，不在该样本 ${min}~${max}℃ 保存范围内，入柜会立即触发冻结，请先调温。`,
      });
      return;
    }
    setState((prev) =>
      withEntry(
        {
          ...prev,
          slides: prev.slides.map((item) =>
            item.id === slide.id ? { ...item, status: "stored", slot, tempMin: min, tempMax: max } : item,
          ),
        },
        {
          slideId: slide.id,
          sample: slide.sample,
          action: "入库",
          detail: `入柜 ${formatSlot(slot, prev.cabinets)}，保存温度 ${min}~${max}℃`,
        },
      ),
    );
    setStoreSlideId("");
    setStoreSlot("");
    setNotice({ kind: "ok", text: `「${slide.sample}」已入柜 ${formatSlot(slot, state.cabinets)}。` });
  }

  // 借出：写明观察者和预计归还时间
  function lendSlide() {
    const slide = state.slides.find((item) => item.id === lendSlideId);
    const observer = borrower.trim();
    const due = new Date(dueAt);
    if (!slide || slide.status !== "stored") {
      setNotice({ kind: "err", text: "请选择一张在柜玻片。" });
      return;
    }
    if (!observer) {
      setNotice({ kind: "err", text: "请填写观察者（借用人）。" });
      return;
    }
    if (Number.isNaN(due.getTime())) {
      setNotice({ kind: "err", text: "请选择预计归还时间。" });
      return;
    }
    const pos = slide.slot ? formatSlot(slide.slot, state.cabinets) : "未知格位";
    setState((prev) =>
      withEntry(
        {
          ...prev,
          slides: prev.slides.map((item) =>
            item.id === slide.id
              ? { ...item, status: "lent", borrower: observer, lentAt: new Date().toISOString(), dueAt: due.toISOString() }
              : item,
          ),
        },
        {
          slideId: slide.id,
          sample: slide.sample,
          action: "借出",
          detail: `观察者 ${observer}，预计 ${fmtTime(due.toISOString())} 归还；原格位 ${pos} 保留`,
        },
      ),
    );
    setLendSlideId("");
    setBorrower("");
    setNotice({ kind: "ok", text: `「${slide.sample}」已借给 ${observer}，逾期将在柜位图上标出。` });
  }

  function returnSlide(slideId: string) {
    const slide = state.slides.find((item) => item.id === slideId);
    if (!slide || slide.status !== "lent") return;
    const pos = slide.slot ? formatSlot(slide.slot, state.cabinets) : "未知格位";
    setState((prev) =>
      withEntry(
        {
          ...prev,
          slides: prev.slides.map((item) =>
            item.id === slideId
              ? { ...item, status: "stored", borrower: null, lentAt: null, dueAt: null }
              : item,
          ),
        },
        { slideId, sample: slide.sample, action: "归还", detail: `观察结束归还，归位 ${pos}` },
      ),
    );
    setNotice({ kind: "ok", text: `「${slide.sample}」已归还 ${pos}。` });
  }

  // 更新柜温：超范围即冻结，温度回到范围内即解除
  function applyTemp(cabinetId: string, temp: number) {
    const cabinet = state.cabinets.find((item) => item.id === cabinetId);
    if (!cabinet) return;
    const before = frozenSlides(cabinet, state.slides).length > 0;
    const updated: Cabinet = { ...cabinet, currentTemp: temp };
    const afterSlides = frozenSlides(updated, state.slides);
    const after = afterSlides.length > 0;

    setState((prev) => {
      let next: LedgerState = {
        ...prev,
        cabinets: prev.cabinets.map((item) => (item.id === cabinetId ? updated : item)),
      };
      if (!before && after) {
        next = withEntry(next, {
          slideId: null,
          sample: cabinet.name,
          action: "冻结",
          detail: `柜温 ${temp}℃ 超出 ${afterSlides.map((s) => s.sample).join("、")} 保存范围，冻结该柜，暂停入柜`,
        });
      } else if (before && !after) {
        next = withEntry(next, {
          slideId: null,
          sample: cabinet.name,
          action: "解冻",
          detail: `柜温恢复 ${temp}℃，柜内样本保存温度均在范围内，问题解决，重新开放入柜`,
        });
      }
      return next;
    });

    if (!before && after) {
      setNotice({ kind: "err", text: `${cabinet.name} 已冻结，温度问题解决前不能继续入柜。` });
    } else if (before && !after) {
      setNotice({ kind: "ok", text: `${cabinet.name} 温度恢复正常，已解除冻结。` });
    } else {
      setNotice({ kind: "ok", text: `${cabinet.name} 温度已更新为 ${temp}℃。` });
    }
  }

  function resetLedger() {
    clearLedger();
    setState(seedLedger());
    setNotice({ kind: "ok", text: "已恢复为初始台账数据。" });
  }

  const metrics = [
    { label: "在柜玻片", value: String(storedSlides.length), sub: `${state.cabinets.length} 个柜子`, cls: "status-ok" },
    { label: "借出中", value: String(lentSlides.length), sub: overdueCount > 0 ? `${overdueCount} 张逾期未还` : "全部按时", cls: overdueCount > 0 ? "status-danger" : "status-watch" },
    { label: "候补筐", value: String(basketSlides.length), sub: "新片等待入柜", cls: "status-watch" },
    { label: "冻结柜子", value: String(frozenCabinets.length), sub: frozenCabinets.length > 0 ? "暂停入柜" : "柜温正常", cls: frozenCabinets.length > 0 ? "status-danger" : "status-ok" },
  ];

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>资料 / 占用判断 / 本机留档分层</span>
          <strong>React + TypeScript + localStorage</strong>
          <button className="reset-btn" onClick={resetLedger}>重置为初始台账</button>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="metric-card">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <em className="metric-sub">{metric.sub}</em>
            <i className={metric.cls} />
          </article>
        ))}
      </section>

      {notice && (
        <div className={`notice notice-${notice.kind}`} onClick={() => setNotice(null)}>
          {notice.text}
          <b>×</b>
        </div>
      )}

      <div className="layout">
        <section className="cabinets">
          <div className="section-heading">
            <div>
              <p>柜位图</p>
              <h2>格位占用与逾期标注</h2>
            </div>
          </div>
          {state.cabinets.map((cabinet) => (
            <CabinetMap
              key={cabinet.id}
              cabinet={cabinet}
              slides={state.slides}
              now={now}
              onApplyTemp={applyTemp}
            />
          ))}
        </section>

        <aside className="ops">
          <section className="panel">
            <div className="section-heading">
              <div>
                <p>新片登记</p>
                <h2>先入候补筐</h2>
              </div>
            </div>
            <div className="form-grid single">
              <label>
                <span>样本名称</span>
                <input value={newSample} onChange={(e) => setNewSample(e.target.value)} placeholder="如：水绵接合生殖" />
              </label>
              <label>
                <span>染色方式</span>
                <input value={newStain} onChange={(e) => setNewStain(e.target.value)} placeholder="如：碘液" />
              </label>
            </div>
            <button className="primary-action form-submit" onClick={registerSlide}>登记到候补筐</button>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p>入库登记</p>
                <h2>样本 · 柜号 · 格位 · 保存温度</h2>
              </div>
            </div>
            <div className="form-grid single">
              <label>
                <span>候补筐玻片</span>
                <select value={selectedStoreSlide} onChange={(e) => setStoreSlideId(e.target.value)}>
                  <option value="">{basketSlides.length ? "请选择玻片" : "候补筐为空"}</option>
                  {basketSlides.map((slide) => (
                    <option key={slide.id} value={slide.id}>{slide.sample}（{slide.stain}）</option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  <span>柜号</span>
                  <select value={storeCabinetId} onChange={(e) => { setStoreCabinetId(e.target.value); setStoreSlot(""); }}>
                    {state.cabinets.map((cabinet) => {
                      const frozen = isCabinetFrozen(cabinet, state.slides);
                      return (
                        <option key={cabinet.id} value={cabinet.id}>
                          {cabinet.name}{frozen ? "（已冻结）" : ""} · 当前 {cabinet.currentTemp}℃
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label>
                  <span>格位</span>
                  <select value={selectedSlot} onChange={(e) => setStoreSlot(e.target.value)}>
                    <option value="">{availableSlots.length ? "请选择格位" : "该柜无空格位"}</option>
                    {availableSlots.map((slot) => (
                      <option key={slotKey(slot)} value={slotKey(slot)}>
                        {slot.row}排{slot.col}位
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span>保存温度 低温℃</span>
                  <input type="number" value={tempMin} onChange={(e) => setTempMin(e.target.value)} />
                </label>
                <label>
                  <span>高温℃</span>
                  <input type="number" value={tempMax} onChange={(e) => setTempMax(e.target.value)} />
                </label>
              </div>
            </div>
            <button className="primary-action form-submit" onClick={storeSlide}>确认入柜</button>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p>借出登记</p>
                <h2>观察者与预计归还</h2>
              </div>
            </div>
            <div className="form-grid single">
              <label>
                <span>在柜玻片</span>
                <select value={selectedLendSlide} onChange={(e) => setLendSlideId(e.target.value)}>
                  <option value="">{storedSlides.length ? "请选择玻片" : "暂无在柜玻片"}</option>
                  {storedSlides.map((slide) => (
                    <option key={slide.id} value={slide.id}>
                      {slide.sample} · {slide.slot ? `${slide.slot.cabinetId}柜 ${slide.slot.row}排${slide.slot.col}位` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  <span>观察者</span>
                  <input value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="借用人姓名" />
                </label>
                <label>
                  <span>预计归还时间</span>
                  <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                </label>
              </div>
            </div>
            <button className="primary-action form-submit" onClick={lendSlide}>借出</button>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p>借出台账</p>
                <h2>逾期可在柜位图查看</h2>
              </div>
            </div>
            {lentSlides.length === 0 ? (
              <p className="empty-hint">当前没有借出的玻片。</p>
            ) : (
              <div className="borrow-list">
                {lentSlides.map((slide) => {
                  const overdue = isOverdue(slide, now);
                  return (
                    <article key={slide.id} className={`borrow-card ${overdue ? "overdue" : ""}`}>
                      <div>
                        <h3>
                          {slide.sample}
                          {overdue && <span className="chip chip-overdue">已逾期</span>}
                        </h3>
                        <p>
                          观察者 {slide.borrower} · 应还 {fmtTime(slide.dueAt)}
                        </p>
                        <p className="borrow-pos">{locationText(slide, state.cabinets)}</p>
                      </div>
                      <button onClick={() => returnSlide(slide.id)}>归还入位</button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>

      <SearchPanel slides={state.slides} entries={state.entries} cabinets={state.cabinets} now={now} />
    </main>
  );
}

export default App;
