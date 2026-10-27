import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { build } from "esbuild";

const ROOT = join(import.meta.dirname, "..");
const TEST_DIR = join(ROOT, "test");
const OUT_DIR = join(ROOT, "dist", "test");

function* walk(dir) {
   for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
         yield* walk(full);
      } else if (name.endsWith(".test.ts")) {
         yield full;
      }
   }
}

function builtPathFor(testFile) {
   const relativePath = relative(TEST_DIR, testFile);
   const jsPath = relativePath.replace(/\.ts$/, ".js");
   return join(OUT_DIR, jsPath);
}

const entryPoints = Array.from(walk(TEST_DIR));
if (entryPoints.length === 0) {
   console.error("no test files found under test/");
   process.exit(1);
}

rmSync(OUT_DIR, { recursive: true, force: true });

await build({
   entryPoints,
   bundle: true,
   platform: "node",
   format: "cjs",
   target: "node22",
   outdir: OUT_DIR,
   outbase: TEST_DIR,
   absWorkingDir: ROOT,
   mainFields: ["module", "main"],
   alias: { vscode: "./test/stubs/vscode.ts" },
   external: [],
   sourcemap: "inline",
   logLevel: "error",
});

const builtFiles = entryPoints.map(builtPathFor);
const nodeArgs = ["--test", "--enable-source-maps", ...builtFiles];
const child = spawnSync(process.execPath, nodeArgs, { stdio: "inherit" });
const exitCode = child.status === null ? 1 : child.status;
process.exit(exitCode);
