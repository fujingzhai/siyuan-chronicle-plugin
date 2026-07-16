import { Ctx, openEntryDialog } from "./dialogs";
import { WEEKDAY_NAMES, daysInMonth, toISODate } from "./time";
import { TimelineHandles, buildEntryChip, buildYearNav, refreshTimeDocs, timeLabel } from "./timeline";
import { Entry, PeriodRef } from "./types";

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

/**
 * 日期视图：12 个月条纵向排开，每月一行 31 个日期格按日号对齐，
 * 有活动的日子标类目色圆点；日期格下方平铺该月活动卡片。
 */
export function renderDatePanel(container: HTMLElement, ctx: Ctx, year: number, handles: TimelineHandles): void {
  const { store } = ctx;
  container.innerHTML = "";
  container.classList.add("el-datewrap");

  const now = new Date();
  const todayISO = toISODate(now);
  const entries = store.datedEntriesInYear(year);

  // 头部：年标签（可开时间笔记）＋ 设置｜←｜→｜切换按钮
  const head = document.createElement("div");
  head.className = "el-date-head";
  const yp: PeriodRef = { unit: "year", year, num: 0 };
  head.appendChild(timeLabel(ctx, yp, "el-ylabel", `${year} 年`));
  const hint = document.createElement("span");
  hint.className = "el-date-head__hint";
  hint.textContent = "点击日期格记录当天活动；时间视图中填了日期的活动也在此显示";
  head.appendChild(hint);
  head.appendChild(buildYearNav(year, handles, { icon: "iconClock", title: "时间面板（W）" }));
  container.appendChild(head);

  if (!store.data.categories.length) {
    const banner = document.createElement("div");
    banner.className = "el-banner";
    banner.textContent = "还没有类目——按 S 打开设置，定义属于你自己的类目体系。";
    container.appendChild(banner);
  }

  const months = document.createElement("div");
  months.className = "el-date-months";

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
    const section = document.createElement("div");
    section.className = "el-dmonth" + (isCurrentMonth ? " el-dmonth--current" : "");

    const label = document.createElement("div");
    label.className = "el-dmonth__labelbox";
    label.appendChild(timeLabel(ctx, { unit: "month", year, num: m }, "el-dmonth__label", `${m} 月`));
    section.appendChild(label);

    const days = document.createElement("div");
    days.className = "el-ddays";
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
      const dots = dayEntries.slice(0, 4).map((entry) => {
        const color = store.categoryOf(entry.categoryId)?.color ?? "var(--b3-theme-on-surface-light)";
        return `<i style="background:${color}"></i>`;
      }).join("");
      cell.innerHTML = `<span class="el-dday__num">${d}</span><span class="el-dday__dots">${dots}</span>`;
      const tip = [`${m}/${d} 周${WEEKDAY_NAMES[weekday]}`];
      for (const entry of dayEntries) tip.push(`· ${entry.title}`);
      tip.push("点击记录当天活动");
      cell.title = tip.join("\n");
      cell.addEventListener("click", () => openEntryDialog(ctx, { dayMode: true, presetDate: iso }));
      days.appendChild(cell);
    }
    section.appendChild(days);

    const chips = document.createElement("div");
    chips.className = "el-dmonth__chips";
    for (const { entry, span } of monthEntries) {
      const chip = buildEntryChip(ctx, entry, { draggable: false });
      // 悬停活动卡片时点亮它覆盖的日期格
      chip.addEventListener("mouseenter", () => {
        for (let d = Number(span.from.slice(8)); d <= Number(span.to.slice(8)); d++) {
          days.querySelector(`[data-date="${isoOf(year, m, d)}"]`)?.classList.add("el-dday--hl");
        }
      });
      chip.addEventListener("mouseleave", () => {
        days.querySelectorAll(".el-dday--hl").forEach((el) => el.classList.remove("el-dday--hl"));
      });
      chips.appendChild(chip);
    }
    const addBtn = document.createElement("button");
    addBtn.className = "el-chips__add";
    addBtn.title = "在本月记录活动";
    addBtn.textContent = "＋";
    addBtn.addEventListener("click", () => {
      const preset = isCurrentMonth ? todayISO : isoOf(year, m, 1);
      openEntryDialog(ctx, { dayMode: true, presetDate: preset });
    });
    chips.appendChild(addBtn);
    section.appendChild(chips);

    months.appendChild(section);
  }

  container.appendChild(months);
  void refreshTimeDocs(container, ctx, year);
}

/** 供快捷键 N 使用：日期面板下新建活动的默认日期 */
export function defaultDateOfYear(year: number): string {
  const now = new Date();
  return year === now.getFullYear() ? toISODate(now) : `${year}-01-01`;
}
