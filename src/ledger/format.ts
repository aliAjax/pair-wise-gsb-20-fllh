// 时间显示与表单用的格式化工具

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO 时间 → "MM-DD HH:mm" */
export function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date → datetime-local 输入框需要的 "YYYY-MM-DDTHH:mm" */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
