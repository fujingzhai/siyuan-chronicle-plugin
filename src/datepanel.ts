import { Ctx, openEntryDialog } from "./dialogs";
import { WEEKDAY_NAMES, daysInMonth, toISODate } from "./time";
import { TimelineHandles, buildEntryChip, buildYearCell, refreshTimeDocs, timeLabel } from "./timeline";
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

/**
 * 日期视图：左侧沿用时间视图的年份栏，右侧为日历式年视图——
 * 12 张月历卡，各自下方平铺当月带日期的活动卡片。
 */
export function renderDatePanel(container: HTMLElement, ctx: Ctx, year: number, handles: TimelineHandles): void {
  const { store } = ctx;
  container.innerHTML = "";
  container.classList.add("el-datewrap");

  const yearCell = buildYearCell(ctx, year, handles, { icon: "iconClock", title: "时间面板（W）" });
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
    // 先按面板实际像素校准，保证拖拽 1:1 跟手
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

  for (let m = 1; m <= 12; m++) {
    const monthEntries = entries
      .map((entry) => ({ entry, span: clampToMonth(entry, year, m) }))
      .filter((item): item is { entry: Entry; span: { from: string; to: string } } => !!item.span);

    // 每天覆盖到的活动，用于圆点与悬停提示
    const byDay = new Map<string, Entry[]>();
    for (const { entry, span } of monthEntries) {
      for (let d = Number(span.from.slice(8)); d <= Number(span.to.slice(8)); d++) {
        const iso = isoOf(year, m, d);
        if (!byDay.has(iso)) byDay.set(iso, []);
        byDay.get(iso)!.push(entry);
      }
    }

    const isCurrentMonth = year === now.getFullYear() && m === now.getMonth() + 1;
    const card = document.createElement("div");
    card.className = "el-dmonth" + (isCurrentMonth ? " el-dmonth--current" : "");
    card.appendChild(timeLabel(ctx, { unit: "month", year, num: m }, "el-dmonth__label", `${m} 月`));

    const cal = document.createElement("div");
    cal.className = "el-dcal";
    for (let i = 0; i < 7; i++) {
      const wd = document.createElement("span");
      wd.className = "el-dcal__wd" + (i >= 5 ? " el-dcal__wd--weekend" : "");
      wd.textContent = CAL_WEEKDAYS[i];
      cal.appendChild(wd);
    }
    // 周一起始：1 号前补空位
    const lead = (new Date(year, m - 1, 1).getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) cal.appendChild(document.createElement("span"));

    const dim = daysInMonth(year, m);
    for (let d = 1; d <= dim; d++) {
      const iso = isoOf(year, m, d);
      const weekday = new Date(year, m - 1, d).getDay();
      const dayEntries = byDay.get(iso) ?? [];
      const cell = document.createElement("div");
      cell.className = "el-dday"
        + (weekday === 0 || weekday === 6 ? " el-dday--weekend" : "")
        + (iso === todayISO ? " el-dday--today" : "");
      cell.dataset.date = iso;
      const dots = dayEntries.slice(0, 3).map((entry) => {
        const color = store.categoryOf(entry.categoryId)?.color ?? "var(--b3-theme-on-surface-light)";
        return `<i style="background:${color}"></i>`;
      }).join("");
      cell.innerHTML = `<span class="el-dday__num">${d}</span><span class="el-dday__dots">${dots}</span>`;
      const tip = [`${m}/${d} 周${WEEKDAY_NAMES[weekday]}`];
      for (const entry of dayEntries) tip.push(`· ${entry.title}`);
      cell.title = tip.join("\n");
      cell.addEventListener("click", () => openEntryDialog(ctx, { dayMode: true, presetDate: iso }));
      cal.appendChild(cell);
    }
    card.appendChild(cal);

    const chips = document.createElement("div");
    chips.className = "el-dmonth__chips";
    for (const { entry, span } of monthEntries) {
      const chip = buildEntryChip(ctx, entry, { draggable: false });
      // 悬停活动卡片时点亮它覆盖的日期格
      chip.addEventListener("mouseenter", () => {
        for (let d = Number(span.from.slice(8)); d <= Number(span.to.slice(8)); d++) {
          cal.querySelector(`[data-date="${isoOf(year, m, d)}"]`)?.classList.add("el-dday--hl");
        }
      });
      chip.addEventListener("mouseleave", () => {
        cal.querySelectorAll(".el-dday--hl").forEach((el) => el.classList.remove("el-dday--hl"));
      });
      chips.appendChild(chip);
    }
    const addBtn = document.createElement("button");
    addBtn.className = "el-chips__add";
    addBtn.title = "记录活动";
    addBtn.textContent = "＋";
    addBtn.addEventListener("click", () => {
      const preset = isCurrentMonth ? todayISO : isoOf(year, m, 1);
      openEntryDialog(ctx, { dayMode: true, presetDate: preset });
    });
    chips.appendChild(addBtn);
    card.appendChild(chips);

    months.appendChild(card);
  }

  container.appendChild(months);
  void refreshTimeDocs(container, ctx, year);
}

/** 供快捷键 N 使用：日期面板下新建活动的默认日期 */
export function defaultDateOfYear(year: number): string {
  const now = new Date();
  return year === now.getFullYear() ? toISODate(now) : `${year}-01-01`;
}
