# Personal companion guide

This guide tells you how to build, use, and change your personal AIRI desktop companion.
It is written for a C++ developer. It explains each web tool by comparison with a C++ tool that you know.

Upstream AIRI does not have these changes. They are in this fork only.

## Contents

1. [What the fork adds](#what-the-fork-adds)
2. [Words that you will see](#words-that-you-will-see)
3. [First-time setup](#first-time-setup)
4. [Daily use](#daily-use)
5. [Change the companion](#change-the-companion)
6. [Build and install a new version](#build-and-install-a-new-version)
7. [How the code works](#how-the-code-works)
8. [Run the app from the source code](#run-the-app-from-the-source-code)
9. [Get updates from upstream AIRI](#get-updates-from-upstream-airi)
10. [Troubleshooting](#troubleshooting)
11. [Known limits](#known-limits)
12. [All personal files](#all-personal-files)

## What the fork adds

The fork changes the desktop app, which is named stage-tamagotchi in the source code.

| Feature | What it does |
| --- | --- |
| **Your character** | The app ships with your character. It selects that character on the first start. You do not import anything. |
| **Local mode** | Chat, voice, and speech recognition run on your computer. No cloud account or API key is necessary. |
| **Lorebook** | The model gets extra facts about the character only when a key word is in the chat. |
| **Memory** | The companion remembers facts about you across sessions. You can see and edit them in Settings. |
| **Reminders** | Ask the companion to remind you of something. It says the reminder when it is due, also after a restart. |

## Words that you will see

| Word | What it is | C++ comparison |
| --- | --- | --- |
| **TypeScript** (`.ts`) | The programming language of the app. It is JavaScript with static types. | Like C++ compared with C: the same base language, with a type checker on top. |
| **JavaScript** | The language that TypeScript compiles to. The app runs it. | Like the machine code that your C++ compiler makes. |
| **Node.js** | The program that runs JavaScript outside a browser. | Like a runtime plus a standard library, for example the CRT and the STL. |
| **pnpm** | The package manager and task runner. | Like vcpkg or Conan for packages, plus `make` for tasks. |
| **`package.json`** | The file that lists the packages and the tasks of one project. | Like `vcpkg.json` and the targets in a `CMakeLists.txt`. |
| **Electron** | The desktop shell of the app. It is a Chromium browser plus Node.js in one program. | Like a Qt app that has a `QWebEngineView` for all of its UI. |
| **Vue** (`.vue`) | The UI framework. A `.vue` file has the template, the code, and the style of one UI part. | Like a Qt Designer `.ui` file and its C++ class in one file. |
| **JSON** (`.json`) | A text format for settings. It has no comments. | Like an `.ini` file with nesting. |
| **Local storage** | The private data store of the app on your computer. | Like a small key-value file in `%APPDATA%`. |
| **Ollama** | A program that runs language models on your computer. The app talks to it at `http://localhost:11434`. | Like a local server daemon that your program calls over HTTP. |
| **Model** | The AI that writes the replies, for example `gemma3:4b`. | A large data file that Ollama loads, like a big asset. |
| **Kokoro** | The voice. It runs inside the app. | A text-to-speech library. |
| **Sherpaw** | The speech recognition. It runs inside the app. | A speech-to-text library. |
| **Git commit, push** | Save a change in Git, then send it to GitHub. | The same as in any C++ project. |
| **Pull request (PR)** | A request on GitHub to merge one branch into another. | The same as in any C++ project. |
| **GitHub Actions, workflow** | Programs that GitHub runs for you on its computers. | Like a CI server, for example Jenkins. |
| **Vitest** | The test framework. | Like GoogleTest. |
| **ESLint** | The linter and formatter. | Like `clang-tidy` plus `clang-format`. |
| **Typecheck** | A check of all types, without a build. | Like a compile with `-fsyntax-only`. |

## First-time setup

Do these steps one time.

### Step 1: Merge the personal changes into `main`

GitHub shows the build workflow only when its file is on the default branch of your fork, which is `main`.

1. Open the pull request of your fork on GitHub: <https://github.com/evillwb/airi-project/pull/1>.
2. Make sure that the checks **Lint**, **Type Check**, **Unit Test**, and **Build Test (stage-tamagotchi)** have a green check mark.
3. Click **Merge pull request**, then **Confirm merge**.

The check **Dispatch Category Triage** always fails in a fork. You can ignore it. See [Troubleshooting](#troubleshooting).

### Step 2: Build the Windows installer

You do not need development tools for this. GitHub builds the installer for you.

1. On your fork on GitHub, click the **Actions** tab.
2. If GitHub asks you to enable workflows for the fork, click the button to enable them.
3. In the list on the left, click **Personal Build (Windows)**.
4. Click **Run workflow**. Keep the branch `main`, then click the green **Run workflow** button.
5. Wait until the run has a green check mark. A build can take up to one hour.
6. Open the run. Under **Artifacts**, download `airi-personal-windows-x64`. It is a ZIP file.

### Step 3: Install the app

1. Extract the ZIP file.
2. Run `AIRI-<version>-windows-x64-setup.exe`.
3. The installer has no code signature, so Windows SmartScreen can show "Windows protected your PC". Click **More info**, then **Run anyway**.
4. Follow the installer. It adds a desktop shortcut.

### Step 4: Set up the local AI model

The app needs Ollama for the chat replies. A script installs it.

1. Get the repository on your computer. See [Get the repository](#get-the-repository).
2. In File Explorer, open the `personal` folder of the repository, then double-click `setup-local.cmd`.
3. The script installs Ollama with `winget` if Ollama is not installed. Then it downloads the chat model. The download is approximately 3 GB for `gemma3:4b`.
4. Wait until the script shows "Done". Then press a key to close the window.

The Ollama installer adds Ollama to the Windows startup apps. So, usually Ollama is already running when you start AIRI.

### Step 5: Start the companion

1. Start **AIRI** from the desktop shortcut.
2. On the first start, the app adds your character and selects it.
3. Send a first message. The first reply can be slow, because Ollama loads the model into memory.
4. The first time that the companion speaks, the app downloads the voice model (approximately 100 to 300 MB). After that, the voice starts immediately.

After the first start, chat, voice, and speech recognition work without the internet.

## Daily use

### Talk to the companion

- Use the control buttons next to the companion:
  - **Open Chat** shows the chat, where you type messages.
  - **Turn on microphone** lets you talk to the companion with your voice.
  - **Open settings** opens the settings window.
- The tray icon of AIRI (near the clock) has a menu to show the companion, change the window size, and open the settings.

### Memory

The companion learns facts about you from your chats. For example, if you write "My sister is called Ana", the companion remembers it in later sessions.

- To see, add, or delete facts, open **Settings > Companion memory**.
- To make the companion forget a fact, you can also write in the chat, for example "Forget that I live in Berlin."
- The facts are stored only on your computer. They are not in the repository.

### Reminders

- Ask in the chat, for example "Remind me at 6 pm to call Mom" or "Remind me in 20 minutes to stretch."
- When the reminder is due, the companion says it.
- If the app was closed at that time, the companion says the reminder when the app starts again.
- To see, add, or delete reminders, open **Settings > Companion memory**.

## Change the companion

### Get the repository

Do this one time on each computer.

1. Install [Git for Windows](https://git-scm.com/download/win) and [Visual Studio Code](https://code.visualstudio.com/).
2. In VS Code, press `Ctrl+Shift+P`, type `Git: Clone`, and press Enter.
3. Paste `https://github.com/evillwb/airi-project.git`, and press Enter.
4. Select a folder. When VS Code asks, click **Open**.
5. When VS Code asks to install the recommended extensions, click **Install**. They show errors and documentation in the files.

### What to edit

All files that you edit are in `apps/stage-tamagotchi/src/renderer/personal/`.

| I want to change... | File | Field |
| --- | --- | --- |
| The name of the companion | `character.ts` | `name`, `nickname` |
| Who the companion is | `character.ts` | `description` |
| How the companion behaves | `character.ts` | `personality` |
| Where the companion is | `character.ts` | `scenario` |
| How the companion speaks, for example reply length | `character.ts` | `systemPrompt` |
| The greeting | `character.ts` | `greetings` |
| Background facts about the character or about me | `character.ts` | `characterBook` (the lorebook) |
| The chat model | `local-mode.json` | `ollama.model` |
| The voice | `local-mode.json` | `speech.voice` |
| Use cloud providers instead of local mode | `local-mode.json` | `enabled` |
| Turn memory or reminders on or off | `features.json` | `memory.enabled`, `reminders.enabled` |
| The maximum number of remembered facts | `features.json` | `memory.maxFacts` |

After each change, do the steps in [Build and install a new version](#build-and-install-a-new-version).

### TypeScript for a C++ developer

`character.ts` is TypeScript. Think of it as a header with one `const` struct and its initializer:

```ts
import type { Card } from '@proj-airi/ccc' // like: #include "card.h"

export const personalCharacter = { // like: extern const Card personalCharacter = { ... };
  name: 'Mira', // a string field. Single and double quotes are the same.
  greetings: ['Hi!', 'Hello!'], // an array, like std::vector<std::string>{"Hi!", "Hello!"}
} satisfies Card // like a static_assert that the struct matches the Card type
```

The rules that you need:

- A comment starts with `//`, the same as in C++.
- A string uses `'...'`. To write `'` inside a string, write `\'`, for example `'user\'s'`.
- `['line 1', 'line 2'].join('\n')` makes one string from the lines, with a newline between them. The character file uses it for long texts.
- A comma after the last item of a list is allowed.
- `true` and `false` are the same as in C++.
- VS Code underlines errors in red, the same as a C++ IDE. Hover over a red line to see the error.

The fields of the character:

| Field | Meaning |
| --- | --- |
| `version` | A label that the app shows. Changing it is optional. |
| `name`, `nickname` | The name that the app shows. |
| `description` | Who the character is. The model reads it before each reply. |
| `personality` | How the character behaves. |
| `scenario` | Where the character is and what is happening. |
| `systemPrompt` | Rules for the replies, for example length and tone. |
| `greetings` | The first item is the greeting. The app stores it, but it does not show greetings in the chat yet. |
| `characterBook` | The lorebook. See the next section. |

### Lorebook

A lorebook entry is a fact that the model gets only when one of its key words is in the chat.
Use it for long background details. A small model has a small context, so do not put every detail in `description`.

Each entry has this shape:

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

`scan_depth` in `characterBook` sets how many of the latest messages the app searches for key words. The current message is always searched.

### Local mode settings

`local-mode.json` has these fields:

| Field | Meaning |
| --- | --- |
| `enabled` | `true` selects Ollama and Kokoro for your character. `false` keeps the providers that you select in Settings. |
| `ollama.baseUrl` | The address of the Ollama server. Keep `http://localhost:11434/v1/` unless Ollama runs on another computer. |
| `ollama.model` | The Ollama model name, for example `gemma3:4b`. Find names at <https://ollama.com/library>. A larger model gives better replies, but it needs more memory and is slower. |
| `speech.voice` | The Kokoro voice, for example `af_heart`. **Settings > Providers > Kokoro TTS** shows the list of voices. |
| `hearing.enabled` | `true` selects Sherpaw speech recognition if no recognition provider is selected. |

If you change `ollama.model`, run `personal/setup-local.cmd` again. It downloads the new model.

How to select a model size:

| Computer | Model to try |
| --- | --- |
| 8 GB of memory (RAM) | `gemma3:1b` or `qwen3:1.7b` |
| 16 GB of memory (RAM) | `gemma3:4b` (the default) |
| 32 GB of memory, or a graphics card with 12 GB or more | `gemma3:12b` |

### Memory and reminder settings

`features.json` has these fields:

| Field | Meaning |
| --- | --- |
| `memory.enabled` | `true` turns memory on. |
| `memory.maxFacts` | The maximum number of facts. When there are more, the app deletes the oldest facts. |
| `reminders.enabled` | `true` turns reminders on. |

When both `memory.enabled` and `reminders.enabled` are `false`, the app does not send the extra memory request. See [How memory and reminders work](#how-memory-and-reminders-work).

## Build and install a new version

Do these steps after each change.

1. Save the file in VS Code (`Ctrl+S`).
2. Open the **Source Control** view (`Ctrl+Shift+G`).
3. Write a short message, for example `Change Mira's greeting`, and click **Commit**. If VS Code asks to stage all changes, click **Yes**.
4. Click **Sync Changes**. This pushes the commit to GitHub.
5. Build the installer again. See [Step 2](#step-2-build-the-windows-installer).
6. Run the new installer. Do not uninstall the old version first. An update keeps your chats, memory, and reminders, but an uninstall deletes them.

On the next start, the app finds the changed character and replaces its stored copy.
This replacement removes edits that you made to this character in **Settings**. So, make your character edits in `character.ts`.
The app does not select the character again if you selected another character in the meantime.

Do not use the update button inside the app. It installs the upstream AIRI release, which does not have your changes.

## How the code works

This section is for when you want to change the behavior, not only the settings.

### Where the code is

| Location | Contents | C++ comparison |
| --- | --- | --- |
| `apps/stage-tamagotchi/` | The desktop app. | The executable project. |
| `apps/stage-tamagotchi/src/main/` | The Electron main process: windows, tray, files. | The process that owns the OS windows. |
| `apps/stage-tamagotchi/src/renderer/` | The UI of each window. Each window is a separate browser page. | The UI code. Each window is like a separate process with its own memory. |
| `packages/stage-ui/` | Shared upstream logic: chat, providers, speech, characters. | A static library that the app links. |
| `apps/stage-tamagotchi/src/renderer/personal/` | **All personal code.** | Your own library in the project. |

### What happens at start

`App.vue` is the root of each window. Upstream code in it starts the app. A few personal lines call `initializePersonalCompanion()` from `personal/index.ts`.

```text
App.vue  (upstream, each full window)
  -> initializePersonalCompanion({ isLeader })        personal/index.ts
       -> installLorebook()        hook: before each message
       -> installMemory()          hooks: before each message, after each reply
       -> only in the leader window:
            -> installCharacter()       adds or updates the card, applies local mode
            -> installReminderBridge()  gives reminders to the notebook
```

The app has several windows. One window is the **leader**. It is like the one thread that owns the shared state. Only the leader changes the character and the reminders, so two windows never do the same change.

### What happens for each message

```text
You send a message
  -> before compose:  lorebook.ts selects lorebook entries for the message
                      memory.ts adds the remembered facts and pending reminders
  -> the chat model (Ollama) writes the reply, and Kokoro speaks it
  -> after the reply: memory.ts sends one background request to the model
                      memory-keeper.ts reads the JSON answer
                      companion-store.ts saves new facts and reminders
```

A **hook** is a callback that upstream code calls at a fixed point, like a `std::function` that you register in a list.

### The personal files

| File | What it does | C++ comparison |
| --- | --- | --- |
| `character.ts` | Your character and lorebook. | A `constexpr` configuration struct. |
| `local-mode.json`, `local-mode.ts` | The local mode settings, and the code that configures Ollama, Kokoro, and Sherpaw. | A config file and its loader. |
| `features.json`, `features.ts` | The memory and reminder switches, and their loader. | A config file and its loader. |
| `index.ts` | Starts all personal features. Installs and updates the character. | The `init()` function of your library. |
| `lorebook.ts` | Selects the lorebook entries for a message. A pure function. | A free function with no side effects. |
| `memory-keeper.ts` | Builds the memory request and reads its answer. Pure functions. | A parser and a serializer. |
| `memory.ts` | Connects memory to the chat hooks and the chat model. | Glue code that registers callbacks. |
| `companion-store.ts` | Saves facts and reminders in local storage. | A class that owns state and saves it to a file. |
| `reminders.ts` | Gives due reminders to the upstream notebook, and closes them after the companion says them. | An adapter between two modules. |
| `prompt-context.ts` | Writes a text block into the next prompt. | A small helper function. |
| `*.test.ts` | Unit tests. | GoogleTest files. |
| `pages/settings/companion-memory.vue` | The **Companion memory** page in Settings. | A dialog class. |

### How memory and reminders work

After each reply, the app sends one more request to the chat model. It asks the model which facts about you to remember or forget, and if you asked for a reminder. The model answers with JSON.

The request runs in the background, so it does not delay the chat. On a slow computer, the voice and the next reply can be a little slower while it runs.

This design does not use tool calling. Some small models, for example `gemma3`, do not support tool calls. This design works with all models.

A small model sometimes misses a fact or writes it in a strange way. Correct it on the **Companion memory** page.

The upstream notebook says a due task again every 30 seconds until something marks it done. The reminder bridge marks each reminder done after the companion says it. If the model does not reply, for example because Ollama is not running, the app tries again for three minutes. Then it closes the reminder.

## Run the app from the source code

Use this when you change the code and want to see the result immediately, without a GitHub build.

1. Install [mise](https://mise.jdx.dev/installing-mise.html). It installs the correct versions of Node.js and pnpm, like a toolchain manager.
2. Open a terminal in VS Code (`` Ctrl+` ``). Run `mise install`.
3. Run `pnpm install`. This downloads all packages. The first install takes several minutes.
4. Run `pnpm dev:tamagotchi`. The app opens. When you save a file, the app reloads.

For the first run, the computer must be connected to the internet, because the build downloads the Live2D SDK and the sample models.

Before you push a code change, run these checks in the terminal. They are the same checks that GitHub runs.

```shell
pnpm -F @proj-airi/stage-tamagotchi typecheck
pnpm exec vitest run apps/stage-tamagotchi/src/renderer/personal
pnpm lint
```

| Command | C++ comparison |
| --- | --- |
| `pnpm -F @proj-airi/stage-tamagotchi typecheck` | Compile without linking, to find type errors. |
| `pnpm exec vitest run <folder>` | Run the unit tests in that folder, like `ctest`. |
| `pnpm lint` | Run `clang-tidy` and `clang-format` on everything. `pnpm lint:fix` also fixes the format. |

## Get updates from upstream AIRI

Do this when you want the new features of upstream AIRI.

1. One time, add the upstream repository. In the VS Code terminal, run `git remote add upstream https://github.com/moeru-ai/airi.git`.
2. Run `git fetch upstream`.
3. Run `git merge upstream/main`.
4. If Git reports a conflict, it is almost always in the personal lines of `App.vue` or `app.browser.test.ts`. Keep the upstream lines, then add the personal lines again. The personal lines have the mark `PERSONAL:` or the name `stopPersonalCompanion`.
5. Run the checks in [Run the app from the source code](#run-the-app-from-the-source-code).
6. Push, then build the installer again.

The personal files are new files. Upstream does not change them, so they do not cause conflicts.

## Troubleshooting

| Problem | Cause | What to do |
| --- | --- | --- |
| The companion does not reply. | Ollama is not running, or the model is not downloaded. | Run `personal/setup-local.cmd` again. It starts Ollama and downloads the model. |
| The first reply takes a long time. | Ollama loads the model into memory. | Wait. The next replies are faster. |
| All replies are very slow. | The model is too large for your computer. | Select a smaller model in `local-mode.json`. See [Local mode settings](#local-mode-settings). |
| The companion does not speak the first time. | The app downloads the voice model. | Wait one or two minutes. The computer must be connected to the internet for this one download. |
| The companion does not hear me. | The microphone is off, or Windows blocks it. | Click **Turn on microphone**. In Windows, open **Settings > Privacy & security > Microphone** and allow AIRI. |
| The companion forgets things that I told it. | The small model did not find the fact. | Add the fact on the **Settings > Companion memory** page. |
| The companion remembers a wrong fact. | The small model wrote the fact incorrectly. | Delete it on the **Settings > Companion memory** page. |
| A reminder came late. | The main window was hidden, so Windows slowed down its timers. | This delay is up to approximately one minute. |
| A reminder did not come. | The app was not running, or Ollama did not reply for three minutes. | Keep AIRI running. Make sure that Ollama runs. |
| My change in `character.ts` does not show. | The installed app is the old build. | Do all steps in [Build and install a new version](#build-and-install-a-new-version). |
| "Run workflow" is not on the Actions tab. | The workflow file is not on `main` yet. | Merge the pull request into `main`. See [Step 1](#step-1-merge-the-personal-changes-into-main). |
| The check "Dispatch Category Triage" fails. | It is an upstream maintainer tool. It cannot work in a fork. | Ignore it, or disable it: on the **Actions** tab, click **Issue and PR Triage Dispatch**, then **...** > **Disable workflow**. |
| A comment asks to approve a Cloudflare deployment. | It is the upstream web preview. It cannot work in a fork. | Ignore it, or disable **Cloudflare Workers (Preview) Prepare** the same way. |
| Windows says "Windows protected your PC". | The installer has no code signature. | Click **More info**, then **Run anyway**. |
| I want to start again from zero. | | Open **Settings > Data**, then **Delete all data**. On the next start, the app adds your character again. This also deletes chats, memory, and reminders. |

## Known limits

- The app does not show the greeting in the chat yet.
- A character card that you import in Settings loses its lorebook, because the upstream importer does not copy it.
- The lorebook ignores `token_budget`, `recursive_scanning`, and `position`.
- Reminders work only while the app runs. The main window can be hidden.
- When the main window is hidden, a reminder can be up to approximately one minute late.
- An uninstall deletes all app data, including memory and reminders.
- The update button inside the app installs upstream AIRI, not your build.
- The **Companion memory** page is in English only.

## All personal files

These files are new in this fork:

- `apps/stage-tamagotchi/src/renderer/personal/` (all files)
- `apps/stage-tamagotchi/src/renderer/pages/settings/companion-memory.vue`
- `personal/README.md`, `personal/setup-local.cmd`, `personal/setup-local.ps1`
- `.github/workflows/personal-build-windows.yml`

These upstream files have personal lines:

- `apps/stage-tamagotchi/src/renderer/App.vue`: the lines that start and stop the personal code.
- `apps/stage-tamagotchi/src/renderer/app.browser.test.ts`: one assertion, because the personal character changes the first start.
