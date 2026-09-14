import { RuleTester } from "oxlint/plugins-dev";

import { noReflectApplyRule } from "./no-reflect-apply.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "reflectApply" };

tester.run("anti-slop/no-reflect-apply", noReflectApplyRule, {
  valid: [
    "const value = operation.apply(owner, args);",
    "Reflect.get(owner, key);",
    "const Reflect = { apply() { return 1; } }; Reflect.apply();",
    "function invoke(Reflect: { apply(): number }) { return Reflect.apply(); }",
  ],
  invalid: [
    { code: "const value = Reflect.apply(operation, owner, args);", errors: [error] },
    { code: "const value = Reflect['apply'](operation, owner, args);", errors: [error] },
  ],
});
