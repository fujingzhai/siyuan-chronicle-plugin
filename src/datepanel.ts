import { Ctx, openEntryDialog } from "./dialogs";
import { WEEKDAY_NAMES, daysInMonth, fmtDatesBadge, toISODate } from "./time";
import { TimelineHandles, buildYearNav } from "./timeline";
import { DEFAULT_TIME_COLS, Entry, Settings } from "./types";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** 活动日期区间与某月的交集（ISO 日期串），无交集返回 null */
function clampToMonth(entry: Entry, year: number, month: number): { from: string; to: string } | null {
  const lo = isoOf(year, month, 1);
  const hi = isoOf(year, month, daysInMonth(year, month));
  const start = entry.dates!.start;
  const end = entry.dates!.end || start;
  if (start > hi || end < lo) return null;
  return { from: start < lo ? lo : start, to: end > hi ? hi : end };
}

/** 周一起始的月历表头 */
const CAL_WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

interface MonthSpan {
  entry: Entry;
  span: { from: string; to: string };
  lane: number;
}

/** 同月内为活动分配横线行号：区间不重叠的活动复用同一行 */
function assignLanes(items: { entry: Entry; span: { from: string; to: string } }[]): { spans: MonthSpan[]; laneCount: number } {
  const sorted = items.slice().sort((a, b) =>
    a.span.from.localeCompare(b.span.from) || a.span.to.localeCompare(b.span.to) || a.entry.created - b.entry.created
  );
  const laneEnds: string[] = [];
  const spans: MonthSpan[] = [];
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end < item.span.from);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.span.to);
    } else {
      laneEnds[lane] = item.span.to;
    }
    spans.push({ ...item, lane });
  }
  return { spans, laneCount: laneEnds.length };
}

/**
 * 日期视图：左侧与时间视图等宽的年份栏（纯年份＋导航），右侧月历按季竖排。
 * 活动以类目色横线画在所涉日期下方，跨天相连；在日期上按下并拖动可创建多天活动。
 */
