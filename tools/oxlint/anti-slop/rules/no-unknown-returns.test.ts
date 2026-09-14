import { RuleTester } from "oxlint/plugins-dev";

import { noUnknownReturnsRule } from "./no-unknown-returns.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "unknownReturn" };

tester.run("anti-slop/no-unknown-returns", noUnknownReturnsRule, {
  valid: [
    "type ImportedValue = unknown;",
    "function parse(): ImportedValue { return input; }",
    "function parse(): User { return user; }",
    "function infer() { return input; }",
    "function generic<Value>(): Value { return value; }",
    "type Value = unknown; function generic<Value>(): Value { return value; }",
    "type Key = unknown; type Mapped<Input> = { [Key in keyof Input]: () => Key };",
    "type Item = unknown; type Unpacked<Input> = Input extends Promise<infer Item> ? () => Item : never;",
    "function cause(): { cause: unknown } { return { cause: input }; }",
    "type Result = { value: unknown }; function load(): Result { return result; }",
    "function load(): Promise<User> { return promise; }",
    "type Identity<T> = T; function load(): Identity<User> { return user; }",
    "type Value = unknown; function outer() { type Value = User; function load(): Value { return user; } }",
  ],
  invalid: [
    { code: "function load(): unknown { return input; }", errors: [error] },
    { code: "const load = (): unknown => input;", errors: [error] },
    { code: "type Loader = () => unknown;", errors: [error] },
    { code: "interface Loader { load(): unknown }", errors: [error] },
    { code: "declare function load(): unknown;", errors: [error] },
    { code: "function load(): string | unknown { return input; }", errors: [error] },
    { code: "function load(): Promise<unknown> { return promise; }", errors: [error] },
    { code: "type UnknownValue = unknown; function load(): UnknownValue { return input; }", errors: [error] },
    { code: "type Item = unknown; type Fallback<Input> = Input extends infer Item ? string : () => Item;", errors: [error] },
    {
      code: "function outer() { type Result = unknown; function load(): Result { return input; } }",
      errors: [error],
    },
    {
      code: "type Identity<T> = T; function load(): Identity<unknown> { return input; }",
      errors: [error],
    },
    {
      code: "type Identity<T> = T; type Wrapped<T> = Promise<Identity<T>>; function load(): Wrapped<unknown> { return promise; }",
      errors: [error],
    },
  ],
});
