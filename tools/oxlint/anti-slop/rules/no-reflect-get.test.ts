import { RuleTester } from "oxlint/plugins-dev";

import { noReflectGetRule } from "./no-reflect-get.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "reflectGet" };

tester.run("anti-slop/no-reflect-get", noReflectGetRule, {
  valid: [
    "const value = owner.property;",
    "const value = owner[key];",
    "Reflect.set(owner, key, value);",
    "const Reflect = { get() { return 1; } }; Reflect.get();",
    "function read(Reflect: { get(): number }) { return Reflect.get(); }",
  ],
  invalid: [
    { name: "static access", code: "const value = Reflect.get(owner, key);", errors: [error] },
    { name: "computed access", code: "const value = Reflect['get'](owner, key);", errors: [error] },
  ],
});
