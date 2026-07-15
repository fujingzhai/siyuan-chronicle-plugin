import type { Plugin } from "siyuan";
import { Category, DEFAULT_TIME_COLS, Entry, LedgerData, PeriodRef, Settings } from "./types";
import { periodStart, samePeriod, shiftDatesToPeriod } from "./time";

const FILE = "chronicle.json";
const BACKUP_FILE = "chronicle.backup.json";
const LEGACY_FILE_PATHS = [
  "/data/storage/petal/chronicle/chronicle.json",
  "/data/storage/petal/explore-ledger/explore-ledger.json"
];

export const PALETTE = [
  "#d1495b", "#2f80ed", "#2e9d68", "#9b51e0",
  "#e07a1f", "#008b95", "#c33c9b", "#6c63d9",
  "#a66a35", "#6f8f2f", "#d06086", "#52606d"
];

function emptyData(): LedgerData {
  return {
    version: 4,
    categories: [],
    entries: [],
    settings: {
      notebook: "",
      notebookCustomized: false,
      managedNotebooks: [],
      cols: { ...DEFAULT_TIME_COLS },
      colsCustomized: false,
      hiddenYears: []
    }
  };
}

async function loadLegacyData(): Promise<unknown> {
  for (const path of LEGACY_FILE_PATHS) {
    try {
      const response = await fetch("/api/file/getFile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path })
      });
      if (!response.ok) continue;
      const raw = await response.json();
      if (raw && typeof raw === "object" && Array.isArray(raw.entries)) return raw;
    } catch {
      // 继续尝试更早的插件 id。
    }
  }
  return null;
}

function validData(raw: unknown): raw is Partial<LedgerData> & { entries: Entry[] } {
  return !!raw && typeof raw === "object" && Array.isArray((raw as { entries?: unknown }).entries);
}

