import { RuleTester } from "oxlint/plugins-dev";

import { noChainedTypeAssertionsRule } from "./no-chained-type-assertions.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "chained" };

tester.run("anti-slop/no-chained-type-assertions", noChainedTypeAssertionsRule, {
  valid: [
    "const value = input as User;",
    "const value = (input as User);",
    "const value = ({ id: 1 } as const) as const;",
  ],
  invalid: [
    { name: "as chain", code: "const value = input as unknown as User;", errors: [error] },
    {
      name: "parenthesized chain",
      code: "const value = (input as unknown) as User;",
      errors: [error],
    },
    {
      name: "angle-bracket chain",
      code: "const value = <User>(<unknown>input);",
      errors: [error],
    },
    {
      name: "mixed const chain",
      code: "const value = ({ id: 1 } as const) as User;",
      errors: [error],
    },
  ],
});
