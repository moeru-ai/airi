# `@proj-airi/i18n`

The translations of every AIRI application, and the helpers that load them.

## Use this package

Import the messages of all locales and give them to `vue-i18n`:

```ts
import messages from '@proj-airi/i18n/locales'
```

Each locale is a folder in `src/locales/`. `en` is the source locale. Crowdin translates it into the other locales.

The path of a YAML file is the start of its keys. The key `title` in `en/tamagotchi/settings.yaml` is `tamagotchi.settings.title`.

## Add or change a key

1. Write the English text in `src/locales/en/`. Do not edit the other locales. Crowdin replaces them.
2. If you add a YAML file, also import it in the `index.ts` of its folder.
3. Run `pnpm i18n:check` in the root of the repository.

## Checks

Two checks run in CI. Each check owns different problems.

| Check | Command | Problems |
| --- | --- | --- |
| x18n | `pnpm i18n:check` | A key that the code uses and English does not define. A key that no code uses. Message syntax. |
| Locale check | `node .github/scripts/check-locales.ts` | The content of the translated locales, for example changed placeholders. |

The x18n configuration is `x18n.config.ts` in the root of the repository.

### Known diagnostics

`.x18n/check-baseline.json` holds the diagnostics that already exist. x18n does not report them, and CI fails only on a new error.

If you fix a known diagnostic, update the baseline:

```sh
pnpm i18n:check --update-baseline
```

Do not update the baseline to hide a new error. Fix the key.

### Unused keys

x18n cannot follow a key that the code builds at runtime. It reports these keys as unused:

- A key built from a constant, for example `` t(`${KEY}.title`) ``.
- A key that a wrapper function completes, for example `` tt = key => t(`prefix.${key}`) ``.
- A key that the code gives to a component or a route as a string.

An unused key is a warning, so it does not fail CI. Before you delete a key that x18n reports, search the code for its parent key.

## Do not use this package

Do not keep a string that users see in an application or a feature package. Put it here, so that Crowdin and the checks find it.