function snapshot(data: LedgerData): LedgerData {
  return JSON.parse(JSON.stringify(data)) as LedgerData;
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class Store {
  data: LedgerData = emptyData();
  private listeners = new Set<() => void>();
  private persistQueue: Promise<void> = Promise.resolve();
  private lastSaved: LedgerData | null = null;

  constructor(private plugin: Plugin) {}

  async load(): Promise<void> {
    const currentRaw = await this.plugin.loadData(FILE);
    const backupRaw = await this.plugin.loadData(BACKUP_FILE);
    const legacyRaw = await loadLegacyData();
    let raw: unknown = validData(currentRaw) ? currentRaw : validData(backupRaw) ? backupRaw : legacyRaw;
    let migratedFromLegacyId = false;
    const recoveredFromBackup = !validData(currentRaw) && validData(backupRaw);
    migratedFromLegacyId = !validData(currentRaw) && !validData(backupRaw) && validData(legacyRaw);
    if (validData(raw)) {
      const oldVersion = Number(raw.version || 1);
      const settings = { ...emptyData().settings, ...(raw.settings || {}) };
      // 0.1.0 保存过一组实验性列宽；升级时统一切换到这一版的新默认值。
      if (oldVersion < 2) settings.cols = { ...DEFAULT_TIME_COLS };
      settings.hiddenYears = Array.isArray(settings.hiddenYears) ? settings.hiddenYears : [];
      const legacyNotebook = oldVersion < 3 && legacyRaw && typeof legacyRaw === "object"
        ? String((legacyRaw as { settings?: { notebook?: unknown } }).settings?.notebook || "")
        : "";
      settings.managedNotebooks = Array.from(new Set([
        ...(Array.isArray(settings.managedNotebooks) ? settings.managedNotebooks : []),
        legacyNotebook,
        settings.notebook
      ].filter(Boolean)));

      // 3.0 起移除活动图标；加载时也清掉旧数据，避免留下无效配置。
      const entries = (raw.entries as Array<Entry & { icon?: string }>).map((entry) => {
        const { icon: _icon, ...rest } = entry;
        return rest as Entry;
      });
      this.data = { ...emptyData(), ...raw, entries, version: 4, settings };
      this.lastSaved = snapshot(this.data);
      if (oldVersion < 4 || migratedFromLegacyId || recoveredFromBackup || legacyNotebook) {
        await this.plugin.saveData(FILE, this.data);
      }
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist(): Promise<void> {
    this.listeners.forEach((fn) => fn());
    const next = snapshot(this.data);
    this.persistQueue = this.persistQueue
      .catch(() => undefined)
      .then(async () => {
        const previous = this.lastSaved ? snapshot(this.lastSaved) : null;
        if (previous) await this.plugin.saveData(BACKUP_FILE, previous);
        await this.plugin.saveData(FILE, next);
        this.lastSaved = next;
      });
    return this.persistQueue;
  }

  // ---- 类目 ----

  addCategory(name: string, color: string): Category {
    const cat: Category = { id: genId(), name, color };
    this.data.categories.push(cat);
    void this.persist();
    return cat;
  }

  updateCategory(id: string, patch: Partial<Category>): void {
    const cat = this.data.categories.find((c) => c.id === id);
    if (!cat) return;
    Object.assign(cat, patch);
    void this.persist();
  }

  removeCategory(id: string): void {
    this.data.categories = this.data.categories.filter((c) => c.id !== id);
    for (const e of this.data.entries) {
      if (e.categoryId === id) e.categoryId = null;
    }
    void this.persist();
  }

  reorderCategories(orderedIds: string[]): void {
    const rank = new Map(orderedIds.map((id, index) => [id, index]));
    this.data.categories.sort((a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
    void this.persist();
  }

  categoryOf(id: string | null): Category | undefined {
    if (!id) return undefined;
    return this.data.categories.find((c) => c.id === id);
  }

  categoryRank(id: string | null): number {
    if (!id) return this.data.categories.length;
    const i = this.data.categories.findIndex((c) => c.id === id);
    return i < 0 ? this.data.categories.length : i;
  }

  // ---- 条目 ----

  upsertEntry(entry: Entry): void {
    const i = this.data.entries.findIndex((e) => e.id === entry.id);
    const previousPeriod = i >= 0 ? this.data.entries[i].period : null;
    entry.updated = Date.now();
    const enteringPeriod = !previousPeriod || !samePeriod(previousPeriod, entry.period);
    if (enteringPeriod && !Number.isFinite(entry.order)) {
      const peers = this.entriesFor(entry.period).filter((item) => item.id !== entry.id);
      peers.forEach((item, index) => { item.order = index; });
      entry.order = peers.length;
    }
    if (i >= 0) {
      this.data.entries[i] = entry;
      if (previousPeriod && !samePeriod(previousPeriod, entry.period)) {
        this.entriesFor(previousPeriod).forEach((item, index) => { item.order = index; });
      }
    } else {
      this.data.entries.push(entry);
    }
    void this.persist();
  }

  /**
   * 只更新既有活动的笔记绑定，不带入编辑对话框里尚未保存的其他字段。
   * “新建并绑定”会立即创建真实文档，因此绑定关系也应同步即时落盘。
   */
  updateEntryDocs(id: string, docs: Entry["docs"]): boolean {
    const entry = this.data.entries.find((item) => item.id === id);
    if (!entry) return false;
    const next = docs.map((doc) => ({ ...doc }));
    const unchanged = entry.docs.length === next.length && entry.docs.every((doc, index) =>
      doc.id === next[index]?.id && doc.title === next[index]?.title
    );
    if (unchanged) return true;
    entry.docs = next;
    entry.updated = Date.now();
    void this.persist();
    return true;
  }

  removeEntry(id: string): void {
    this.data.entries = this.data.entries.filter((e) => e.id !== id);
    void this.persist();
  }

  /** 清理已不存在的绑定文档。活动本身始终保留，笔记只是可选关联。 */
  reconcileBoundDocs(existingDocs: Map<string, string>): { removedEntries: number; removedRefs: number; renamedRefs: number } {
    let removedRefs = 0;
    let renamedRefs = 0;
    let changed = false;
    for (const entry of this.data.entries) {
      if (!entry.docs.length) continue;
      const validDocs = entry.docs.filter((doc) => existingDocs.has(doc.id));
      removedRefs += entry.docs.length - validDocs.length;
      let entryRenamed = false;
      for (const doc of validDocs) {
        const currentTitle = existingDocs.get(doc.id)?.trim();
        if (currentTitle && currentTitle !== doc.title) {
          doc.title = currentTitle;
          renamedRefs++;
          entryRenamed = true;
        }
      }
      if (validDocs.length !== entry.docs.length || entryRenamed) {
        entry.docs = validDocs;
        entry.updated = Date.now();
        changed = true;
      }
    }
    if (changed) void this.persist();
    return { removedEntries: 0, removedRefs, renamedRefs };
  }

  reorderEntries(period: PeriodRef, orderedIds: string[]): void {
    const rank = new Map(orderedIds.map((id, index) => [id, index]));
    for (const entry of this.data.entries) {
      if (!samePeriod(entry.period, period)) continue;
      const order = rank.get(entry.id);
      if (order !== undefined) entry.order = order;
    }
    void this.persist();
  }

  /** 把活动移入目标时间格，并按落点顺序重新编号。 */
  moveEntry(entryId: string, target: PeriodRef, orderedTargetIds: string[]): void {
    const entry = this.data.entries.find((item) => item.id === entryId);
    if (!entry) return;
    const source = { ...entry.period };
    const changedPeriod = !samePeriod(source, target);

    if (changedPeriod) {
      if (entry.dates) entry.dates = shiftDatesToPeriod(entry.dates, source, target);
      entry.period = { ...target };
      entry.updated = Date.now();

      const sourceEntries = this.entriesFor(source).filter((item) => item.id !== entryId);
      sourceEntries.forEach((item, index) => { item.order = index; });
    }

    const targetRank = new Map(orderedTargetIds.map((id, index) => [id, index]));
    const targetEntries = this.data.entries.filter((item) => samePeriod(item.period, target));
    targetEntries
      .sort((a, b) => (targetRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (targetRank.get(b.id) ?? Number.MAX_SAFE_INTEGER))
      .forEach((item, index) => { item.order = index; });
    void this.persist();
  }

  entriesFor(p: PeriodRef): Entry[] {
    const entries = this.data.entries.filter((e) => samePeriod(e.period, p));
    const manuallyOrdered = entries.some((entry) => Number.isFinite(entry.order));
    return entries.sort((a, b) => manuallyOrdered
      ? (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.created - b.created
      : a.created - b.created);
  }

  entriesOfCategory(categoryId: string | null): Entry[] {
    return this.data.entries
      .filter((e) => e.categoryId === categoryId)
      .sort((a, b) => periodStart(b.period) - periodStart(a.period) || b.created - a.created);
  }

  /** 台账里出现过的所有年份（含当前年） */
  yearsSpanned(): number[] {
    const now = new Date().getFullYear();
    let min = now;
    let max = now;
    for (const e of this.data.entries) {
      min = Math.min(min, e.period.year);
      max = Math.max(max, e.period.year);
    }
    const years: number[] = [];
    for (let y = min; y <= max; y++) years.push(y);
    return years;
  }

  updateSettings(patch: Partial<Settings>): void {
    Object.assign(this.data.settings, patch);
    void this.persist();
  }
}
