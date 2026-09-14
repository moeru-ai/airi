import { RuleTester } from "oxlint/plugins-dev";

import { requireReadableSpacingRule } from "./require-readable-spacing.ts";
import createPaddingLineRule from "../vendor/eslint-stylistic/padding-line-between-statements.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "expectedBlankLine" };

tester.run("anti-slop/require-readable-spacing", requireReadableSpacingRule, {
  valid: [
    "import { a } from 'a';\nimport { b } from 'b';\n\nexport const c = a + b;",
    "function f() {\nconst a = 1;\nconst b = 2;\n\nreturn a + b;\n}",
    "function f() { return 1; }",
    "function f(a: string): string;\nfunction f(a: number): number;\nfunction f(a: string | number) { return a; }",
    "export function f(a: string): string;\nexport function f(a: number): number;\nexport function f(a: string | number) { return a; }",
    "const f = Effect.gen(function* () {\nconst a = yield* A;\nconst b = yield* B;\n\nreturn a + b;\n});",
    "export type A = string;\n\n/** B documentation. */\nexport type B = number;",
    "function f() { if (ok) { go(); } else { stop(); } }",
    "function f() {\n// return docs\nreturn 1;\n}",
    "const a = 1;\n\n\nconst b = 2;",
    "switch (x) { case 1: case 2: go(); break; default: stop(); }",
  ],
  invalid: [
    { code: "const a = 1;\nconst b = 2;", output: "const a = 1;\n\nconst b = 2;", errors: [error] },
    {
      code: "export const a = 1;\n/** B docs. */\nexport type B = number;",
      output: "export const a = 1;\n\n/** B docs. */\nexport type B = number;",
      errors: [error],
    },
    {
      code: "const a = 1; // trailing\n// leading\nconst b = 2;",
      output: "const a = 1; // trailing\n\n// leading\nconst b = 2;",
      errors: [error],
    },
    { code: "const a = 1; const b = 2;", output: "const a = 1;\n\n const b = 2;", errors: [error] },
    {
      code: "import { a } from 'a';\nconst b = a;",
      output: "import { a } from 'a';\n\nconst b = a;",
      errors: [error],
    },
    {
      code: "function f() {\nconst a = 1;\nreturn a;\n}",
      output: "function f() {\nconst a = 1;\n\nreturn a;\n}",
      errors: [error],
    },
    {
      code: "function f() {\nconst a = 1;\nif (a) go();\n}",
      output: "function f() {\nconst a = 1;\n\nif (a) go();\n}",
      errors: [error],
    },
    {
      code: "function f() {\nif (ok) { go(); }\nstop();\n}",
      output: "function f() {\nif (ok) { go(); }\n\nstop();\n}",
      errors: [error],
    },
    {
      code: "const f = Effect.gen(function* () {\nconst a = yield* A;\nconst b = yield* B;\nconst dispatch = Effect.fn('dispatch')(function* () {\nyield* a;\n});\nreturn dispatch;\n});",
      output:
        "const f = Effect.gen(function* () {\nconst a = yield* A;\nconst b = yield* B;\n\nconst dispatch = Effect.fn('dispatch')(function* () {\nyield* a;\n});\n\nreturn dispatch;\n});",
      errors: [error, error],
    },
    {
      code: "export interface A {}\nexport class B {}",
      output: "export interface A {}\n\nexport class B {}",
      errors: [error],
    },
    {
      code: "const a = 1\n;[1].forEach(f)",
      output: "const a = 1\n\n;[1].forEach(f)",
      errors: [error],
    },
    {
      code: "function f() {\nfoo();\nwhile (ok) go();\n}",
      output: "function f() {\nfoo();\n\nwhile (ok) go();\n}",
      errors: [error],
    },
  ],
});

// Exercise upstream options that the opinionated public rule does not enable.
tester.run(
  "vendored padding removal",
  createPaddingLineRule([{ blankLine: "never", prev: "*", next: "*" }]),
  {
    valid: ["foo();\nbar();"],
    invalid: [
      {
        code: "foo();\n\nbar();",
        output: "foo();\nbar();",
        errors: [{ messageId: "unexpectedBlankLine" }],
      },
      {
        code: "foo();\n\n// comment\n\nbar();",
        output: null,
        errors: [{ messageId: "unexpectedBlankLine" }],
      },
    ],
  },
);
