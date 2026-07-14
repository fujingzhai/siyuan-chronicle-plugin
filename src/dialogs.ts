import { App, Dialog, confirm, showMessage } from "siyuan";
import {
  createDocWithMd,
  createNotebook,
  deleteBlock,
  getOrCreateDocByHPath,
  lsNotebooks,
  moveDocsByID,
  openDoc,
  searchDocs,
  setBlockAttrs
} from "./api";
import { migrateChronicleDocuments, migrateManagedActivityDocsForCategory } from "./documents";
import { PALETTE, Store, genId } from "./store";
import {
  UNIT_LABELS,
  currentPeriod,
  fmtMonthDay,
  maxNumOf,
  periodDateRange,
  samePeriod,
  toISODate,
  weekEnd,
  weekStart
} from "./time";
import { Entry, PeriodRef, Unit } from "./types";

export interface Ctx {
  app: App;
  store: Store;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const DEFAULT_NOTEBOOK_NAME = "岁时记";

/** 取默认笔记本；首次使用时优先使用或创建“岁时记”。 */
export async function resolveNotebook(store: Store): Promise<string> {
  const books = await lsNotebooks();
  const configured = store.data.settings.notebook;
  const configuredBook = books.find((book) => book.id === configured);
  if (configuredBook && store.data.settings.notebookCustomized) return configuredBook.id;
  // 旧版可能把第一个笔记本当默认；为避免擅自改动，非“歲時記”的既有选择视为用户自定义。
  if (configuredBook && configuredBook.name !== DEFAULT_NOTEBOOK_NAME && configuredBook.name !== "歲時記") {
    store.updateSettings({ notebookCustomized: true });
    return configuredBook.id;
  }
  const notebook = books.find((book) => book.name === DEFAULT_NOTEBOOK_NAME)
    ?? await createNotebook(DEFAULT_NOTEBOOK_NAME);
  store.updateSettings({
    notebook: notebook.id,
    notebookCustomized: false,
    managedNotebooks: Array.from(new Set([
      ...(store.data.settings.managedNotebooks ?? []),
      configured,
      notebook.id
    ].filter(Boolean)))
  });
  return notebook.id;
}

function numOptionLabel(unit: Unit, year: number, num: number): string {
  switch (unit) {
    case "week":
      return `第 ${num} 周（${fmtMonthDay(weekStart(year, num))} – ${fmtMonthDay(weekEnd(year, num))}）`;
    case "month":
      return `${num} 月`;
    case "quarter":
      return `第 ${num} 季度（${(num - 1) * 3 + 1}–${num * 3} 月）`;
    default:
      return "";
  }
}

function dateParts(iso: string): { month: string; day: string } {
  const [, month, day] = iso.split("-").map(Number);
  return { month: String(month), day: String(day) };
}

function parseDateParts(
  monthRaw: string,
  dayRaw: string,
  range: { start: Date; end: Date },
  needsMonth: boolean
): string | null | undefined {
  const monthText = monthRaw.trim();
  const dayText = dayRaw.trim();
  if (!monthText && !dayText) return null;
  if (!dayText || (needsMonth && !monthText)) return undefined;
  const month = needsMonth ? Number(monthText) : null;
  const day = Number(dayText);
  if (!Number.isInteger(day) || day < 1 || day > 31) return undefined;
  if (needsMonth && (!Number.isInteger(month) || month! < 1 || month! > 12)) return undefined;
  const lo = toISODate(range.start);
  const hi = toISODate(range.end);
  // 按周期逐日寻找，月/周只填“日”时也能正确处理跨月、跨年的 ISO 周。
  for (const date = new Date(range.start); date <= range.end; date.setDate(date.getDate() + 1)) {
    if (date.getDate() !== day) continue;
    if (needsMonth && date.getMonth() + 1 !== month) continue;
    const iso = toISODate(date);
    if (iso >= lo && iso <= hi) return iso;
  }
  return undefined;
}

// ---------------- 活动编辑 ----------------

export function openEntryDialog(ctx: Ctx, opts: { entry?: Entry; presetPeriod?: PeriodRef }): void {
  const { store } = ctx;
  const isNew = !opts.entry;
  const originalPeriod = opts.entry ? { ...opts.entry.period } : null;
  const originalCategoryId = opts.entry?.categoryId ?? null;
  const work: Entry = opts.entry
    ? JSON.parse(JSON.stringify(opts.entry))
    : {
        id: genId(),
        title: "",
        categoryId: store.data.categories[0]?.id ?? null,
        period: opts.presetPeriod ? { ...opts.presetPeriod } : currentPeriod("week"),
        docs: [],
        note: "",
        created: Date.now(),
        updated: Date.now()
      };

  const catOptions = store.data.categories
    .map((c) => `<option value="${c.id}" ${work.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("");

  const dialog = new Dialog({
    title: isNew ? "创建活动" : "编辑活动",
    width: "560px",
    content: `
<div class="b3-dialog__content el-dialog">
  <div class="el-form">
    <label class="el-form__row">
      <span class="el-form__label">标题</span>
      <input class="b3-text-field fn__flex-1" data-role="title" value="${esc(work.title)}">
    </label>
    <label class="el-form__row">
      <span class="el-form__label">类目</span>
      <select class="b3-select fn__flex-1" data-role="category">
        ${catOptions}
        <option value="" ${work.categoryId ? "" : "selected"}>无类别</option>
      </select>
    </label>
    <div class="el-form__row">
      <span class="el-form__label">时间</span>
      <div class="fn__flex fn__flex-1 el-period">
        <select class="b3-select" data-role="unit">
          ${(["week", "month", "quarter", "year"] as Unit[])
            .map((u) => `<option value="${u}" ${work.period.unit === u ? "selected" : ""}>${UNIT_LABELS[u]}</option>`)
            .join("")}
        </select>
        <input class="b3-text-field el-period__year" data-role="year" type="number" value="${work.period.year}">
        <select class="b3-select fn__flex-1" data-role="num"></select>
      </div>
    </div>
    <div class="el-form__row">
      <span class="el-form__label">日期</span>
      <div class="fn__flex-1 el-date-editor" data-role="date-editor">
        <div class="el-date-editor__fields">
        <span class="el-date-part el-date-month-part"><input class="b3-text-field el-date-input" data-role="date-start-month" inputmode="numeric" maxlength="2" aria-label="开始月份"><span>月</span></span>
        <span class="el-date-part"><input class="b3-text-field el-date-input" data-role="date-start-day" inputmode="numeric" maxlength="2" aria-label="开始日期"><span>日</span></span>
        <span class="el-date-editor__separator">–</span>
        <span class="el-date-part el-date-month-part"><input class="b3-text-field el-date-input" data-role="date-end-month" inputmode="numeric" maxlength="2" aria-label="结束月份"><span>月</span></span>
        <span class="el-date-part"><input class="b3-text-field el-date-input" data-role="date-end-day" inputmode="numeric" maxlength="2" aria-label="结束日期"><span>日</span></span>
        </div>
      </div>
    </div>
    <label class="el-form__row">
      <span class="el-form__label">备注</span>
      <input class="b3-text-field fn__flex-1" data-role="note" value="${esc(work.note)}">
    </label>
    <div class="el-form__row">
      <span class="el-form__label">绑定笔记</span>
      <div class="fn__flex-1">
        <div class="fn__flex" style="gap:6px">
          <input class="b3-text-field fn__flex-1" data-role="doc-search" placeholder="搜索现有笔记标题…">
          <button class="b3-button b3-button--outline" data-role="doc-create">新建并绑定</button>
        </div>
        <div class="el-doc-results" data-role="doc-results"></div>
        <div class="el-docs" data-role="docs"></div>
      </div>
    </div>
  </div>
</div>
<div class="b3-dialog__action">
  ${isNew ? "" : '<button class="b3-button b3-button--remove" data-role="delete">删除</button><div class="fn__flex-1"></div>'}
  <button class="b3-button b3-button--cancel" data-role="cancel">取消</button>
  <div class="fn__space"></div>
  <button class="b3-button b3-button--text" data-role="save">保存</button>
</div>`
  });

  const $ = <T extends HTMLElement>(role: string): T =>
    dialog.element.querySelector(`[data-role="${role}"]`) as T;

  const titleInput = $<HTMLInputElement>("title");
  const unitSel = $<HTMLSelectElement>("unit");
  const yearInput = $<HTMLInputElement>("year");
  const numSel = $<HTMLSelectElement>("num");
  const dateEditor = $<HTMLElement>("date-editor");
  const dateStartMonth = $<HTMLInputElement>("date-start-month");
  const dateStartDay = $<HTMLInputElement>("date-start-day");
  const dateEndMonth = $<HTMLInputElement>("date-end-month");
  const dateEndDay = $<HTMLInputElement>("date-end-day");

  const rebuildDates = () => {
    const range = periodDateRange(work.period);
    const lo = toISODate(range.start);
    const hi = toISODate(range.end);
    const startValue = work.dates?.start && work.dates.start >= lo && work.dates.start <= hi ? work.dates.start : "";
    const endValue = work.dates?.end && work.dates.end >= lo && work.dates.end <= hi ? work.dates.end : "";
    const needsMonth = work.period.unit === "year" || work.period.unit === "quarter";
    dateEditor.classList.toggle("el-date-editor--day-only", !needsMonth);
    const start = startValue ? dateParts(startValue) : { month: "", day: "" };
    const end = endValue ? dateParts(endValue) : { month: "", day: "" };
    dateStartMonth.value = needsMonth ? start.month : "";
    dateStartDay.value = start.day;
    dateEndMonth.value = needsMonth ? end.month : "";
    dateEndDay.value = end.day;
  };

  const rebuildNums = () => {
    const unit = unitSel.value as Unit;
    const year = parseInt(yearInput.value, 10) || new Date().getFullYear();
    if (unit === "year") {
      numSel.style.display = "none";
      work.period = { unit, year, num: 0 };
      rebuildDates();
      return;
    }
    numSel.style.display = "";
    const max = maxNumOf(unit, year);
    const cur = Math.min(Math.max(work.period.unit === unit ? work.period.num : currentPeriod(unit).num, 1), max);
    numSel.innerHTML = "";
    for (let n = 1; n <= max; n++) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = numOptionLabel(unit, year, n);
      if (n === cur) opt.selected = true;
      numSel.appendChild(opt);
    }
    work.period = { unit, year, num: cur };
    rebuildDates();
  };
  rebuildNums();

  unitSel.addEventListener("change", rebuildNums);
  yearInput.addEventListener("change", rebuildNums);
  numSel.addEventListener("change", () => {
    work.period.num = parseInt(numSel.value, 10) || 1;
    rebuildDates();
  });

  // ---- 绑定笔记 ----
  const docsBox = $("docs");
  const renderDocs = () => {
    docsBox.innerHTML = "";
    for (const doc of work.docs) {
      const row = document.createElement("div");
      row.className = "el-docs__row";
      row.innerHTML = `<svg class="el-docs__icon"><use xlink:href="#iconFile"></use></svg>
        <span class="el-docs__title" title="点击打开">${esc(doc.title)}</span>
        <button class="b3-button b3-button--text el-docs__remove" title="解绑">✕</button>`;
      (row.querySelector(".el-docs__title") as HTMLElement).addEventListener("click", () => {
        openDoc(ctx.app, doc.id);
        dialog.destroy();
      });
      (row.querySelector(".el-docs__remove") as HTMLElement).addEventListener("click", () => {
        work.docs = work.docs.filter((d) => d.id !== doc.id);
        renderDocs();
      });
      docsBox.appendChild(row);
    }
  };
  renderDocs();

  const searchInput = $<HTMLInputElement>("doc-search");
  const resultsBox = $("doc-results");
  let searchTimer = 0;
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    const k = searchInput.value.trim();
    if (!k) {
      resultsBox.innerHTML = "";
      return;
    }
    searchTimer = window.setTimeout(async () => {
      try {
        const rows = (await searchDocs(k)).slice(0, 8);
        resultsBox.innerHTML = "";
        if (!rows.length) {
          resultsBox.innerHTML = '<div class="el-form__hint">无匹配文档</div>';
          return;
        }
        for (const r of rows) {
          const item = document.createElement("div");
          item.className = "el-doc-results__item";
          item.innerHTML = `<span>${esc(r.title)}</span><span class="el-doc-results__path">${esc(r.hPath)}</span>`;
          item.addEventListener("click", () => {
            if (!work.docs.some((d) => d.id === r.id)) {
              work.docs.push({ id: r.id, title: r.title });
              renderDocs();
            }
            searchInput.value = "";
            resultsBox.innerHTML = "";
          });
          resultsBox.appendChild(item);
        }
      } catch (err) {
        showMessage(`搜索失败：${(err as Error).message}`, 6000, "error");
      }
    }, 300);
  });

  $("doc-create").addEventListener("click", async () => {
    const title = titleInput.value.trim();
    if (!title) {
      showMessage("请先填写活动标题，将用作笔记标题", 4000, "info");
      return;
    }
    try {
      const notebook = await resolveNotebook(store);
      const catId = $<HTMLSelectElement>("category").value || null;
      const cat = store.categoryOf(catId);
      const catName = (cat ? cat.name : "无类别").replace(/\//g, "／");
      const safeTitle = title.replace(/\//g, "／");
      const parentId = await getOrCreateDocByHPath(notebook, `/${catName}`);
      // 先在根目录创建目标文档，再按明确的父文档 ID 移动，避免同名类目文档造成歧义。
      const docId = await createDocWithMd(notebook, `/${safeTitle}`, "");
      await moveDocsByID([docId], parentId);
      await setBlockAttrs(docId, { "custom-chronicle": work.id }).catch(() => undefined);
      work.docs.push({ id: docId, title });
      renderDocs();
      showMessage(`已创建笔记「${title}」`, 3000, "info");
    } catch (err) {
      showMessage(`创建笔记失败：${(err as Error).message}`, 6000, "error");
    }
  });

  // ---- 动作 ----
  $("cancel").addEventListener("click", () => dialog.destroy());
  const saveButton = $<HTMLButtonElement>("save");
  let saving = false;
  const saveEntry = async () => {
    if (saving) return;
    const title = titleInput.value.trim();
    if (!title) {
      showMessage("标题不能为空", 4000, "info");
      return;
    }
    work.title = title;
    const nextCategoryId = $<HTMLSelectElement>("category").value || null;
    work.note = $<HTMLInputElement>("note").value.trim();
    if (originalPeriod && !samePeriod(originalPeriod, work.period)) delete work.order;
    delete work.done;
    const range = periodDateRange(work.period);
    const needsMonth = work.period.unit === "year" || work.period.unit === "quarter";
    const start = parseDateParts(dateStartMonth.value, dateStartDay.value, range, needsMonth);
    const end = parseDateParts(dateEndMonth.value, dateEndDay.value, range, needsMonth);
    if (start === undefined || end === undefined) {
      showMessage(needsMonth
        ? "请填写有效的月、日，并确保日期位于当前时间范围内"
        : "请填写有效的日期，并确保日期位于当前时间范围内", 4500, "info");
      return;
    }
    if (!start && end) {
      showMessage("请先填写开始日期", 3500, "info");
      return;
    }
    if (start && end && end < start) {
      showMessage("结束日期不能早于开始日期", 3500, "info");
      return;
    }
    if (start) {
      work.dates = { start, ...(end ? { end } : {}) };
    } else {
      delete work.dates;
    }
    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = "保存中…";
    try {
      if (!isNew && originalCategoryId !== nextCategoryId) {
        await migrateManagedActivityDocsForCategory(store, work.id, work.docs, originalCategoryId, nextCategoryId);
      }
      work.categoryId = nextCategoryId;
      store.upsertEntry(work);
      dialog.destroy();
    } catch (err) {
      saving = false;
      saveButton.disabled = false;
      saveButton.textContent = "保存";
      showMessage(`保存活动失败：${(err as Error).message}`, 7000, "error");
    }
  };
  saveButton.addEventListener("click", () => void saveEntry());
  dialog.element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing || event.repeat || event.keyCode === 229) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("textarea, select, button, a, [contenteditable=true], [data-role='doc-search'], .el-doc-results")) return;
    event.preventDefault();
    event.stopPropagation();
    void saveEntry();
  });
  if (!isNew) {
    $("delete").addEventListener("click", () => {
      if (!work.docs.length) {
        store.removeEntry(work.id);
        dialog.destroy();
        return;
      }

      const deleteDialog = new Dialog({
        title: "删除活动",
        width: "420px",
        content: `
<div class="b3-dialog__content el-delete-entry">
  <div>确定删除活动「${esc(work.title)}」？</div>
  <label class="el-delete-entry__docs">
    <input class="b3-switch" type="checkbox" data-role="delete-docs">
    <span>同时删除 ${work.docs.length} 篇绑定笔记</span>
  </label>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" data-role="delete-cancel">取消</button>
  <div class="fn__space"></div>
  <button class="b3-button b3-button--remove" data-role="delete-confirm">删除活动</button>
</div>`
      });
      const deleteRoot = deleteDialog.element;
      const deleteDocs = deleteRoot.querySelector('[data-role="delete-docs"]') as HTMLInputElement;
      const confirmDelete = deleteRoot.querySelector('[data-role="delete-confirm"]') as HTMLButtonElement;
      (deleteRoot.querySelector('[data-role="delete-cancel"]') as HTMLButtonElement)
        .addEventListener("click", () => deleteDialog.destroy());
      deleteDocs.addEventListener("change", () => {
        confirmDelete.textContent = deleteDocs.checked ? "删除活动和笔记" : "删除活动";
      });
      confirmDelete.addEventListener("click", async () => {
        confirmDelete.disabled = true;
        let failed = 0;
        if (deleteDocs.checked) {
          const results = await Promise.allSettled(work.docs.map((doc) => deleteBlock(doc.id)));
          failed = results.filter((result) => result.status === "rejected").length;
        }
        store.removeEntry(work.id);
        deleteDialog.destroy();
        dialog.destroy();
        if (failed) {
          showMessage(`活动已删除，但有 ${failed} 篇绑定笔记删除失败`, 6000, "error");
        }
      });
    });
  }

  titleInput.focus();
}

// ---------------- 类目管理 ----------------

function mountCategoryEditor(ctx: Ctx, root: HTMLElement): void {
  const { store } = ctx;
  const listBox = root.querySelector('[data-role="cat-list"]') as HTMLElement;
  const nameInput = root.querySelector('[data-role="new-name"]') as HTMLInputElement;
  listBox.classList.add("el-cat-list");

  interface CategoryDragState {
    row: HTMLElement;
    placeholder: HTMLElement | null;
    startX: number;
    startY: number;
    offsetY: number;
    left: number;
    width: number;
    started: boolean;
    originNext: ChildNode | null;
  }

  let dragState: CategoryDragState | null = null;

  const resetFloatingRow = (row: HTMLElement) => {
    row.classList.remove("el-cat-row--drag-source");
    row.style.removeProperty("left");
    row.style.removeProperty("top");
    row.style.removeProperty("width");
  };

  const finishDrag = (commit: boolean) => {
    const state = dragState;
    if (!state) return;
    document.removeEventListener("mousemove", onDragMove, true);
    document.removeEventListener("mouseup", onDragUp, true);
    window.removeEventListener("blur", onDragCancel);
    document.body.classList.remove("el-cat-sort-active");

    if (state.started && state.placeholder) {
      if (commit) {
        listBox.insertBefore(state.row, state.placeholder);
      } else if (state.originNext?.parentNode === listBox) {
        listBox.insertBefore(state.row, state.originNext);
      } else {
        listBox.appendChild(state.row);
      }
      state.placeholder.remove();
      resetFloatingRow(state.row);
      if (commit) {
        const orderedIds = Array.from(listBox.querySelectorAll<HTMLElement>(".el-cat-row"))
          .map((row) => row.dataset.categoryId)
          .filter((id): id is string => !!id);
        store.reorderCategories(orderedIds);
      }
    }
    dragState = null;
  };

  const movePlaceholder = (clientY: number) => {
    const state = dragState;
    if (!state?.placeholder) return;
    const hit = document.elementFromPoint(state.left + state.width / 2, clientY) as HTMLElement | null;
    const target = hit?.closest<HTMLElement>(".el-cat-row");
    if (target && target !== state.row && target.parentElement === listBox) {
      const rect = target.getBoundingClientRect();
      const before = clientY < rect.top + rect.height / 2 ? target : target.nextSibling;
      if (before !== state.placeholder) listBox.insertBefore(state.placeholder, before);
      return;
    }
    const listRect = listBox.getBoundingClientRect();
    if (clientY >= listRect.top && clientY <= listRect.bottom + 18) {
      const rows = Array.from(listBox.querySelectorAll<HTMLElement>(".el-cat-row"))
        .filter((row) => row !== state.row);
      if (!rows.length || clientY > rows[rows.length - 1].getBoundingClientRect().bottom) {
        listBox.appendChild(state.placeholder);
      }
    }
  };

  function onDragMove(event: MouseEvent) {
    const state = dragState;
    if (!state) return;
    if (!state.started) {
      if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 4) return;
      const rect = state.row.getBoundingClientRect();
      const placeholder = document.createElement("div");
      placeholder.className = "el-cat-row-drop-placeholder";
      placeholder.style.height = `${Math.ceil(rect.height)}px`;
      listBox.insertBefore(placeholder, state.row);
      state.placeholder = placeholder;
      state.offsetY = state.startY - rect.top;
      state.left = rect.left;
      state.width = rect.width;
      state.started = true;
      state.row.style.left = `${rect.left}px`;
      state.row.style.top = `${rect.top}px`;
      state.row.style.width = `${rect.width}px`;
      state.row.classList.add("el-cat-row--drag-source");
      document.body.classList.add("el-cat-sort-active");
    }
    event.preventDefault();
    state.row.style.top = `${event.clientY - state.offsetY}px`;
    movePlaceholder(event.clientY);
  }

  function onDragUp(event: MouseEvent) {
    if (dragState?.started) event.preventDefault();
    finishDrag(true);
  }

  function onDragCancel() {
    finishDrag(false);
  }

  const render = () => {
    listBox.innerHTML = "";
    store.data.categories.forEach((cat) => {
      const row = document.createElement("div");
      row.className = "el-cat-row";
      row.dataset.categoryId = cat.id;
      row.innerHTML = `
        <span class="el-cat-row__handle" title="按住拖动排序">⠿</span>
        <input class="el-cat-row__color" type="color" value="${cat.color}" title="选择颜色">
        <input class="b3-text-field fn__flex-1" value="${esc(cat.name)}">
        <button class="b3-button b3-button--outline el-cat-row__btn el-cat-row__delete" title="删除">✕</button>`;
      const handle = row.querySelector(".el-cat-row__handle") as HTMLElement;
      const color = row.querySelector(".el-cat-row__color") as HTMLInputElement;
      const input = row.querySelector('.b3-text-field') as HTMLInputElement;
      const delBtn = row.querySelector(".el-cat-row__delete") as HTMLButtonElement;
      handle.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        finishDrag(false);
        dragState = {
          row,
          placeholder: null,
          startX: event.clientX,
          startY: event.clientY,
          offsetY: 0,
          left: 0,
          width: 0,
          started: false,
          originNext: row.nextSibling
        };
        document.addEventListener("mousemove", onDragMove, true);
        document.addEventListener("mouseup", onDragUp, true);
        window.addEventListener("blur", onDragCancel);
      });
      color.addEventListener("change", () => {
        store.updateCategory(cat.id, { color: color.value });
      });
      input.addEventListener("change", () => {
        const v = input.value.trim();
        if (v) store.updateCategory(cat.id, { name: v });
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) input.blur();
      });
      delBtn.addEventListener("click", () => {
        const n = store.data.entries.filter((e) => e.categoryId === cat.id).length;
        const doDelete = () => {
          store.removeCategory(cat.id);
          render();
        };
        if (n > 0) {
          confirm("删除类目", `「${esc(cat.name)}」下有 ${n} 条活动，删除后这些活动将变为无类别。继续？`, doDelete);
        } else {
          doDelete();
        }
      });
      listBox.appendChild(row);
    });
  };
  render();

  const addCategory = () => {
    const name = nameInput.value.trim();
    if (!name) return;
    const used = new Set(store.data.categories.map((c) => c.color));
    const color = PALETTE.find((c) => !used.has(c)) || PALETTE[store.data.categories.length % PALETTE.length];
    store.addCategory(name, color);
    nameInput.value = "";
    render();
  };
  (root.querySelector('[data-role="add"]') as HTMLElement).addEventListener("click", addCategory);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addCategory();
  });
}

/** 兼容旧调用入口；类目管理已合并进设置。 */
export function openCategoryManager(ctx: Ctx): void {
  openSettingsDialog(ctx);
}

// ---------------- 设置 ----------------

export function openSettingsDialog(ctx: Ctx): void {
  const { store } = ctx;
  let settingsKeydown: ((event: KeyboardEvent) => void) | null = null;
  const dialog = new Dialog({
    title: "设置",
    width: "520px",
    destroyCallback: () => {
      if (settingsKeydown) document.removeEventListener("keydown", settingsKeydown, true);
      settingsKeydown = null;
    },
    content: `
<div class="b3-dialog__content el-dialog">
  <div class="el-settings__section">
    <div class="el-form">
    <label class="el-form__row">
      <span class="el-form__label">默认笔记本</span>
      <select class="b3-select fn__flex-1" data-role="notebook"><option value="">加载中…</option></select>
    </label>
    <div class="el-form__hint">更换默认笔记本时，既有的时间笔记树和由岁时记创建的活动笔记会自动迁移；若目标存在同路径文档，将中止切换并提示处理。</div>
    </div>
  </div>
  <div class="el-settings__section" data-role="category-editor">
    <div class="el-settings__title">类目</div>
    <div data-role="cat-list"></div>
    <div class="fn__flex" style="gap:6px;margin-top:10px">
      <input class="b3-text-field fn__flex-1" data-role="new-name" placeholder="新类目名称">
      <button class="b3-button b3-button--outline" data-role="add">添加</button>
    </div>
  </div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" data-role="cancel">取消</button>
  <div class="fn__space"></div>
  <button class="b3-button b3-button--text" data-role="save">保存</button>
</div>`
  });

  const notebookSel = dialog.element.querySelector('[data-role="notebook"]') as HTMLSelectElement;
  mountCategoryEditor(ctx, dialog.element.querySelector('[data-role="category-editor"]') as HTMLElement);
  void lsNotebooks()
    .then((books) => {
      notebookSel.innerHTML = books
        .map((b) => `<option value="${b.id}" ${store.data.settings.notebook === b.id ? "selected" : ""}>${esc(b.name)}</option>`)
        .join("");
    })
    .catch((err) => {
      notebookSel.innerHTML = '<option value="">获取失败</option>';
      showMessage(`获取笔记本失败：${(err as Error).message}`, 6000, "error");
    });

  (dialog.element.querySelector('[data-role="cancel"]') as HTMLElement).addEventListener("click", () => dialog.destroy());
  const saveButton = dialog.element.querySelector('[data-role="save"]') as HTMLButtonElement;
  let saving = false;
  const saveSettings = async () => {
    if (saving) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && dialog.element.contains(active)) active.blur();
    const targetNotebook = notebookSel.value;
    if (!targetNotebook) {
      showMessage("请选择默认笔记本", 3500, "info");
      return;
    }
    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = "迁移中…";
    try {
      const selectedNotebookName = notebookSel.selectedOptions[0]?.textContent ?? "";
      const result = await migrateChronicleDocuments(store, targetNotebook);
      store.updateSettings({
        notebook: targetNotebook,
        notebookCustomized: selectedNotebookName !== DEFAULT_NOTEBOOK_NAME,
        managedNotebooks: [targetNotebook]
      });
      dialog.destroy();
      const moved = result.movedTimeRoots + result.movedActivityDocs;
      if (moved) showMessage(`已迁移 ${moved} 组岁时记笔记`, 4000, "info");
    } catch (err) {
      saving = false;
      saveButton.disabled = false;
      saveButton.textContent = "保存";
      showMessage(`切换默认笔记本失败：${(err as Error).message}`, 7000, "error");
    }
  };
  saveButton.addEventListener("click", () => void saveSettings());
  settingsKeydown = (event) => {
    if (event.key !== "Enter" || event.isComposing || event.repeat || event.keyCode === 229) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    const ownContainer = dialog.element.matches(".b3-dialog__container")
      ? dialog.element
      : dialog.element.querySelector<HTMLElement>(".b3-dialog__container");
    const visibleDialogs = Array.from(document.querySelectorAll<HTMLElement>(".b3-dialog__container"))
      .filter((element) => element.getClientRects().length > 0);
    if (ownContainer && visibleDialogs.at(-1) !== ownContainer) return;
    if (target && dialog.element.contains(target) &&
      target.closest("textarea, button, a, input[type='color'], [contenteditable=true], [data-role='new-name']")) return;
    event.preventDefault();
    event.stopPropagation();
    void saveSettings();
  };
  document.addEventListener("keydown", settingsKeydown, true);
  requestAnimationFrame(() => saveButton.focus({ preventScroll: true }));
}
