import { createDocWithMd, getIDsByHPath, moveDocsByID, querySQL } from "./api";
import { Store } from "./store";

interface DocRow {
  id: string;
  box: string;
  path: string;
  hpath: string;
  ial: string;
}

export interface DocumentMigrationResult {
  sources: number;
  movedTimeRoots: number;
  movedActivityDocs: number;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 核对活动绑定文档是否仍存在，只移除失效引用，绝不删除活动。
 */
export async function reconcileBoundEntries(store: Store): Promise<{ removedEntries: number; removedRefs: number; renamedRefs: number }> {
  const ids = Array.from(new Set(store.data.entries.flatMap((entry) => entry.docs.map((doc) => doc.id))));
  if (!ids.length) return { removedEntries: 0, removedRefs: 0, renamedRefs: 0 };

  const existing = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 128) {
    const chunk = ids.slice(offset, offset + 128);
    const rows = await querySQL<{ id: string; content: string }>(
      `SELECT id, content FROM blocks WHERE type = 'd' AND id IN (${chunk.map(sqlString).join(",")})`
    );
    rows.forEach((row) => existing.set(row.id, row.content));
  }
  return store.reconcileBoundDocs(existing);
}

function parentHPath(hpath: string): string {
  const index = hpath.lastIndexOf("/");
  return index <= 0 ? "/" : hpath.slice(0, index);
}

async function sourceDocs(notebook: string): Promise<DocRow[]> {
  return querySQL<DocRow>(
    `SELECT id, box, path, hpath, ial FROM blocks WHERE type = 'd' AND box = ${sqlString(notebook)} ` +
    `AND (ial LIKE '%custom-chronicle-time=%' OR ial LIKE '%custom-chronicle=%')`
  );
}

async function managedTimeRoots(notebook: string, rows: DocRow[]): Promise<DocRow[]> {
  const rootPaths = Array.from(new Set(rows
    .filter((row) => row.ial.includes("custom-chronicle-time="))
    .map((row) => row.hpath.match(/^\/\d{4}年/)?.[0])
    .filter((path): path is string => !!path)));
  const roots: DocRow[] = [];
  for (const hpath of rootPaths) {
    const found = await querySQL<DocRow>(
      `SELECT id, box, path, hpath, ial FROM blocks WHERE type = 'd' AND box = ${sqlString(notebook)} ` +
      `AND hpath = ${sqlString(hpath)} LIMIT 1`
    );
    if (found[0]) roots.push(found[0]);
  }
  return roots;
}

/**
 * 把岁时记管理的文档从旧默认笔记本迁到新默认笔记本。
 * - 只有带 custom-chronicle-time 标记的时间笔记树才会移动；
 * - 活动中创建的笔记依赖 custom-chronicle 属性识别，并保留原父级路径；
 * - 用户从其他笔记本绑定的既有文档没有上述标记，绝不参与迁移；
 * - 目标同路径已存在时在任何移动前中止，避免静默重名或覆盖。
 */
export async function migrateChronicleDocuments(
  store: Store,
  targetNotebook: string,
  sourceNotebookIds?: string[]
): Promise<DocumentMigrationResult> {
  const configuredSources = sourceNotebookIds ?? [
    ...(store.data.settings.managedNotebooks ?? []),
    store.data.settings.notebook
  ];
  const sources = Array.from(new Set(configuredSources.filter((id) => id && id !== targetNotebook)));
  const batches: Array<{ timeRoots: DocRow[]; activityDocs: DocRow[] }> = [];

  for (const source of sources) {
    const rows = await sourceDocs(source);
    const timeRoots = await managedTimeRoots(source, rows);
    const activityDocs = rows.filter((row) =>
      row.ial.includes("custom-chronicle=") &&
      !timeRoots.some((root) => row.hpath === root.hpath || row.hpath.startsWith(`${root.hpath}/`))
    );
    batches.push({ timeRoots, activityDocs });
  }

  // 先完成全部冲突检查，保证不会迁到一半才发现目标重名。
  for (const batch of batches) {
    for (const row of [...batch.timeRoots, ...batch.activityDocs]) {
      const existing = await getIDsByHPath(targetNotebook, row.hpath);
      if (existing.length) {
        throw new Error(`目标笔记本已存在「${row.hpath}」，未执行迁移`);
      }
    }
  }

  let movedTimeRoots = 0;
  let movedActivityDocs = 0;
  for (const batch of batches) {
    if (batch.timeRoots.length) {
      await moveDocsByID(batch.timeRoots.map((row) => row.id), targetNotebook);
      movedTimeRoots += batch.timeRoots.length;
    }
    for (const row of batch.activityDocs) {
      const parent = parentHPath(row.hpath);
      const targetParent = parent === "/" ? targetNotebook : await createDocWithMd(targetNotebook, parent, "");
      await moveDocsByID([row.id], targetParent);
      movedActivityDocs++;
    }
  }

  return { sources: sources.length, movedTimeRoots, movedActivityDocs };
}
