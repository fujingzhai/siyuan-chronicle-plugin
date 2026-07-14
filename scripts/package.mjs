import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const output = resolve(root, "package.zip");

if (existsSync(output)) unlinkSync(output);
execFileSync("zip", ["-qr", output, "."], { cwd: dist, stdio: "inherit" });
console.log(`已生成 ${output}`);
