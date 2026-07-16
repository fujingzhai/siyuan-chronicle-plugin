import { Ctx, openEntryDialog, openSettingsDialog } from "./dialogs";
import { refreshTimeDocs, renderTimeline } from "./timeline";
import { currentPeriod, periodKey, weekMonth } from "./time";
import { PeriodRef } from "./types";

export class ChronicleApp {
  private timeYear = new Date().getFullYear();
  private unsub: (() => void) | null = null;
  private body!: HTMLElement;
  private main: HTMLElement | null = null;
  private pendingLocate: PeriodRef | null = null;
  private locateObserver: ResizeObserver | null = null;
  private locateRaf = 0;
  private timeDocTimer = 0;

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

    if (key === "t") {
      event.preventDefault();
      this.locateToday();
    } else if (key === "n") {
      event.preventDefault();
      openEntryDialog(this.ctx, { presetPeriod: currentPeriod("week") });
    } else if (key === "s") {
      event.preventDefault();
      openSettingsDialog(this.ctx);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      this.changeTimeYear(event.key === "ArrowLeft" ? -1 : 1);
    }
  };

  private changeTimeYear(delta: number): void {
    this.timeYear += delta;
    const todayWeek = currentPeriod("week");
    this.pendingLocate = this.timeYear === todayWeek.year ? todayWeek : null;
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
    const timeWrap = document.createElement("div");
    layout.appendChild(timeWrap);
    this.body.appendChild(layout);
    renderTimeline(timeWrap, this.ctx, this.timeYear, {
      changeYear: (delta) => this.changeTimeYear(delta),
      openSettings: () => openSettingsDialog(this.ctx)
    });
    this.main = timeWrap.querySelector<HTMLElement>(".el-weeks");

    if (this.pendingLocate) {
      this.scheduleLocate(timeWrap, this.pendingLocate);
    } else if (this.main) {
      this.main.scrollTop = prevScroll;
    }
  }

}
