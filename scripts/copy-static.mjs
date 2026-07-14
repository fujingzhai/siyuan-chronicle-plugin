import { copyFileSync, existsSync, mkdirSync, cpSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

mkdirSync(dist, { recursive: true });

for (const file of ["plugin.json", "README.md", "README_zh_CN.md", "CHANGELOG.md", "LICENSE", "icon.png", "preview.png"]) {
  const source = resolve(root, file);
  if (existsSync(source)) {
    copyFileSync(source, resolve(dist, file));
  }
}

const i18n = resolve(root, "i18n");
if (existsSync(i18n)) {
  cpSync(i18n, resolve(dist, "i18n"), { recursive: true });
}
