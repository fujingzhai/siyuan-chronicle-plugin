import { App, fetchPost, openTab } from "siyuan";

function kernel<T>(url: string, data: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    fetchPost(url, data, (res) => {
      if (res.code === 0) {
        resolve(res.data as T);
      } else {
        reject(new Error(res.msg || `${url} 调用失败`));
      }
    });
  });
}

export interface NotebookInfo {
  id: string;
  name: string;
  closed: boolean;
}

export async function lsNotebooks(): Promise<NotebookInfo[]> {
  const data = await kernel<{ notebooks: NotebookInfo[] }>("/api/notebook/lsNotebooks", {});
  return (data.notebooks || []).filter((n) => !n.closed);
}

export async function createNotebook(name: string): Promise<NotebookInfo> {
  const data = await kernel<{ notebook: NotebookInfo }>("/api/notebook/createNotebook", { name });
  return data.notebook;
}

export interface DocSearchResult {
  id: string;
  title: string;
  hPath: string;
  box: string;
}

export async function searchDocs(keyword: string): Promise<DocSearchResult[]> {
  const rows = await kernel<Array<{ box: string; hPath: string; path: string }>>(
    "/api/filetree/searchDocs",
    { k: keyword }
  );
  return (rows || [])
    .filter((r) => r.path && r.path.endsWith(".sy"))
    .map((r) => {
      const segs = r.path.split("/");
      const id = segs[segs.length - 1].replace(/\.sy$/, "");
      const hSegs = r.hPath.split("/").filter(Boolean);
      return { id, title: hSegs[hSegs.length - 1] || r.hPath, hPath: r.hPath, box: r.box };
    });
}

export async function createDocWithMd(notebook: string, path: string, markdown: string): Promise<string> {
  return kernel<string>("/api/filetree/createDocWithMd", { notebook, path, markdown });
}

/** 按人类可读路径查询文档 id（不存在则返回空数组） */
export async function getIDsByHPath(notebook: string, path: string): Promise<string[]> {
  const ids = await kernel<string[]>("/api/filetree/getIDsByHPath", { notebook, path });
  return ids || [];
}

export async function querySQL<T = Record<string, unknown>>(stmt: string): Promise<T[]> {
  const rows = await kernel<T[]>("/api/query/sql", { stmt });
  return rows || [];
}

export async function setBlockAttrs(id: string, attrs: Record<string, string>): Promise<void> {
  await kernel("/api/attr/setBlockAttrs", { id, attrs });
}

/** 把文档移动到目标父文档或目标笔记本根目录。 */
export async function moveDocsByID(fromIDs: string[], toID: string): Promise<void> {
  if (!fromIDs.length) return;
  await kernel("/api/filetree/moveDocsByID", { fromIDs, toID });
}

/** 删除文档或内容块。文档 id 传入此接口时会删除整篇文档。 */
export async function deleteBlock(id: string): Promise<void> {
  await kernel("/api/block/deleteBlock", { id });
}

export function openDoc(app: App, id: string): void {
  openTab({ app, doc: { id } });
}
