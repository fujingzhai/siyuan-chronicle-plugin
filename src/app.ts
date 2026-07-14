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
    this.pendingLocate = null;
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

  private render(): void {
    const prevScroll = this.main?.scrollTop ?? 0;
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
      const period = this.pendingLocate;
      this.pendingLocate = null;
      requestAnimationFrame(() => {
        const cell = timeWrap.querySelector<HTMLElement>(`[data-key="${periodKey(period)}"]`);
        if (!cell || !this.main) return;
        if (period.unit === "week") {
          const month: PeriodRef = { unit: "month", year: period.year, num: weekMonth(period.year, period.num) };
          const monthCell = timeWrap.querySelector<HTMLElement>(`[data-key="${periodKey(month)}"]`);
          const wanted = cell.offsetTop - (monthCell?.offsetTop ?? 0);
          this.main.scrollTop = Math.max(0, Math.min(wanted, this.main.scrollHeight - this.main.clientHeight));
        }
        cell.classList.add("el-flash");
        setTimeout(() => cell.classList.remove("el-flash"), 1200);
      });
    } else if (this.main) {
      this.main.scrollTop = prevScroll;
    }
  }

}
