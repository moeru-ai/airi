# Skills, automations, and long-term memory

Status: Accepted

## Context

The chat has one conversation per character. It has no reusable skills, no memory across sessions, and no way to act without an owner message.
External modules, such as a Discord bot, send input into the owner's conversation and read the owner's context.

## Decision

AIRI keeps one main conversation agent per persona. Skills and memory extend that agent. Background tasks work beside it.

### Skills

A recipe is a skill, like a skill in a coding agent.

- The `builtIn_useRecipe` tool description lists the usable recipes by name and purpose. Steps never appear in the list.
- When a recipe fits, the model calls the tool. The tool returns the steps, and the model follows them in the same turn and in later turns.
- A keyword in the owner's message works like a slash command. The steps are stored with that message, so later requests keep them without another tool call.
- A recipe marked `background` runs a task in its own hidden session. Its result reaches the conversation later as a notice.
- Every recipe run can use every registered tool, computer use included. The owner approved the recipe, or asked for the run.

### Decisions

- A decision recipe asks one question with a yes-or-no, choice, or score answer. A keyword in the owner's message invokes it.
- The main model answers through `builtIn_judge` in the same turn. It sees the question and the answers, and never what each answer leads to.
- The model always picks one answer. A judgment has no confidence and no unsure answer.
- Code runs the action of the chosen answer: reply as usual, read without replying, add a hint, or use another recipe.

### Automations

- An auto-run recipe starts on a silence, a fixed interval, a local time on chosen weekdays, the owner's mouse or keyboard use after time away, or a new observation from a registered module, named by the module name.
- Conditions limit a run to a time range, weekdays, or an idle or active state. A cooldown spaces runs.
- The owner's activity counts mouse and keyboard input. The desktop app reads the system idle time, so input in any app counts. The web app sees input in its own page only.
- Code decides each trigger from the clock and the observations, without a model call. A new or newly enabled recipe counts time from when the leader first sees it.
- An auto-run recipe always runs in the background. It reports to the owner conversation of the selected card that the owner used last.
- An auto-run recipe follows the owner's instructions. The owner can pick preset instructions instead, and then the model decides what each run does from the recipe's description.
- A model-timed recipe has keywords and no automation of its own. The model sets one or more runs with `builtIn_armRecipe` from the owner's words. Each run happens once and needs no approval.
- A repeat that the owner asks for becomes a proposal. The model can also propose a recipe with `builtIn_proposeRecipe`. Each proposal waits for one owner approval.

### Background tasks

- Each background task runs in a new hidden session. It never resends the main conversation.
- Tasks run at the same time, each in its own session. Owner input never waits for them.
- It has no voice. The session keeps its status: armed, running, done, failed, or stopped. The chat lists open tasks and the latest results. Only the three newest finished tasks keep their sessions, and dismissing a task deletes its session.
- The owner can stop an armed or running task. A stopped task reports no result. A new leader marks tasks of an earlier leader as stopped.
- When it ends, the main agent gets a notice with the whole result and decides what to say, or says nothing.
- History keeps the notice, marked with its source, so later turns still know the result. Requests and the chat never show it as owner speech.
- A notice and the reply to it never sync to the cloud, because the cloud chat cannot mark a notice.

### Long-term memory

- Memory is an index plus one entry per fact. The index lists every entry by name and description, and joins the identity at the start of each run.
- The run reads, writes, and forgets entries with memory tools. It needs no approval.
- A new entry belongs to the character card of the run. Other cards do not read it.
- The owner can make an entry general in Settings. Every card then reads it in addition to its own entries. A run cannot change or forget a general entry.
- Settings lists the entries grouped by card. A switch turns long-term memory off, and then no memory reaches a prompt.
- Deleting all data also deletes memories and recipes.

### Identity

- Each run reads the identity of its session's persona when it starts. Sessions store no system snapshot, so a card edit reaches the next run.

### Scenes and routing

- An external scene, for example a Discord channel, names a binding. The host keeps one persistent session for each binding.
- Scene sessions and background task sessions stay on this device. Cloud chats carry no bindings or task status.

### Speech

- Replies to the owner's sessions speak, also when a module that speaks for the owner sent the input. Scene replies and background tasks stay silent.

## Implementation boundaries

`core-agent` owns runtime policy and portable types: recipes, decisions, and automations.
`stage-ui` connects storage, providers, tools, and chat surfaces.
The renderer leader runs recipe triggers. Other windows read state.
Recipes and memory live under long-term memory in Settings.

## Validation

Deterministic tests cover recipes, decisions, automations, the arming and proposal tools, scene routing, and the chat contract.
Browser tests cover the recipe editor, background tasks, the chat history, and the session store.

## Open work

- Live checks with real models, Discord, and speech are not verified.
- Scene privacy: chat output reaches every connected module, and a scene prompt reads every shared context.
- A skill becomes code that the model writes and a QuickJS sandbox runs. The owner sees it as a card with the model's description, and can only delete it.
