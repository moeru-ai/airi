# Personal companion

This folder and `apps/stage-tamagotchi/src/renderer/personal/` hold the changes that make this fork your own desktop companion.
Upstream AIRI does not have these changes.

The fork adds these features to the desktop app (stage-tamagotchi):

- **Your character.** The app ships with your character. It selects that character on the first start. You do not import anything.
- **Local mode.** The app uses Ollama for chat, Kokoro for the voice, and Sherpaw for speech recognition. All three run on your computer.
- **Lorebook.** The app gives the model extra facts only when a key word is in the chat.
- **Memory.** The companion remembers facts about you across sessions. You can see and edit them in Settings.
- **Reminders.** Ask the companion to remind you of something. It says the reminder when it is due, also after a restart.

## Where the files are

| File | What it does | Do you edit it? |
| --- | --- | --- |
| `apps/stage-tamagotchi/src/renderer/personal/character.ts` | Your character: name, personality, speaking style, greeting, and lorebook. | **Yes** |
| `apps/stage-tamagotchi/src/renderer/personal/local-mode.json` | Local mode settings: the Ollama model and the voice. | **Yes** |
| `apps/stage-tamagotchi/src/renderer/personal/features.json` | Turns memory and reminders on or off. | **Yes** |
| `apps/stage-tamagotchi/src/renderer/pages/settings/companion-memory.vue` | The **Companion memory** page in Settings. | No |
| `personal/setup-local.cmd` and `personal/setup-local.ps1` | Installs Ollama and downloads the chat model. | No |
| `.github/workflows/personal-build-windows.yml` | Builds the Windows installer on GitHub. | No |
| `apps/stage-tamagotchi/src/renderer/personal/*.ts` (other files) | The code that installs the character and runs the lorebook, memory, and reminders. | Only if you want to change the behavior |
| `apps/stage-tamagotchi/src/renderer/App.vue` | Upstream file. A few lines start and stop the personal code. Search for `PERSONAL:` and `stopPersonalCompanion`. | No |
| `apps/stage-tamagotchi/src/renderer/app.browser.test.ts` | Upstream test. One assertion has the `PERSONAL:` mark, because the personal character changes the first start. | No |

## Get the app

You do not need to install development tools for this. GitHub builds the installer for you.

GitHub shows the workflow only when its file is on the default branch of your fork, usually `main`.
So merge the personal changes into `main` one time before step 1.

1. Open your fork on GitHub.
2. Click the **Actions** tab.
3. If GitHub asks you to enable workflows for the fork, click the button to enable them.
4. In the list on the left, click **Personal Build (Windows)**.
5. Click **Run workflow**. Select the branch that has your changes, then click the green **Run workflow** button.
6. Wait until the run has a green check mark. A build can take up to one hour.
7. Open the run. Under **Artifacts**, download `airi-personal-windows-x64`. It is a ZIP file.
8. Extract the ZIP file and run `AIRI-<version>-windows-x64-setup.exe`.

The installer has no code signature. Windows SmartScreen can show "Windows protected your PC". Click **More info**, then **Run anyway**.

Do not use the update button inside the app.
The updater downloads the upstream AIRI release, and that release does not have your character or your settings.
To update, run the workflow again and install the new installer.

## Set up local mode

Do these steps one time on each computer.

