import { useState } from "react";
import type { Cabinet, LedgerEntry, Slide } from "../data/types";
import { fmtTime, isOverdue, locationText, tempRangeText } from "../logic/occupancy";

interface SearchPanelProps {
  slides: Slide[];
  entries: LedgerEntry[];
  cabinets: Cabinet[];
  now: Date;
}

function statusChip(slide: Slide, now: Date): { text: string; cls: string } {
  if (slide.status === "basket") return { text: "候补筐", cls: "chip chip-basket" };
  if (slide.status === "lent") {
    return isOverdue(slide, now)
      ? { text: "借出 · 已逾期", cls: "chip chip-overdue" }
      : { text: "借出中", cls: "chip chip-lent" };
  }
  return { text: "在柜", cls: "chip chip-stored" };
}

function EntryRow({ entry }: { entry: LedgerEntry }) {
  return (
    <div className="entry-row">
      <time>{fmtTime(entry.at)}</time>
      <b className={`entry-action action-${entry.action}`}>{entry.action}</b>
      <span>{entry.detail}</span>
    </div>
  );
}

export function SearchPanel({ slides, entries, cabinets, now }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const keyword = query.trim();
  const matched = keyword ? slides.filter((slide) => slide.sample.includes(keyword)) : [];

  return (
    <section className="panel search-panel">
      <div className="section-heading">
        <div>
          <p>样本检索</p>
          <h2>按样本查位置与取放记录</h2>
        </div>
      </div>

      <input
        className="search-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="输入样本名称关键字，如：洋葱表皮"
      />

      {keyword && matched.length === 0 && (
        <p className="empty-hint">没有查到与「{keyword}」相关的样本。</p>
      )}

      <div className="result-list">
        {matched.map((slide) => {
          const chip = statusChip(slide, now);
          const ownEntries = entries.filter((entry) => entry.slideId === slide.id);
          return (
            <article key={slide.id} className="result-card">
              <header className="result-head">
                <h3>{slide.sample}</h3>
                <span className={chip.cls}>{chip.text}</span>
              </header>
              <p className="result-loc">
                当前位置：<b>{locationText(slide, cabinets)}</b>
              </p>
              <p className="result-meta">
                染色方式：{slide.stain} · 保存温度：{tempRangeText(slide)}
                {slide.status === "lent" && (
                  <>
                    {" "}· 观察者：{slide.borrower} · 预计归还：{fmtTime(slide.dueAt)}
                    {isOverdue(slide, now) && <b className="overdue-text">（已逾期）</b>}
                  </>
                )}
              </p>
              <div className="entry-list">
                {ownEntries.length > 0 ? (
                  ownEntries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
                ) : (
                  <p className="empty-hint">暂无取放记录。</p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <h3 className="log-title">本机最近留档</h3>
      <div className="entry-list global-log">
        {entries.slice(0, 10).map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}
