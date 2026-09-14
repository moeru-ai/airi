import { RuleTester } from "oxlint/plugins-dev";

import { requireSafetyCommentForTypeAssertionRule } from "./require-safety-comment-for-type-assertion.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "missingSafetyComment" };

tester.run(
  "anti-slop/require-safety-comment-for-type-assertion (custom markers)",
  requireSafetyCommentForTypeAssertionRule,
  {
    valid: [
      {
        code: "// INVARIANT: The caller parsed this value.\nconst value = input as User;",
        options: [{ markers: ["INVARIANT"] }],
      },
      {
        code: "// SAFETY: The caller parsed this value.\nconst value = input as User;",
        options: [{ markers: ["INVARIANT", "SAFETY"] }],
      },
      {
        code: "// SAFE+: The caller parsed this value.\nconst value = input as User;",
        options: [{ markers: ["SAFE+"] }],
      },
    ],
    invalid: [
      {
        code: "// SAFETY: This marker is not configured.\nconst value = input as User;",
        options: [{ markers: ["INVARIANT"] }],
        errors: [error],
      },
      {
        code: "// INVARIANT:   \nconst value = input as User;",
        options: [{ markers: ["INVARIANT"] }],
        errors: [error],
      },
    ],
  },
);

tester.run(
  "anti-slop/require-safety-comment-for-type-assertion",
  requireSafetyCommentForTypeAssertionRule,
  {
    valid: [
      "const values = [1, 2] as const;",
      "const value = <const>{ id: 'one' };",
      "// SAFETY: The parser established the UserId invariant.\nconst id = value as UserId;",
      "function parse(): UserId {\n// SAFETY: Validation above established the UserId invariant.\nreturn value as UserId;\n}",
      "const id = /* SAFETY: Validation established the invariant. */ value as UserId;",
      "// SAFETY: The parser established the exported UserId invariant.\nexport const id = value as UserId;",
      "/* SAFETY:\n * The parser established the exported UserId invariant.\n */\nexport const id = value as UserId;",
    ],
    invalid: [
      { code: "const id = value as UserId;", errors: [error] },
      { code: "const id = <UserId>value;", errors: [error] },
      { code: "const id = value as UserId; // SAFETY: Too late.", errors: [error] },
      {
        code: "// This cast seems fine.\nconst id = value as UserId;",
        errors: [error],
      },
      { code: "// SAFETY:\nconst id = value as UserId;", errors: [error] },
      { code: "// SAFETY:   \nconst id = value as UserId;", errors: [error] },
      { code: "const id = /* SAFETY: */ value as UserId;", errors: [error] },
      { code: "export const id = value as UserId;", errors: [error] },
      {
        code: "// This is not a safety justification.\nexport const id = value as UserId;",
        errors: [error],
      },
    ],
  },
);
