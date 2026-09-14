# Anti-slop checks

AIRI runs the vendored anti-slop plugin through Oxlint and `eslint-plugin-slop` through ESLint.
The existing `pnpm lint` and staged-file hook run both tools through `moeru-lint`.

New rules report warnings during adoption. Existing lint errors keep their severity.
ESLint scans complete JavaScript, TypeScript, and Vue script files. Results do not depend on Git history or changed-line detection.
Neither plugin proves type safety or replaces schema validation and code review.

## Sources and versions

- [anti-slop](https://github.com/dmmulroy/anti-slop): 18 generic rules, vendored at the commit in [UPSTREAM.md](anti-slop/UPSTREAM.md).
- [eslint-plugin-slop](https://github.com/antfu/eslint-plugin-slop): version `0.1.3`, with eight rules.
- `oxlint` and `@oxlint/plugins`: both pinned to `1.79.0` in the workspace catalog. Upgrade them together.

AIRI does not declare Effect as a direct dependency. The optional Effect plugin is not included.

## Overlap and policy

| Area | anti-slop | eslint-plugin-slop | AIRI policy |
| --- | --- | --- | --- |
| Nested assertions | `no-chained-type-assertions` | `no-chained-type-assertions` | Enable the ESLint rule only. Both permit chains made entirely of `as const`. |
| Aliases for `unknown` | `no-unknown-type-aliases` | `no-trivial-type-aliases` | Enable anti-slop only. It also resolves scoped and generic aliases. The ESLint rule also rejects primitive aliases, which AIRI permits for domain names. |
| Comments | `require-safety-comment-for-type-assertion` | `prefer-jsdoc`, `max-comment-length`, `no-jargon` | Complementary: assertion evidence versus comment form, length, and vocabulary. Enable all four. |
| Naming and abstraction | `no-shape-in-symbol-names` | `no-trivial-functions`, `no-static-only-class` | Different constructs. Enable all three. |
| Spacing | `require-readable-spacing` | No equivalent | Disable anti-slop spacing. AIRI already uses ESLint Stylistic padding rules. |
| Module mocks | `no-module-mocking` | No equivalent | Disable the blanket ban. AIRI permits mocks at external boundaries and has a separate internal-module policy. |
| Punctuation | No equivalent | `no-em-dash` | Disable. This rule also inspects product strings, where punctuation is content. |

All other generic anti-slop rules are enabled as warnings. Native `oxc/no-accumulating-spread` complements `no-reduce-accumulator-copy`.
Anti-slop checks array pipelines, conditional empty spreads, type widening, unsafe dictionaries, reflection, runtime type checks, and unknown contracts.
The assertion-comment rule uses its upstream `SAFETY:` marker. This explains a type assertion, while AIRI's `NOTICE:` marker documents a workaround.

The two alias rules overlap only partly. Selecting anti-slop intentionally leaves primitive aliases permitted.
The upstream rules are syntactic. For example, an unknown receiver does not prove that `.filter().map()` operates on an eager array.

## Use and validation

Run the normal checks from the repository root:

```sh
pnpm lint
pnpm typecheck
```

Run a focused file through both linters:

```sh
pnpm exec moeru-lint --no-cache path/to/file.ts
```

Run the vendored RuleTester suites with the matched Oxlint runtime:

```sh
for test in tools/oxlint/anti-slop/rules/*.test.ts; do pnpm exec tsx "$test" || exit 1; done
```

Use these rules to identify code that needs review. Do not rewrite boundary parsing, delete domain types, or add assertions only to silence warnings.
Review warnings before promoting individual rules to errors. Keep policy changes in the root lint configuration and preserve vendored source provenance.
