import { showMessage } from "siyuan";
import { createDocWithMd, getIDsByHPath, lsNotebooks, openDoc, querySQL, setBlockAttrs } from "./api";
import { Ctx, esc, openEntryDialog, resolveNotebook } from "./dialogs";
import {
  currentPeriod,
  fmtDatesBadge,
  fmtMonthDay,
  periodDocName,
  periodHPath,
  periodKey,
  samePeriod,
  weekEnd,
  weekStart,
  weeksInYear
} from "./time";
import { DEFAULT_TIME_COLS, Entry, PeriodRef } from "./types";

/** 已知时间笔记缓存：hpath → docId */
const timeDocCache = new Map<string, string>();

function markHasDoc(hpath: string): void {
  document.querySelectorAll(`[data-hpath="${CSS.escape(hpath)}"]`).forEach((el) => el.classList.add("el-hasdoc"));
}

/** 打开某时间节点对应的时间笔记，不存在则自动按父子层级创建 */
export async function openOrCreateTimeDoc(ctx: Ctx, p: PeriodRef): Promise<void> {
  const hpath = periodHPath(p);
  try {
    const notebook = await resolveNotebook(ctx.store);
    // 每次点击都按路径重新核实，避免已删除文档的缓存继续指向失效 id。
    const ids = await getIDsByHPath(notebook, hpath);
    let id = ids[0];
    if (!id) {
      id = await createDocWithMd(notebook, hpath, "");
      showMessage(`已创建时间笔记「${periodDocName(p)}」`, 2500, "info");
    }
    // 新旧时间文档都会在打开时补上标记，便于以后切换默认笔记本时准确迁移。
    await setBlockAttrs(id, { "custom-chronicle-time": periodKey(p) }).catch(() => undefined);
    timeDocCache.set(hpath, id);
    markHasDoc(hpath);
    openDoc(ctx.app, id);
  } catch (err) {
    showMessage(`打开时间笔记失败：${(err as Error).message}`, 6000, "error");
  }
}

/** 查询某年已存在的时间笔记，为对应节点显示文档图标 */
export async function refreshTimeDocs(container: HTMLElement, ctx: Ctx, year: number): Promise<void> {
  try {
    let notebook = ctx.store.data.settings.notebook;
    if (!notebook) {
      const books = await lsNotebooks();
      if (!books.length) return;
      notebook = books[0].id;
    }
    const yearRoot = `/${year}年`;
    const rows = await querySQL<{ id: string; hpath: string }>(
      `SELECT id, hpath FROM blocks WHERE type = 'd' AND box = '${notebook}' AND (hpath = '/${year}年' OR hpath LIKE '/${year}年/%') LIMIT 512`
    );
    for (const hpath of Array.from(timeDocCache.keys())) {
      if (hpath === yearRoot || hpath.startsWith(`${yearRoot}/`)) timeDocCache.delete(hpath);
    }
    container.querySelectorAll<HTMLElement>(".el-hasdoc").forEach((el) => el.classList.remove("el-hasdoc"));
    for (const r of rows) timeDocCache.set(r.hpath, r.id);
    container.querySelectorAll<HTMLElement>("[data-hpath]").forEach((el) => {
      if (timeDocCache.has(el.dataset.hpath!)) el.classList.add("el-hasdoc");
    });
  } catch {
    // 装饰失败不影响主功能
  }
}

export function buildEntryChip(ctx: Ctx, entry: Entry): HTMLElement {
  const cat = ctx.store.categoryOf(entry.categoryId);
  const chip = document.createElement("div");
  chip.className = "el-chip";
  chip.style.setProperty("--el-cat", cat?.color ?? "var(--b3-theme-on-surface-light)");
  const tipParts = [cat ? `类目：${cat.name}` : "无类别"];
  if (entry.dates) tipParts.push(`日期：${fmtDatesBadge(entry.dates)}`);
  if (entry.note) tipParts.push(entry.note);
  tipParts.push("拖动可排序，或移到其他时间格");
  chip.title = tipParts.join("\n");
  chip.innerHTML = `
    <span class="el-chip__title">${esc(entry.title)}</span>
    ${entry.dates ? `<span class="el-chip__date">${esc(fmtDatesBadge(entry.dates))}</span>` : ""}`;
  chip.addEventListener("click", () => {
    if (chip.dataset.dragging) return;
    openEntryDialog(ctx, { entry });
  });
  if (entry.docs.length) {
    const docBtn = document.createElement("button");
    docBtn.className = "el-chip__docs";
    docBtn.title = `打开笔记「${entry.docs[0].title}」`;
    docBtn.innerHTML = `<svg><use xlink:href="#iconFile"></use></svg>${entry.docs.length > 1 ? entry.docs.length : ""}`;
    docBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDoc(ctx.app, entry.docs[0].id);
    });
    chip.appendChild(docBtn);
  }
  return chip;
}