1. Get the repository on your computer. See [Edit the character](#edit-the-character), steps 1 to 3.
2. In File Explorer, open the `personal` folder and double-click `setup-local.cmd`.
3. The script installs Ollama with `winget` if Ollama is not installed. Then it downloads the chat model.
4. When the script shows "Done", start AIRI.

Ollama must run when you use AIRI. The Ollama installer adds it to the Windows startup apps, so usually it is already running.

The installer includes the speech recognition model. The app downloads the voice model (approximately 100 to 300 MB) the first time that the companion speaks. After that, chat, voice, and hearing work without the internet.

To use cloud providers again, set `"enabled": false` in `local-mode.json` and build again. You can also select other providers in **Settings**.

### Local mode settings

`local-mode.json` has these fields:

| Field | Meaning |
| --- | --- |
| `enabled` | `true` selects the local providers for your character. `false` keeps the providers that you select in Settings. |
| `ollama.baseUrl` | The address of the Ollama server. Keep `http://localhost:11434/v1/` unless Ollama runs on another computer. |
| `ollama.model` | The Ollama model name, for example `gemma3:4b`. Find names at <https://ollama.com/library>. A larger model gives better replies, but it needs more memory. |
| `speech.voice` | The Kokoro voice, for example `af_heart`. **Settings > Providers > Kokoro TTS** shows the list of voices. |
| `hearing.enabled` | `true` selects Sherpaw speech recognition if no recognition provider is selected. |

If you change `ollama.model`, run `setup-local.cmd` again to download the new model.

## Edit the character

### One-time preparation

1. Install [Git for Windows](https://git-scm.com/download/win) and [Visual Studio Code](https://code.visualstudio.com/).
2. In VS Code, press `Ctrl+Shift+P`, type `Git: Clone`, and press Enter. Paste the URL of your fork, for example `https://github.com/<your-name>/airi-project.git`.
3. Select a folder. When VS Code asks, click **Open**.

### Each time you change the character

1. In the VS Code Explorer, open `apps/stage-tamagotchi/src/renderer/personal/character.ts`.
2. Change the text between the quotes. Save with `Ctrl+S`.
3. Open the **Source Control** view (`Ctrl+Shift+G`). Write a short message, for example `Change Mira's greeting`, and click **Commit**.
4. Click **Sync Changes** to push the commit to GitHub.
5. Build and install the app again. See [Get the app](#get-the-app).

On the next start, the app finds the changed character and replaces its stored copy.
It does not select the character again if you selected another character in the meantime.
The replacement removes edits that you made to this character in **Settings**, so make your edits in `character.ts`.

### TypeScript for a C++ developer

`character.ts` is TypeScript. Think of it as a header with one `const` struct initializer:

```ts
export const personalCharacter = { // like: extern const Card personalCharacter = { ... };
  name: 'Mira', // a string field. Single and double quotes are the same.
  greetings: ['Hi!', 'Hello!'], // an array, like std::vector<std::string>
} satisfies Card // like a static_assert that the struct matches the Card type
```

- A comment starts with `//`, the same as in C++.
- Strings use `'...'`. To write `'` inside a string, write `\'`, for example `'user\'s'`.
- `[ 'line 1', 'line 2' ].join('\n')` makes one string with the lines separated by newlines.
- A comma after the last item is allowed.
- VS Code underlines errors in red, the same as a C++ IDE. If you install the recommended extensions, hover over a field to see its documentation.

The fields of the character:

| Field | Meaning |
| --- | --- |
| `name`, `nickname` | The name that the app shows. |
| `description` | Who the character is. The model reads it before each reply. |
| `personality` | How the character behaves. |
| `scenario` | Where the character is and what is happening. |
| `systemPrompt` | Rules for the replies, for example length and tone. |
| `greetings` | The first item is the greeting. The app stores it, but it does not show greetings in the chat yet. |
| `characterBook` | The lorebook. See the next section. |
| `version` | A label that the app shows. Changing it is optional. |

### Lorebook

A lorebook entry is a fact that the model gets only when one of its key words is in the chat.
Use it for long background details. A small model has a small context, so do not put every detail in `description`.

```ts
const entry = {
  keys: ['birthday', 'born'], // the entry is used when one of these words is in the chat
  content: 'The user\'s birthday is on 1 January.',
  enabled: true,
  insertion_order: 10, // lower numbers come first in the prompt
  use_regex: false, // true: each key is a regular expression, like std::regex
  extensions: {},
}
```

In `character.ts`, write each entry without `const entry =`, inside the `entries: [ ... ]` array, with a comma after it.

Optional fields:

| Field | Meaning |
| --- | --- |
| `constant: true` | Sends the entry with every message, with no key word needed. |
| `case_sensitive: true` | `Mira` does not match `mira`. By default, case is ignored. |
| `selective: true` with `secondary_keys: [...]` | The entry is used only when a key **and** a secondary key are in the chat. |

`scan_depth` in `characterBook` sets how many of the latest messages the app searches. The current message is always searched.

The lorebook works for the character in `character.ts`. A character card that you import in Settings loses its lorebook, because the upstream importer does not copy it.

## Memory and reminders

### How memory works

After each reply, the app sends one more request to the chat model. It asks the model which facts about you to remember or forget, and if you asked for a reminder.
The request runs in the background, so it does not delay the chat.
Before each message, the app gives the companion the facts that it remembers and your pending reminders.

The facts are stored only on your computer, in the app data. They are not part of the repository.

To see, add, or delete facts, open **Settings > Companion memory**.
To make the companion forget a fact, you can also tell it in the chat, for example "Forget that I live in Berlin."

The extra request uses the chat model again. With a slow computer, the voice and the next reply can be a little slower while the request runs.
A small model sometimes misses a fact or writes it in a strange way. Correct it on the **Companion memory** page.

### How reminders work

Ask in the chat, for example "Remind me at 6 pm to call Mom" or "Remind me in 20 minutes to stretch."
When the reminder is due, the companion says it.
If the app was closed at that time, the companion says the reminder when the app starts again.

You can also add and delete reminders on the **Companion memory** page.

If the chat model does not reply, for example because Ollama is not running, the app tries again for three minutes. Then it closes the reminder.

### Memory and reminder settings

`features.json` has these fields:

| Field | Meaning |
| --- | --- |
| `memory.enabled` | `true` turns memory on. |
| `memory.maxFacts` | The maximum number of facts. When there are more, the app deletes the oldest facts. |
| `reminders.enabled` | `true` turns reminders on. |

When both `memory.enabled` and `reminders.enabled` are `false`, the app does not send the extra request.

## Run the app from the source code (optional)

Use this when you change the code and want to see the result without a GitHub build.

1. Install [mise](https://mise.jdx.dev/installing-mise.html). In a terminal in the repository folder, run `mise install`. This installs the Node.js and pnpm versions that the project needs.
2. Run `pnpm install`. The first install takes several minutes.
3. Run `pnpm dev:tamagotchi`. The app opens and reloads when you save a file.

For the first run, the computer must be connected to the internet, because the build downloads the Live2D SDK and the sample models.

Before you push a code change, run these checks:

```shell
pnpm -F @proj-airi/stage-tamagotchi typecheck
pnpm exec vitest run apps/stage-tamagotchi/src/renderer/personal
pnpm lint
```

## Get updates from upstream AIRI

Do this when you want the new features of upstream AIRI.

1. One time, add the upstream repository: `git remote add upstream https://github.com/moeru-ai/airi.git`
2. Run `git fetch upstream`.
3. Run `git merge upstream/main`.
4. If Git reports a conflict, it is almost always in the personal lines of `App.vue` or `app.browser.test.ts`. Keep the upstream lines, then add the personal lines again.
5. Run the checks in the previous section, then push.

The personal files are new files. Upstream does not change them, so they do not cause conflicts.

## Known limits

- The app does not show the greeting in the chat yet.
- A card imported in Settings loses its lorebook.
- The lorebook ignores `token_budget`, `recursive_scanning`, and `position`.
- The update button inside the app installs upstream AIRI, not your build.
- Reminders work only in the main window of the app. Keep the app running. The main window can be hidden.
- When the main window is hidden, Windows and Chromium slow down its timers. A reminder can then be up to approximately one minute late.
- The **Companion memory** page is in English only.
