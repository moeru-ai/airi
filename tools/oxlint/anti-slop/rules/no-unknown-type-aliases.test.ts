import { RuleTester } from "oxlint/plugins-dev";

import { noUnknownTypeAliasesRule } from "./no-unknown-type-aliases.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "unknownAlias" };

tester.run("anti-slop/no-unknown-type-aliases", noUnknownTypeAliasesRule, {
	valid: [
		"type User = { readonly id: string };",
		"type Alias = string; type UserId = Alias;",
		"type Payload = string | number;",
		"type Box<T> = { readonly value: T }; type Payload = Box<unknown>;",
	],
	invalid: [
		{ code: "type Alias = unknown;", errors: [error] },
		{ code: "type Current = unknown;", errors: [error] },
		{ code: "type UnknownValue = unknown; type Alias = UnknownValue;", errors: [error, error] },
		{ code: "type Payload = string | unknown;", errors: [error] },
		{
			code: "type Payload = string | unknown; type NestedPayload = number | Payload;",
			errors: [error, error],
		},
		{
			code: "type Identity<T> = T; type Payload = Identity<unknown>;",
			errors: [error],
		},
		{
			code: "type Identity<T> = T; type Wrapped<T> = Identity<T>; type Payload = Wrapped<unknown>;",
			errors: [error],
		},
		{
			code: "function outer() { type Payload = unknown; }",
			errors: [error],
		},
	],
});