type ChipsMode = "row" | "stack" | "year";

interface EntryMouseDragState {
  entryId: string;
  ctx: Ctx;
  chip: HTMLElement;
  placeholder: HTMLElement | null;
  targetBox: HTMLElement | null;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  started: boolean;
}

let entryDragState: EntryMouseDragState | null = null;

function finishEntryDrag(): void {
  const state = entryDragState;
  if (!state) return;
  document.removeEventListener("mousemove", onEntryDragMove, true);
  document.removeEventListener("mouseup", onEntryDragUp, true);
  window.removeEventListener("blur", finishEntryDrag);
  state.targetBox?.classList.remove("el-chips--drop-target");
  state.chip.classList.remove("el-chip--drag-source");
  state.chip.style.removeProperty("left");
  state.chip.style.removeProperty("top");
  state.chip.style.removeProperty("width");
  state.placeholder?.remove();
  if (state.started) window.setTimeout(() => delete state.chip.dataset.dragging, 0);
  entryDragState = null;
}

/** 根据鼠标位置寻找稳定落点；忽略占位符本身，避免向前拖动时来回闪烁。 */
function dropBeforeNode(box: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
  const chips = Array.from(box.children).filter((node): node is HTMLElement =>
    node instanceof HTMLElement && node.classList.contains("el-chip") && !node.classList.contains("el-chip--drag-source")
  );
  for (const chip of chips) {
    const rect = chip.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return chip;
    if (clientY <= rect.bottom && clientX < rect.left + rect.width / 2) return chip;
  }
  return null;
}

function periodFromBox(box: HTMLElement): PeriodRef | null {
  const unit = box.dataset.periodUnit as PeriodRef["unit"] | undefined;
  const year = Number(box.dataset.periodYear);
  const num = Number(box.dataset.periodNum);
  return unit && Number.isInteger(year) && Number.isInteger(num) ? { unit, year, num } : null;
}

function updatePointerDropTarget(state: EntryMouseDragState, clientX: number, clientY: number): void {
  state.chip.style.left = `${clientX - state.offsetX}px`;
  state.chip.style.top = `${clientY - state.offsetY}px`;
  // Electron 同一帧内可能仍把刚设为 pointer-events:none 的浮动框当作命中目标。
  // 命中测试时短暂隐藏它，才能取得下方真正的月/季/周时间格。
  state.chip.style.visibility = "hidden";
  const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  state.chip.style.removeProperty("visibility");
  const box = hit?.closest<HTMLElement>(".el-chips") ?? null;
  if (!box) {
    state.targetBox?.classList.remove("el-chips--drop-target");
    state.targetBox = null;
    return;
  }
  if (state.targetBox !== box) {
    state.targetBox?.classList.remove("el-chips--drop-target");
    box.classList.add("el-chips--drop-target");
    state.targetBox = box;
  }
  if (!state.placeholder) return;
  const addBtn = box.querySelector<HTMLElement>(":scope > .el-chips__add");
  const before = dropBeforeNode(box, clientX, clientY) || addBtn;
  if (before) {
    if (state.placeholder.parentElement !== box || state.placeholder.nextElementSibling !== before) {
      box.insertBefore(state.placeholder, before);
    }
  } else if (state.placeholder.parentElement !== box || state.placeholder.nextElementSibling) {
    box.appendChild(state.placeholder);
  }
}

function orderedIdsAtDrop(box: HTMLElement, state: EntryMouseDragState): string[] {
  const orderedIds: string[] = [];
  for (const child of Array.from(box.children)) {
    if (child === state.placeholder) {
      orderedIds.push(state.entryId);
    } else if (child instanceof HTMLElement && child.classList.contains("el-chip")) {
      const id = child.dataset.entryId;
      if (id && id !== state.entryId) orderedIds.push(id);
    }
  }
  return orderedIds;
}

