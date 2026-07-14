import { cpSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dataDir = process.env.SIYUAN_DATA_DIR || resolve(homedir(), "SiYuan/data");
const backupRoot = resolve(homedir(), "AI-Space/.tmp/siyuan-chronicle-plugin/install-backups");
const target = resolve(dataDir, "plugins/siyuan-chronicle-plugin");

mkdirSync(backupRoot, { recursive: true });
mkdirSync(resolve(target, ".."), { recursive: true });

if (existsSync(target)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  renameSync(target, resolve(backupRoot, `siyuan-chronicle-plugin-${stamp}`));
}

cpSync(resolve(root, "dist"), target, { recursive: true });
console.log(`已安装 siyuan-chronicle-plugin 到 ${target}`);
