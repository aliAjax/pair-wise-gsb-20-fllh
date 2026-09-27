import { useEffect, useState } from "react";
import type { Cabinet, Slide } from "../data/types";
import { fmtTime, frozenSlides, isOverdue, slideAt, tempRangeText } from "../logic/occupancy";

interface CabinetMapProps {
  cabinet: Cabinet;
  slides: Slide[];
  now: Date;
  onApplyTemp: (cabinetId: string, temp: number) => void;
}

export function CabinetMap({ cabinet, slides, now, onApplyTemp }: CabinetMapProps) {
  const [draft, setDraft] = useState(String(cabinet.currentTemp));

  useEffect(() => {
    setDraft(String(cabinet.currentTemp));
  }, [cabinet.currentTemp]);

  const frozen = frozenSlides(cabinet, slides);
  const isFrozen = frozen.length > 0;

  const cells = [];
  for (let row = 1; row <= cabinet.rows; row += 1) {
    for (let col = 1; col <= cabinet.cols; col += 1) {
      const slide = slideAt(slides, cabinet.id, row, col);
      const overdue = slide ? isOverdue(slide, now) : false;
      const cellClass = !slide
        ? "slot empty"
        : slide.status === "lent"
          ? overdue
            ? "slot lent overdue"
            : "slot lent"
          : "slot stored";

      cells.push(
        <div key={`${row}-${col}`} className={cellClass} title={slide ? `${slide.sample}（${slide.stain}）` : "空位"}>
          <span className="slot-pos">{row}-{col}</span>
          {slide ? (
            <>
              <b>{slide.sample}</b>
              {slide.status === "lent" ? (
                <span>
                  {overdue ? "逾期未还" : "借出"} · {slide.borrower}
                </span>
              ) : (
                <span>{tempRangeText(slide)}</span>
              )}
              {slide.status === "lent" && overdue && (
                <em className="slot-due">应还 {fmtTime(slide.dueAt)}</em>
              )}
            </>
          ) : (
            <span className="slot-empty-text">空位</span>
          )}
        </div>,
      );
    }
  }

  return (
    <section className={`panel cabinet ${isFrozen ? "frozen" : ""}`}>
      <div className="cabinet-head">
        <div>
          <h2>{cabinet.name}</h2>
          <p className="cabinet-sub">
            {cabinet.rows}×{cabinet.cols} 格位 · 当前温度 <b>{cabinet.currentTemp}℃</b>
          </p>
        </div>
        {isFrozen ? (
          <span className="badge badge-danger">已冻结 · 暂停入柜</span>
        ) : (
          <span className="badge badge-ok">温度正常</span>
        )}
      </div>

      {isFrozen && (
        <p className="frozen-reason">
          温度超出保存范围：
          {frozen.map((slide) => `${slide.sample}（${tempRangeText(slide)}）`).join("、")}
          。问题解决前该柜不能继续入柜。
        </p>
      )}

      <div
        className="cabinet-grid"
        style={{ gridTemplateColumns: `repeat(${cabinet.cols}, minmax(0, 1fr))` }}
      >
        {cells}
      </div>

      <div className="temp-row">
        <label>
          <span>柜温更新 ℃</span>
          <input
            type="number"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button onClick={() => {
          const temp = Number(draft);
          if (Number.isFinite(temp)) onApplyTemp(cabinet.id, temp);
        }}>
          更新温度
        </button>
        <span className="temp-hint">模拟温控读数，超出柜内样本保存范围将冻结柜子</span>
      </div>
    </section>
  );
}