function onEntryDragMove(event: MouseEvent): void {
  const state = entryDragState;
  if (!state) return;
  if (!state.started) {
    if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 5) return;
    const rect = state.chip.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "el-chip-drop-placeholder";
    placeholder.style.width = `${Math.ceil(rect.width)}px`;
    placeholder.style.height = `${Math.ceil(rect.height)}px`;
    state.chip.parentElement?.insertBefore(placeholder, state.chip);
    state.placeholder = placeholder;
    state.targetBox = state.chip.closest<HTMLElement>(".el-chips");
    state.offsetX = state.startX - rect.left;
    state.offsetY = state.startY - rect.top;
    state.started = true;
    state.chip.dataset.dragging = "true";
    state.chip.style.width = `${Math.ceil(rect.width)}px`;
    state.chip.classList.add("el-chip--drag-source");
    state.targetBox?.classList.add("el-chips--drop-target");
  }
  event.preventDefault();
  updatePointerDropTarget(state, event.clientX, event.clientY);
}

function onEntryDragUp(event: MouseEvent): void {
  const state = entryDragState;
  if (!state) return;
  if (!state.started) {
    finishEntryDrag();
    return;
  }
  event.preventDefault();
  // 快速拖动时最后一个 mousemove 可能早于真实松手位置，以 mouseup 坐标校准最终时间格。
  updatePointerDropTarget(state, event.clientX, event.clientY);
  const targetBox = state.targetBox;
  const target = targetBox ? periodFromBox(targetBox) : null;
  const orderedIds = targetBox && target ? orderedIdsAtDrop(targetBox, state) : [];
  const { entryId, ctx } = state;
  finishEntryDrag();
  if (target) ctx.store.moveEntry(entryId, target, orderedIds);
}

function chipsBox(ctx: Ctx, entries: Entry[], p: PeriodRef, mode: ChipsMode = "row"): HTMLElement {
  const box = document.createElement("div");
  box.className = `el-chips el-chips--${mode}`;
  box.dataset.periodUnit = p.unit;
  box.dataset.periodYear = String(p.year);
  box.dataset.periodNum = String(p.num);
  const manuallyOrdered = entries.some((entry) => Number.isFinite(entry.order));
  const sorted = entries.slice().sort((a, b) => manuallyOrdered
    ? (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.created - b.created
    : a.created - b.created);
  for (const entry of sorted) {
    const chip = buildEntryChip(ctx, entry);
    chip.dataset.entryId = entry.id;
    chip.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
      finishEntryDrag();
      entryDragState = {
        entryId: entry.id,
        ctx,
        chip,
        placeholder: null,
        targetBox: null,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: 0,
        offsetY: 0,
        started: false
      };
      document.addEventListener("mousemove", onEntryDragMove, true);
      document.addEventListener("mouseup", onEntryDragUp, true);
      window.addEventListener("blur", finishEntryDrag);
    });
    box.appendChild(chip);
  }
  const addBtn = document.createElement("button");
  addBtn.className = "el-chips__add";
  addBtn.title = "在此时间段创建活动";
  addBtn.textContent = "＋";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openEntryDialog(ctx, { presetPeriod: p });
  });
  box.appendChild(addBtn);
  return box;
}

/** 固定年/季/月格的加号属于单元格右上角，不参与活动列表滚动。 */
function hoistAddButton(cell: HTMLElement, box: HTMLElement): void {
  const addButton = box.querySelector<HTMLElement>(":scope > .el-chips__add");
  if (addButton) cell.appendChild(addButton);
}

export function timeLabel(ctx: Ctx, p: PeriodRef, cls: string, text: string, sub?: string): HTMLElement {
  const label = document.createElement("span");
  label.className = cls + " el-tlabel";
  label.dataset.hpath = periodHPath(p);
  label.title = `点击打开时间笔记「${periodDocName(p)}」（不存在则自动创建）`;
  const textHtml = `<span class="el-tlabel__text">${esc(text)}</span>`;
  const iconHtml = '<svg class="el-doclink"><use xlink:href="#iconFile"></use></svg>';
  const subHtml = sub ? `<span class="el-sub">${esc(sub)}</span>` : "";
  label.innerHTML = p.unit === "week"
    ? `${textHtml}${subHtml}${iconHtml}`
    : `${textHtml}${iconHtml}${subHtml}`;
  label.addEventListener("click", () => void openOrCreateTimeDoc(ctx, p));
  return label;
}

