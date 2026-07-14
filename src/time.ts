import { PeriodRef, Unit } from "./types";

const DAY = 86400000;

function startOfDay(d: Date): Date {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t;
}

/** ISO 8601 周（周一为一周之始） */
export function isoWeekOf(date: Date): { year: number; num: number } {
  const t = startOfDay(date);
  // 移到本周四，周四所在年即 ISO 周年
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const year = t.getFullYear();
  const week1 = new Date(year, 0, 4);
  const num = 1 + Math.round(
    ((t.getTime() - startOfDay(week1).getTime()) / DAY - 3 + ((week1.getDay() + 6) % 7)) / 7
  );
  return { year, num };
}

export function weeksInYear(year: number): number {
  return isoWeekOf(new Date(year, 11, 28)).num;
}

/** 某 ISO 周的周一 */
export function weekStart(year: number, num: number): Date {
  const jan4 = startOfDay(new Date(year, 0, 4));
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (num - 1) * 7);
  return monday;
}

export function weekEnd(year: number, num: number): Date {
  const d = weekStart(year, num);
  d.setDate(d.getDate() + 6);
  return d;
}

export function currentPeriod(unit: Unit, now = new Date()): PeriodRef {
  switch (unit) {
    case "week": {
      const w = isoWeekOf(now);
      return { unit, year: w.year, num: w.num };
    }
    case "month":
      return { unit, year: now.getFullYear(), num: now.getMonth() + 1 };
    case "quarter":
      return { unit, year: now.getFullYear(), num: Math.floor(now.getMonth() / 3) + 1 };
    case "year":
      return { unit, year: now.getFullYear(), num: 0 };
  }
}

export function periodKey(p: PeriodRef): string {
  return `${p.unit}:${p.year}:${p.num}`;
}

export function samePeriod(a: PeriodRef, b: PeriodRef): boolean {
  return a.unit === b.unit && a.year === b.year && a.num === b.num;
}

/** 用于排序：周期起点毫秒数 */
export function periodStart(p: PeriodRef): number {
  switch (p.unit) {
    case "week": return weekStart(p.year, p.num).getTime();
    case "month": return new Date(p.year, p.num - 1, 1).getTime();
    case "quarter": return new Date(p.year, (p.num - 1) * 3, 1).getTime();
    case "year": return new Date(p.year, 0, 1).getTime();
  }
}

export function fmtMonthDay(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 短徽章文本，如 2026·W29 / 2026·7月 / 2026·Q3 / 2026 */
export function periodBadge(p: PeriodRef): string {
  switch (p.unit) {
    case "week": return `${p.year}·W${p.num}`;
    case "month": return `${p.year}·${p.num}月`;
    case "quarter": return `${p.year}·Q${p.num}`;
    case "year": return `${p.year}`;
  }
}

/** 层级树节点标签：主文字 + 副文字 */
export function periodRowLabel(p: PeriodRef): { main: string; sub: string } {
  switch (p.unit) {
    case "week":
      return {
        main: `第 ${p.num} 周`,
        sub: `${fmtMonthDay(weekStart(p.year, p.num))} – ${fmtMonthDay(weekEnd(p.year, p.num))}`
      };
    case "month":
      return { main: `${p.num} 月`, sub: "" };
    case "quarter":
      return { main: `第 ${p.num} 季度`, sub: "" };
    case "year":
      return { main: `${p.year} 年`, sub: "" };
  }
}

/** 一周归属的月份：取周四所在月（即天数更多的那个月，ISO 惯例） */
export function weekMonth(year: number, num: number): number {
  const thu = weekStart(year, num);
  thu.setDate(thu.getDate() + 3);
  return thu.getMonth() + 1;
}

/** 时间笔记的文档名，如 2026年 / 2026年第3季度 / 2026年7月 / 2026年第29周 */
export function periodDocName(p: PeriodRef): string {
  switch (p.unit) {
    case "year": return `${p.year}年`;
    case "quarter": return `${p.year}年第${p.num}季度`;
    case "month": return `${p.year}年${p.num}月`;
    case "week": return `${p.year}年第${p.num}周`;
  }
}

/** 时间笔记的人类可读路径（父子文档层级） */
export function periodHPath(p: PeriodRef): string {
  const chain = [...periodAncestors(p), p];
  return "/" + chain.map(periodDocName).join("/");
}

/** 由具体日期推算各粒度的周期 */
export function periodFromDate(dateStr: string, unit: Unit): PeriodRef | null {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  switch (unit) {
    case "week": {
      const w = isoWeekOf(d);
      return { unit, year: w.year, num: w.num };
    }
    case "month":
      return { unit, year: d.getFullYear(), num: d.getMonth() + 1 };
    case "quarter":
      return { unit, year: d.getFullYear(), num: Math.floor(d.getMonth() / 3) + 1 };
    case "year":
      return { unit, year: d.getFullYear(), num: 0 };
  }
}

/** 周期的起止日（含），用于限定日期选择范围 */
export function periodDateRange(p: PeriodRef): { start: Date; end: Date } {
  switch (p.unit) {
    case "week":
      return { start: weekStart(p.year, p.num), end: weekEnd(p.year, p.num) };
    case "month":
      return { start: new Date(p.year, p.num - 1, 1), end: new Date(p.year, p.num, 0) };
    case "quarter":
      return { start: new Date(p.year, (p.num - 1) * 3, 1), end: new Date(p.year, p.num * 3, 0) };
    case "year":
      return { start: new Date(p.year, 0, 1), end: new Date(p.year, 11, 31) };
  }
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoDayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY);
}

function dateDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
}

