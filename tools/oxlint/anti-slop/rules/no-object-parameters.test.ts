import { RuleTester } from "oxlint/plugins-dev";

import { noObjectParametersRule } from "./no-object-parameters.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "objectParameter" };

tester.run("anti-slop/no-object-parameters", noObjectParametersRule, {
	valid: [
		"type Alias = object;",
		"function f(value: Alias) {}",
		"interface Owner { readonly id: string } function f(value: Owner) {}",
		"function f<Value>(value: Value) {}",
		"function f<Value extends object>(value: Value) {}",
		"function f<Value extends Owner, Owner extends { readonly id: string }>(value: Value) {}",
		"type Owner = { readonly id: string }; function f<Value extends Owner>(value: Value) {}",
		"type Alias = object; function consume<Alias>(value: Alias) {}",
		"type Alias = object; type Consumer<Alias> = (value: Alias) => void;",
		"type Alias = object; interface Consumer<Alias> { consume(value: Alias): void }",
		"type Key = object; type Mapped<Input> = { [Key in keyof Input]: (value: Key) => void };",
		"type Item = object; type Unpacked<Input> = Input extends Promise<infer Item> ? (value: Item) => void : never;",
		"type Payload = object; function outer() { type Payload = { readonly id: string }; function consume(value: Payload) {} }",
		"type Identity<T> = T; function consume<Identity>(value: Identity) {}",
		"function one() { type Payload = object; } function two() { function consume(value: Payload) {} }",
	],
	invalid: [
		{ code: "function f(value: object) {}", errors: [error] },
		{ code: "type Alias = object; function f(value: Alias) {}", errors: [error] },
		{ code: "type Alias = (object); function f(value: Alias) {}", errors: [error] },
		{
			code: "type Item = object; type Fallback<Input> = Input extends infer Item ? string : (value: Item) => void;",
			errors: [error],
		},
		{
			code: "function consume(value: object = {}): void {}",
			errors: [{ ...error, data: { parameter: "value" } }],
		},
		{
			code: "function consume({ value }: object = {}): void {}",
			errors: [{ ...error, data: { parameter: "{ value }" } }],
		},
		{
			code: "type Bag = object; function consume({ value }: Bag): void {}",
			errors: [{ ...error, data: { parameter: "{ value }" } }],
		},
		{
			code: "function outer() { type Payload = object; function consume(value: Payload) {} }",
			errors: [error],
		},
		{
			code: "function outer() { function consume(value: Payload) {} type Payload = object; }",
			errors: [error],
		},
		{
			code: "type Identity<T> = T; function consume(value: Identity<object>) {}",
			errors: [error],
		},
		{
			code: "type Identity<T> = T; type Wrapped<T> = Identity<T>; function consume(value: Wrapped<object>) {}",
			errors: [error],
		},
	],
});
