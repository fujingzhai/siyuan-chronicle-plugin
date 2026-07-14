import { Plugin, openTab, showMessage } from "siyuan";
import { ChronicleApp } from "./app";
import { resolveNotebook } from "./dialogs";
import { migrateChronicleDocuments, reconcileBoundEntries } from "./documents";
import { Store } from "./store";
import "./style.css";

const TAB_TYPE = "chronicle_tab";

const ICONS = `
<symbol id="iconChronicle" viewBox="0 0 32 32">
  <path d="M16 2C8.28 2 2 8.28 2 16s6.28 14 14 14 14-6.28 14-14S23.72 2 16 2zm0 25.2C9.83 27.2 4.8 22.17 4.8 16S9.83 4.8 16 4.8 27.2 9.83 27.2 16 22.17 27.2 16 27.2zm6.6-19-9.1 4.55L8.95 22.3l9.1-4.55L22.6 8.2zM16 17.8c-.99 0-1.8-.81-1.8-1.8s.81-1.8 1.8-1.8 1.8.81 1.8 1.8-.81 1.8-1.8 1.8z"/>
</symbol>`;

export default class ChroniclePlugin extends Plugin {
  store!: Store;
  private docSyncTimer = 0;
  private docSyncDebounce = 0;
  private docSyncRunning = false;
  private apps = new Set<ChronicleApp>();

  private reconcileDocuments = async (): Promise<void> => {
    if (this.docSyncRunning) return;
    this.docSyncRunning = true;
    try {
      await reconcileBoundEntries(this.store);
      this.apps.forEach((app) => app.refreshDocuments());
    } catch {
      // 临时数据库不可用时交给下一次 ws 通知或定时核对重试。
    } finally {
      this.docSyncRunning = false;
    }
  };

  private scheduleDocumentReconcile = (): void => {
    window.clearTimeout(this.docSyncDebounce);
    this.docSyncDebounce = window.setTimeout(() => void this.reconcileDocuments(), 500);
  };

  async onload(): Promise<void> {
    this.store = new Store(this);
    await this.store.load();
    await resolveNotebook(this.store).catch((err) => {
      showMessage(`创建默认笔记本失败：${(err as Error).message}`, 7000, "error");
    });
    this.addIcons(ICONS);
    this.eventBus.on("ws-main", this.scheduleDocumentReconcile);
    this.docSyncTimer = window.setInterval(() => void this.reconcileDocuments(), 5000);
    void this.reconcileDocuments();

    // 兼容用户已经改过默认笔记本、但旧版本没有迁移文档的情况。
    const targetNotebook = this.store.data.settings.notebook;
    const pendingSources = (this.store.data.settings.managedNotebooks ?? [])
      .filter((id) => id && id !== targetNotebook);
    if (targetNotebook && pendingSources.length) {
      void migrateChronicleDocuments(this.store, targetNotebook, pendingSources)
        .then((result) => {
          this.store.updateSettings({ managedNotebooks: [targetNotebook] });
          const moved = result.movedTimeRoots + result.movedActivityDocs;
          if (moved) showMessage(`岁时记已自动迁移 ${moved} 组笔记`, 4500, "info");
        })
        .catch((err) => showMessage(`岁时记旧笔记迁移未完成：${(err as Error).message}`, 7000, "error"));
    }

    const plugin = this;
    this.addTab({
      type: TAB_TYPE,
      init() {
        const app = new ChronicleApp(this.element as HTMLElement, { app: plugin.app, store: plugin.store });
        (this as unknown as { chronicleApp: ChronicleApp }).chronicleApp = app;
        plugin.apps.add(app);
        app.mount();
      },
      destroy() {
        const app = (this as unknown as { chronicleApp?: ChronicleApp }).chronicleApp;
        if (app) plugin.apps.delete(app);
        app?.destroy();
      }
    });

    this.addTopBar({
      icon: "iconChronicle",
      title: "岁时记",
      position: "right",
      callback: () => this.openPanel()
    });

    this.addCommand({
      langKey: "openPanel",
      hotkey: "",
      callback: () => this.openPanel()
    });
  }

  onunload(): void {
    this.eventBus.off("ws-main", this.scheduleDocumentReconcile);
    window.clearInterval(this.docSyncTimer);
    window.clearTimeout(this.docSyncDebounce);
    this.apps.clear();
  }

  openPanel(): void {
    openTab({
      app: this.app,
      custom: {
        icon: "iconChronicle",
        title: "岁时记",
        id: this.name + TAB_TYPE
      }
    });
  }
}