export interface TimelineHandles {
  changeYear(delta: number): void;
  openSettings(): void;
  toggleView(): void;
}

export interface NavItem {
  label: string;
  title: string;
  action(): void;
  icon?: boolean;
}

/** 两种视图共用的最左侧年份栏：年标签＋年度活动＋底部按钮组 */
export function buildYearCell(ctx: Ctx, year: number, handles: TimelineHandles, toggle: { icon: string; title: string }): HTMLElement {
  const yp: PeriodRef = { unit: "year", year, num: 0 };
  const cell = document.createElement("div");
  cell.className = "el-cell el-cell--year" + (year === new Date().getFullYear() ? " el-cell--year--current" : "");
  cell.style.gridRow = "1 / 13";
  cell.style.gridColumn = "1";
  cell.dataset.key = periodKey(yp);
  cell.appendChild(timeLabel(ctx, yp, "el-ylabel", `${year} 年`));
  const entries = ctx.store.data.entries.filter((e) => !e.dayOnly && samePeriod(e.period, yp));
  const chips = chipsBox(ctx, entries, yp, "year");
  cell.appendChild(chips);
  hoistAddButton(cell, chips);
  cell.appendChild(buildYearNav(year, handles, toggle));
  return cell;
}

/** 年份栏底部的导航按钮组：设置｜上一年｜下一年｜视图切换 */
export function buildYearNav(year: number, handles: TimelineHandles, toggle: { icon: string; title: string }): HTMLElement {
  const nav = document.createElement("div");
  nav.className = "el-year-nav";
  const items: NavItem[] = [
    {
      label: '<svg aria-hidden="true"><use xlink:href="#iconSettings"></use></svg>',
      title: "设置（S）",
      action: handles.openSettings,
      icon: true
    },
    { label: "←", title: `上一年（${year - 1}）`, action: () => handles.changeYear(-1) },
    { label: "→", title: `下一年（${year + 1}）`, action: () => handles.changeYear(1) },
    {
      label: `<svg aria-hidden="true"><use xlink:href="#${toggle.icon}"></use></svg>`,
      title: toggle.title,
      action: handles.toggleView,
      icon: true
    }
  ];
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    if (item.icon) button.innerHTML = item.label;
    else button.textContent = item.label;
    button.title = item.title;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      item.action();
    });
    nav.appendChild(button);
  }
  return nav;
}

