/// <reference types="node" />

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const probeRoot = mkdtempSync(join(tmpdir(), "anti-slop-spacing-"));
const config = join(probeRoot, "oxlint.json");
const first = join(probeRoot, "first.ts");
const second = join(probeRoot, "second.ts");

function runSpacingLint(...args: string[]) {
  const result = spawnSync("pnpm", ["exec", "oxlint", "--config", config, ...args], {
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

try {
  writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [
        { name: "anti-slop", specifier: fileURLToPath(new URL("../index.ts", import.meta.url)) },
      ],
      rules: { "anti-slop/require-readable-spacing": "error" },
    }),
  );
  writeFileSync(first, "export const a = 1;\n/** Attached to b. */\nexport const b = 2;\n");
  writeFileSync(second, "export function f() {\nconst a = 1;\nconst b = 2;\nreturn a + b;\n}\n");

  const rejected = runSpacingLint(first, second);
  assert.equal(rejected.status, 1, rejected.output);
  assert.match(rejected.output, /require-readable-spacing/);

  const fixed = runSpacingLint("--fix", first, second);
  assert.equal(fixed.status, 0, fixed.output);
  assert.equal(
    readFileSync(first, "utf8"),
    "export const a = 1;\n\n/** Attached to b. */\nexport const b = 2;\n",
  );
  assert.equal(
    readFileSync(second, "utf8"),
    "export function f() {\nconst a = 1;\nconst b = 2;\n\nreturn a + b;\n}\n",
  );

  const stable = [readFileSync(first, "utf8"), readFileSync(second, "utf8")];
  const clean = runSpacingLint(first, second);
  assert.equal(clean.status, 0, clean.output);
  const repeated = runSpacingLint("--fix", first, second);
  assert.equal(repeated.status, 0, repeated.output);
  assert.deepEqual([readFileSync(first, "utf8"), readFileSync(second, "utf8")], stable);
} finally {
  rmSync(probeRoot, { recursive: true, force: true });
}
