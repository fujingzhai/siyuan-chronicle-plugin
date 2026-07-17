import { defaultDateOfYear, renderDatePanel } from "./datepanel";
import { Ctx, openEntryDialog, openSettingsDialog } from "./dialogs";
import { refreshTimeDocs, renderTimeline } from "./timeline";
import { currentPeriod, periodKey, toISODate, weekMonth } from "./time";
import { PeriodRef } from "./types";

export class ChronicleApp {
  private timeYear = new Date().getFullYear();
  private view: "time" | "date" = "time";
  private pendingDateLocate: string | null = null;
  private unsub: (() => void) | null = null;
  private body!: HTMLElement;
  private main: HTMLElement | null = null;
  private pendingLocate: PeriodRef | null = null;
  private locateObserver: ResizeObserver | null = null;
  private locateRaf = 0;
  private timeDocTimer = 0;
  private locked = false;
  private lockscreen: HTMLElement | null = null;

  constructor(private root: HTMLElement, private ctx: Ctx) {}

  mount(): void {
    this.root.classList.add("el-root");
    this.root.tabIndex = -1;
    this.root.innerHTML = "";
    this.body = document.createElement("div");
    this.body.className = "el-bodyhost";
    this.root.appendChild(this.body);
    // 快捷键只在岁时记可见、且不处于任何编辑状态时生效。
    document.addEventListener("keydown", this.onKeydown, true);
    this.root.addEventListener("pointerdown", this.focusPanel);
    this.unsub = this.ctx.store.subscribe(() => this.render());
    this.timeDocTimer = window.setInterval(() => this.refreshDocuments(), 5000);
    const todayWeek = currentPeriod("week");
    this.timeYear = todayWeek.year;
    this.pendingLocate = todayWeek;
    this.render();
    requestAnimationFrame(() => this.root.focus({ preventScroll: true }));
  }

  destroy(): void {
    this.unsub?.();
    this.unsub = null;
    document.removeEventListener("keydown", this.onKeydown, true);
    this.root.removeEventListener("pointerdown", this.focusPanel);
    window.clearInterval(this.timeDocTimer);
    this.cancelLocate();
    this.lockscreen?.remove();
    this.lockscreen = null;
    this.root.classList.remove("el-root--locked");
  }

  private focusPanel = (event: PointerEvent): void => {
    const target = event.target as HTMLElement;
    if (!target.closest("input, textarea, select, [contenteditable=true]")) {
      this.root.focus({ preventScroll: true });
    }
  };

  private onKeydown = (event: KeyboardEvent): void => {
    if (!this.root.isConnected || this.root.offsetParent === null) return;
    const target = event.target as HTMLElement;
    const editorSelector = "input, textarea, select, [contenteditable=true], .b3-dialog";
    if (document.querySelector(".b3-dialog")) return;
    if (target.closest(editorSelector) || (document.activeElement as HTMLElement | null)?.closest(editorSelector)) return;

    // 只要岁时记是当前可见面板就响应，不再要求焦点必须落在面板根节点。
    // 输入框、正文编辑区和活动/设置对话框仍在上方被严格排除。

    const key = event.key.toLowerCase();
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

    if (key === "l") {
      if (event.repeat) return;
      event.preventDefault();
      this.toggleLock();
      return;
    }
    if (this.locked) return;

    if (key === "t") {
      event.preventDefault();
      this.locateToday();
    } else if (key === "n") {
      event.preventDefault();
      if (this.view === "date") {
        openEntryDialog(this.ctx, { dayMode: true, presetDate: defaultDateOfYear(this.timeYear) });
      } else {
        openEntryDialog(this.ctx, { presetPeriod: currentPeriod("week") });
      }
    } else if (key === "s") {
      event.preventDefault();
      openSettingsDialog(this.ctx);
    } else if (key === "d") {
      event.preventDefault();
      this.setView("date");
    } else if (key === "w") {
      event.preventDefault();
      this.setView("time");
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      this.changeTimeYear(event.key === "ArrowLeft" ? -1 : 1);
    }
  };

  private setView(view: "time" | "date"): void {
    if (this.view === view) return;
    this.view = view;
    this.main = null;
    const todayWeek = currentPeriod("week");
    if (view === "date") {
      this.pendingDateLocate = this.timeYear === new Date().getFullYear() ? toISODate(new Date()) : null;
    } else {
      this.pendingLocate = this.timeYear === todayWeek.year ? todayWeek : null;
    }
    this.render();
  }

  /** 临时 UI 锁：只存在于当前面板实例，不写入设置，解锁后保留原视图状态。 */
  private toggleLock = (): void => {
    this.locked = !this.locked;
    this.root.classList.toggle("el-root--locked", this.locked);
    this.body.setAttribute("aria-hidden", this.locked ? "true" : "false");

    if (this.locked) {
      const lockscreen = document.createElement("div");
      lockscreen.className = "el-lockscreen";
      lockscreen.setAttribute("role", "status");
      lockscreen.innerHTML = `
        <svg class="el-lockscreen__icon" aria-hidden="true"><use xlink:href="#iconLock"></use></svg>
        <div class="el-lockscreen__title">面板已锁定</div>
        <div class="el-lockscreen__hint">按 L 或点击下方按钮解锁</div>
        <button type="button" class="el-lockscreen__button">
          <svg aria-hidden="true"><use xlink:href="#iconUnlock"></use></svg>
          解锁面板
        </button>`;
      lockscreen.querySelector("button")!.addEventListener("click", this.toggleLock);
      this.root.appendChild(lockscreen);
      this.lockscreen = lockscreen;
      requestAnimationFrame(() => lockscreen.querySelector("button")?.focus({ preventScroll: true }));
      return;
    }

    this.lockscreen?.remove();
    this.lockscreen = null;
    requestAnimationFrame(() => this.root.focus({ preventScroll: true }));
  };