export function renderTimeline(container: HTMLElement, ctx: Ctx, year: number, handles: TimelineHandles): void {
  const { store } = ctx;
  container.innerHTML = "";
  container.classList.add("el-timewrap");

  if (!store.data.categories.length) {
    const banner = document.createElement("div");
    banner.className = "el-banner";
    banner.textContent = "还没有类目——按 S 打开设置，定义属于你自己的类目体系。";
    container.appendChild(banner);
  }

  const byKey = new Map<string, Entry[]>();
  for (const e of store.data.entries) {
    if (e.dayOnly || e.period.year !== year) continue;
    const key = periodKey(e.period);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(e);
  }
  const entriesAt = (p: PeriodRef) => byKey.get(periodKey(p)) ?? [];

  const nowWeek = currentPeriod("week");
  const nowMonth = currentPeriod("month");
  const nowQuarter = currentPeriod("quarter");
  const nowYear = new Date().getFullYear();
  const totalWeeks = weeksInYear(year);

  const panes = document.createElement("div");
  panes.className = "el-panes";

  const cols = store.data.settings.colsCustomized
    ? { ...DEFAULT_TIME_COLS, ...(store.data.settings.cols ?? {}) }
    : { ...DEFAULT_TIME_COLS };

  // 年｜季｜月固定一屏；周恢复为独立纵向时间轴。
  const fixed = document.createElement("div");
  fixed.className = "el-fixed";

  const mkCell = (cls: string, rowStart: number, rowEnd: number, col: number, current: boolean, key: string) => {
    const cell = document.createElement("div");
    cell.className = cls + (current ? ` ${cls}--current` : "");
    cell.style.gridRow = `${rowStart} / ${rowEnd}`;
    cell.style.gridColumn = String(col);
    cell.dataset.key = key;
    return cell;
  };

  fixed.appendChild(buildYearCell(ctx, year, handles, { icon: "iconCalendar", title: "日期面板（D）" }));

  for (let q = 1; q <= 4; q++) {
    const qp: PeriodRef = { unit: "quarter", year, num: q };
    const qCell = mkCell("el-cell el-cell--quarter", (q - 1) * 3 + 1, q * 3 + 1, 2, samePeriod(qp, nowQuarter), periodKey(qp));
    qCell.appendChild(timeLabel(ctx, qp, "el-qlabel", `第 ${q} 季度`));
    const quarterChips = chipsBox(ctx, entriesAt(qp), qp, "stack");
    qCell.appendChild(quarterChips);
    hoistAddButton(qCell, quarterChips);
    fixed.appendChild(qCell);
  }

  for (let m = 1; m <= 12; m++) {
    const mp: PeriodRef = { unit: "month", year, num: m };
    const mCell = mkCell("el-cell el-cell--month", m, m + 1, 3, samePeriod(mp, nowMonth), periodKey(mp));
    mCell.appendChild(timeLabel(ctx, mp, "el-mlabel", `${m} 月`));
    const monthChips = chipsBox(ctx, entriesAt(mp), mp, "row");
    mCell.appendChild(monthChips);
    hoistAddButton(mCell, monthChips);
    fixed.appendChild(mCell);
  }

  panes.appendChild(fixed);

  const weeks = document.createElement("div");
  weeks.className = "el-weeks";
  for (let w = 1; w <= totalWeeks; w++) {
    const wp: PeriodRef = { unit: "week", year, num: w };
    const row = document.createElement("div");
    row.className = "el-wrow" + (samePeriod(wp, nowWeek) ? " el-wrow--current" : "");
    row.dataset.key = periodKey(wp);
    row.appendChild(
      timeLabel(ctx, wp, "el-wlabel", `第 ${w} 周`, `${fmtMonthDay(weekStart(year, w))}–${fmtMonthDay(weekEnd(year, w))}`)
    );
    row.appendChild(chipsBox(ctx, entriesAt(wp), wp, "row"));
    weeks.appendChild(row);
  }
  panes.appendChild(weeks);

  // 四列按比例铺满面板；周列纵向滚动，但不会产生横向滚动条。
  const grips: Record<"y" | "q" | "m", HTMLElement> = {} as never;
  const applyCols = () => {
    const total = cols.y + cols.q + cols.m + cols.w;
    const y = cols.y / total * 100;
    const q = cols.q / total * 100;
    const m = cols.m / total * 100;
    const w = 100 - y - q - m;
    const fixedWidth = y + q + m;
    fixed.style.width = `${fixedWidth}%`;
    fixed.style.gridTemplateColumns = `${y / fixedWidth * 100}% ${q / fixedWidth * 100}% ${m / fixedWidth * 100}%`;
    weeks.style.width = `${w}%`;
    grips.y.style.left = `calc(${y}% - 3px)`;
    grips.q.style.left = `calc(${y + q}% - 3px)`;
    grips.m.style.left = `calc(${y + q + m}% - 3px)`;
  };
  const LIMITS: Record<"y" | "q" | "m" | "w", [number, number]> = {
    y: [76, 320], q: [92, 380], m: [150, 640], w: [280, 960]
  };
  for (const which of ["y", "q", "m"] as const) {
    const h = document.createElement("div");
    h.className = "el-resize";
    h.title = "拖动调整列宽";
    h.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const tracks = getComputedStyle(fixed).gridTemplateColumns.split(" ").map((value) => parseFloat(value));
      if (tracks.length >= 3 && tracks.every(Number.isFinite)) {
        [cols.y, cols.q, cols.m] = tracks;
        cols.w = weeks.getBoundingClientRect().width;
      }
      const startX = e.clientX;
      const startVal = cols[which];
      const next = which === "y" ? "q" : which === "q" ? "m" : "w";
      const startNext = cols[next];
      const pairTotal = startVal + startNext;
      const [lo, hi] = LIMITS[which];
      const [nextLo] = LIMITS[next];
      const onMove = (ev: MouseEvent) => {
        cols[which] = Math.min(hi, pairTotal - nextLo, Math.max(lo, startVal + ev.clientX - startX));
        cols[next] = pairTotal - cols[which];
        applyCols();
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        store.updateSettings({ cols: { ...cols }, colsCustomized: true });
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    grips[which] = h;
    panes.appendChild(h);
  }
  container.appendChild(panes);
  applyCols();
  void refreshTimeDocs(container, ctx, year);
}