function dayNumberToISO(value: number): string {
  const date = new Date(value * DAY);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 活动拖到另一时间格时，按原周期内的日序平移具体日期。
 * 超出新周期的部分会收拢到周期末日，保证日期始终属于新的时间范围。
 */
export function shiftDatesToPeriod(
  dates: { start: string; end?: string },
  from: PeriodRef,
  to: PeriodRef
): { start: string; end?: string } {
  const fromRange = periodDateRange(from);
  const toRange = periodDateRange(to);
  const fromStart = dateDayNumber(fromRange.start);
  const toStart = dateDayNumber(toRange.start);
  const toEnd = dateDayNumber(toRange.end);
  const oldStart = isoDayNumber(dates.start);
  const oldEnd = isoDayNumber(dates.end || dates.start);
  const offset = Math.max(0, oldStart - fromStart);
  const duration = Math.max(0, oldEnd - oldStart);
  const nextStart = Math.min(toStart + offset, toEnd);
  const nextEnd = Math.min(nextStart + duration, toEnd);
  const start = dayNumberToISO(nextStart);
  return nextEnd > nextStart ? { start, end: dayNumberToISO(nextEnd) } : { start };
}

/** 不含年份的短徽章，如 W29 / 7月 / Q3 / 全年 */
export function periodShortBadge(p: PeriodRef): string {
  switch (p.unit) {
    case "week": return `W${p.num}`;
    case "month": return `${p.num}月`;
    case "quarter": return `Q${p.num}`;
    case "year": return "全年";
  }
}

/** 具体日期徽章文本，如 8/12 或 8/12–15 */
export function fmtDatesBadge(dates: { start: string; end?: string }): string {
  const parse = (s: string) => s.split("-");
  const [, m1, d1] = parse(dates.start);
  const md1 = `${Number(m1)}/${Number(d1)}`;
  if (!dates.end || dates.end === dates.start) return md1;
  const [, m2, d2] = parse(dates.end);
  return Number(m1) === Number(m2) ? `${md1}–${Number(d2)}` : `${md1}–${Number(m2)}/${Number(d2)}`;
}

/** 具体日期区间在某年中的占比，用于类目视图精确定位 */
export function datesFracInYear(dates: { start: string; end?: string }, barYear: number): { from: number; to: number } | null {
  const s = new Date(`${dates.start}T00:00:00`).getTime();
  const e = new Date(`${dates.end || dates.start}T00:00:00`).getTime() + DAY;
  if (isNaN(s) || isNaN(e)) return null;
  const yStart = new Date(barYear, 0, 1).getTime();
  const yEnd = new Date(barYear + 1, 0, 1).getTime();
  const from = Math.max(Math.min(s, e - DAY), yStart);
  const to = Math.min(Math.max(e, s + DAY), yEnd);
  if (to <= from) return null;
  return { from: (from - yStart) / (yEnd - yStart), to: (to - yStart) / (yEnd - yStart) };
}

/** 周期在层级树中的祖先链（不含自身），用于展开定位 */
export function periodAncestors(p: PeriodRef): PeriodRef[] {
  const chain: PeriodRef[] = [];
  let month: number | null = null;
  switch (p.unit) {
    case "year":
      return chain;
    case "quarter":
      chain.push({ unit: "year", year: p.year, num: 0 });
      return chain;
    case "month":
      month = p.num;
      break;
    case "week":
      month = weekMonth(p.year, p.num);
      break;
  }
  const quarter = Math.floor((month - 1) / 3) + 1;
  chain.push({ unit: "year", year: p.year, num: 0 });
  chain.push({ unit: "quarter", year: p.year, num: quarter });
  if (p.unit === "week") {
    chain.push({ unit: "month", year: p.year, num: month });
  }
  return chain;
}

/**
 * 周期在某公历年中的区间占比（0..1），用于类目光谱条。
 * 返回 null 表示该周期与 barYear 无交集。
 */
export function periodFracInYear(p: PeriodRef, barYear: number): { from: number; to: number } | null {
  const yStart = new Date(barYear, 0, 1).getTime();
  const yEnd = new Date(barYear + 1, 0, 1).getTime();
  let s: number, e: number;
  switch (p.unit) {
    case "week":
      s = weekStart(p.year, p.num).getTime();
      e = s + 7 * DAY;
      break;
    case "month":
      s = new Date(p.year, p.num - 1, 1).getTime();
      e = new Date(p.year, p.num, 1).getTime();
      break;
    case "quarter":
      s = new Date(p.year, (p.num - 1) * 3, 1).getTime();
      e = new Date(p.year, p.num * 3, 1).getTime();
      break;
    case "year":
      s = new Date(p.year, 0, 1).getTime();
      e = new Date(p.year + 1, 0, 1).getTime();
      break;
  }
  const from = Math.max(s, yStart);
  const to = Math.min(e, yEnd);
  if (to <= from) return null;
  const span = yEnd - yStart;
  return { from: (from - yStart) / span, to: (to - yStart) / span };
}

/** 周期涉及的公历年（周可能跨年） */
export function periodBarYears(p: PeriodRef): number[] {
  if (p.unit !== "week") return [p.year];
  const s = weekStart(p.year, p.num);
  const e = weekEnd(p.year, p.num);
  return s.getFullYear() === e.getFullYear() ? [s.getFullYear()] : [s.getFullYear(), e.getFullYear()];
}

export const UNIT_LABELS: Record<Unit, string> = {
  week: "周",
  month: "月",
  quarter: "季",
  year: "年"
};

export function maxNumOf(unit: Unit, year: number): number {
  switch (unit) {
    case "week": return weeksInYear(year);
    case "month": return 12;
    case "quarter": return 4;
    case "year": return 0;
  }
}