  private changeTimeYear(delta: number): void {
    this.timeYear += delta;
    const todayWeek = currentPeriod("week");
    this.pendingLocate = this.timeYear === todayWeek.year ? todayWeek : null;
    this.pendingDateLocate = this.timeYear === new Date().getFullYear() ? toISODate(new Date()) : null;
    this.main = null;
    this.render();
  }

  refreshDocuments(): void {
    if (!this.root.isConnected || this.root.offsetParent === null) return;
    const container = this.root.querySelector<HTMLElement>(".el-timewrap");
    if (container) void refreshTimeDocs(container, this.ctx, this.timeYear);
  }

  private locateToday(): void {
    const todayWeek = currentPeriod("week");
    this.timeYear = todayWeek.year;
    this.pendingLocate = todayWeek;
    this.pendingDateLocate = toISODate(new Date());
    this.render();
  }

  private cancelLocate(): void {
    this.locateObserver?.disconnect();
    this.locateObserver = null;
    if (this.locateRaf) window.cancelAnimationFrame(this.locateRaf);
    this.locateRaf = 0;
  }

  /** 面板首次打开时可能尚未显形；等周列真正取得尺寸后再定位。 */
  private scheduleLocate(timeWrap: HTMLElement, period: PeriodRef): void {
    this.cancelLocate();
    const main = this.main;
    if (!main) return;

    let done = false;
    const locate = () => {
      if (done || this.main !== main || !main.isConnected) return;
      const cell = timeWrap.querySelector<HTMLElement>(`[data-key="${periodKey(period)}"]`);
      if (!cell || main.clientHeight <= 0 || cell.offsetHeight <= 0) return;

      if (period.unit === "week") {
        const month: PeriodRef = { unit: "month", year: period.year, num: weekMonth(period.year, period.num) };
        const monthCell = timeWrap.querySelector<HTMLElement>(`[data-key="${periodKey(month)}"]`);
        const wanted = cell.offsetTop - (monthCell?.offsetTop ?? (main.clientHeight - cell.offsetHeight) / 2);
        main.scrollTop = Math.max(0, Math.min(wanted, main.scrollHeight - main.clientHeight));
      }

      done = true;
      this.pendingLocate = null;
      this.locateObserver?.disconnect();
      this.locateObserver = null;
      cell.classList.add("el-flash");
      window.setTimeout(() => cell.classList.remove("el-flash"), 1200);
    };

    this.locateObserver = new ResizeObserver(locate);
    this.locateObserver.observe(main);
    this.locateRaf = window.requestAnimationFrame(() => {
      this.locateRaf = 0;
      locate();
    });
  }

  private render(): void {
    const prevScroll = this.main?.scrollTop ?? 0;
    this.cancelLocate();
    this.body.innerHTML = "";

    const layout = document.createElement("div");
    layout.className = "el-body";
    const wrap = document.createElement("div");
    layout.appendChild(wrap);
    this.body.appendChild(layout);
    const handles = {
      changeYear: (delta: number) => this.changeTimeYear(delta),
      openSettings: () => openSettingsDialog(this.ctx),
      toggleLock: this.toggleLock,
      toggleView: () => this.setView(this.view === "time" ? "date" : "time")
    };

    if (this.view === "date") {
      renderDatePanel(wrap, this.ctx, this.timeYear, handles);
      this.main = wrap.querySelector<HTMLElement>(".el-dmonths");
      if (this.pendingDateLocate) {
        this.scheduleDateLocate(wrap, this.pendingDateLocate);
      } else if (this.main) {
        this.main.scrollTop = prevScroll;
      }
      return;
    }

    renderTimeline(wrap, this.ctx, this.timeYear, handles);
    this.main = wrap.querySelector<HTMLElement>(".el-weeks");

    if (this.pendingLocate) {
      this.scheduleLocate(wrap, this.pendingLocate);
    } else if (this.main) {
      this.main.scrollTop = prevScroll;
    }
  }

  /** 日期视图定位到今天：滚动到当月并闪烁当天格子 */
  private scheduleDateLocate(wrap: HTMLElement, iso: string): void {
    this.locateRaf = window.requestAnimationFrame(() => {
      this.locateRaf = 0;
      const cell = wrap.querySelector<HTMLElement>(`[data-date="${iso}"]`);
      const month = cell?.closest<HTMLElement>(".el-dmonth");
      if (!cell || !month || !this.main) return;
      const wanted = month.offsetTop - Math.max(0, (this.main.clientHeight - month.offsetHeight) / 2);
      this.main.scrollTop = Math.max(0, Math.min(wanted, this.main.scrollHeight - this.main.clientHeight));
      this.pendingDateLocate = null;
      cell.classList.add("el-flash");
      window.setTimeout(() => cell.classList.remove("el-flash"), 1200);
    });
  }

}