export function renderDatePanel(container: HTMLElement, ctx: Ctx, year: number, handles: TimelineHandles): void {
  const { store } = ctx;
  container.innerHTML = "";
  container.classList.add("el-datewrap");

  // 年份栏：日期面板保持纯粹，不放时间笔记入口和无日期的活动
  const yearCell = document.createElement("div");
  yearCell.className = "el-cell el-cell--year";
  const yearLabel = document.createElement("span");
  yearLabel.className = "el-ylabel";
  yearLabel.textContent = `${year} 年`;
  yearCell.appendChild(yearLabel);
  yearCell.appendChild(buildYearNav(year, handles, { icon: "iconChronicle", title: "时间面板（W）" }));
  container.appendChild(yearCell);

  // 与时间视图完全一致的年份栏宽度，且同样可拖拽调整（联动时间视图的年/季列宽）。
  const cols: Settings["cols"] & object = store.data.settings.colsCustomized
    ? { ...DEFAULT_TIME_COLS, ...(store.data.settings.cols ?? {}) }
    : { ...DEFAULT_TIME_COLS };
  const grip = document.createElement("div");
  grip.className = "el-resize";
  grip.title = "拖动调整列宽";
  const applyWidth = () => {
    const pct = (cols.y / (cols.y + cols.q + cols.m + cols.w)) * 100;
    yearCell.style.width = `${pct}%`;
    grip.style.left = `calc(${pct}% - 3px)`;
  };
  grip.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const panelWidth = container.getBoundingClientRect().width;
    const scale = panelWidth / (cols.y + cols.q + cols.m + cols.w);
    (["y", "q", "m", "w"] as const).forEach((k) => { cols[k] *= scale; });
    const startX = e.clientX;
    const startY = cols.y;
    const pairTotal = cols.y + cols.q;
    const onMove = (ev: MouseEvent) => {
      cols.y = Math.min(320, pairTotal - 92, Math.max(76, startY + ev.clientX - startX));
      cols.q = pairTotal - cols.y;
      applyWidth();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      store.updateSettings({ cols: { ...cols }, colsCustomized: true });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  container.appendChild(grip);
  applyWidth();

  const now = new Date();
  const todayISO = toISODate(now);
  const entries = store.datedEntriesInYear(year);

  const months = document.createElement("div");
  months.className = "el-dmonths";

  // ---- 拖选创建：在日期上按下，拖到另一天，松开即按起止日创建 ----
  let selStart: string | null = null;
  let selEnd: string | null = null;
  const clearSelection = () => months.querySelectorAll(".el-dday--hl").forEach((el) => el.classList.remove("el-dday--hl"));
  const applySelection = () => {
    clearSelection();
    if (!selStart || !selEnd) return;
    const [lo, hi] = selStart <= selEnd ? [selStart, selEnd] : [selEnd, selStart];
    months.querySelectorAll<HTMLElement>(".el-dday").forEach((el) => {
      const d = el.dataset.date!;
      if (d >= lo && d <= hi) el.classList.add("el-dday--hl");
    });
  };
  const cancelSelect = () => {
    selStart = null;
    selEnd = null;
    clearSelection();
    document.removeEventListener("mousemove", onSelectMove, true);
    document.removeEventListener("mouseup", onSelectUp, true);
    window.removeEventListener("blur", cancelSelect);
  };
  const onSelectMove = (event: MouseEvent) => {
    if (!selStart) return;
    event.preventDefault();
    const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const cell = hit?.closest<HTMLElement>(".el-dday");
    if (cell?.dataset.date) {
      selEnd = cell.dataset.date;
      applySelection();
    }
  };
  const onSelectUp = () => {
    if (!selStart) return;
    const [lo, hi] = !selEnd || selStart <= selEnd ? [selStart, selEnd ?? selStart] : [selEnd, selStart];
    cancelSelect();
    openEntryDialog(ctx, { dayMode: true, presetDate: lo, presetEnd: hi !== lo ? hi : undefined });
  };

  for (let m = 1; m <= 12; m++) {
      const { spans, laneCount } = assignLanes(
        entries
          .map((entry) => ({ entry, span: clampToMonth(entry, year, m) }))
          .filter((item): item is { entry: Entry; span: { from: string; to: string } } => !!item.span)
      );

      const card = document.createElement("div");
      card.className = "el-dmonth";
      const label = document.createElement("span");
      label.className = "el-dmonth__label";
      label.textContent = `${m} 月`;
      card.appendChild(label);

      const cal = document.createElement("div");
      cal.className = "el-dcal";
      for (let i = 0; i < 7; i++) {
        const wd = document.createElement("span");
        wd.className = "el-dcal__wd" + (i >= 5 ? " el-dcal__wd--weekend" : "");
        wd.textContent = CAL_WEEKDAYS[i];
        cal.appendChild(wd);
      }
      const lead = (new Date(year, m - 1, 1).getDay() + 6) % 7;
      for (let i = 0; i < lead; i++) cal.appendChild(document.createElement("span"));

      const dim = daysInMonth(year, m);
      for (let d = 1; d <= dim; d++) {
        const iso = isoOf(year, m, d);
        const weekday = new Date(year, m - 1, d).getDay();
        const cell = document.createElement("div");
        cell.className = "el-dday"
          + (weekday === 0 || weekday === 6 ? " el-dday--weekend" : "")
          + (iso === todayISO ? " el-dday--today" : "");
        cell.dataset.date = iso;
        cell.title = `${m}/${d} 周${WEEKDAY_NAMES[weekday]}`;
        const num = document.createElement("span");
        num.className = "el-dday__num";
        num.textContent = String(d);
        cell.appendChild(num);

        // 活动横线：同一活动固定行号，跨天时相邻线段相连
        if (laneCount) {
          const lanes = document.createElement("span");
          lanes.className = "el-dday__lanes";
          const covering = new Map<number, MonthSpan>();
          for (const s of spans) {
            if (iso >= s.span.from && iso <= s.span.to) covering.set(s.lane, s);
          }
          for (let lane = 0; lane < laneCount; lane++) {
            const s = covering.get(lane);
            if (!s) {
              const gap = document.createElement("i");
              gap.className = "el-dline el-dline--empty";
              lanes.appendChild(gap);
              continue;
            }
            const seg = document.createElement("i");
            seg.className = "el-dline"
              + (iso > s.span.from ? " el-dline--pre" : "")
              + (iso < s.span.to ? " el-dline--post" : "");
            const color = store.categoryOf(s.entry.categoryId)?.color ?? "var(--b3-theme-on-surface-light)";
            seg.style.background = color;
            seg.dataset.entryId = s.entry.id;
            const cat = store.categoryOf(s.entry.categoryId);
            seg.title = `${s.entry.title}\n${fmtDatesBadge(s.entry.dates!)}　${cat ? cat.name : "无类别"}`;
            seg.addEventListener("mousedown", (e) => e.stopPropagation());
            seg.addEventListener("click", (e) => {
              e.stopPropagation();
              openEntryDialog(ctx, { entry: s.entry });
            });
            seg.addEventListener("mouseenter", () => {
              months.querySelectorAll<HTMLElement>(`[data-entry-id="${s.entry.id}"]`)
                .forEach((el) => el.classList.add("el-dline--hl"));
            });
            seg.addEventListener("mouseleave", () => {
              months.querySelectorAll(".el-dline--hl").forEach((el) => el.classList.remove("el-dline--hl"));
            });
            lanes.appendChild(seg);
          }
          cell.appendChild(lanes);
        }

        cell.addEventListener("mousedown", (event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest(".el-dline:not(.el-dline--empty)")) return;
          event.preventDefault();
          selStart = iso;
          selEnd = iso;
          applySelection();
          document.addEventListener("mousemove", onSelectMove, true);
          document.addEventListener("mouseup", onSelectUp, true);
          window.addEventListener("blur", cancelSelect);
        });
        cal.appendChild(cell);
      }
      card.appendChild(cal);
      months.appendChild(card);
  }

  container.appendChild(months);
}

/** 供快捷键 N 使用：日期面板下新建活动的默认日期 */
export function defaultDateOfYear(year: number): string {
  const now = new Date();
  return year === now.getFullYear() ? toISODate(now) : `${year}-01-01`;
}
