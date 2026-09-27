---
title: DevLog @ 2026.09.27
category: DevLog
date: 2026-09-27
excerpt: |
  If an LLM is too slow to play alongside you, give it a hand — how AIRI's Dome Keeper integration went from collecting data to training its first low-level action classifier, Lower v0.
preview-cover:
  light: "@assets('./assets/cover-light.avif')"
  dark: "@assets('./assets/cover-dark.avif')"
---

Welcome back, this is [@LemonNekoGH](https://github.com/LemonNekoGH), one of the AIRI maintainers.

The last Dome Keeper DevLog was way back on [2026.02.16](../DevLog-2026.02.16/index.md), when I was still slogging through YOLO dataset collection. Half a year later, this line of work has changed direction a few times, and it finally landed on the question I find the most fun: **how do we get an AI to actually put its hands on the keyboard?**

## LLMs are too slow, so we split the problem

It all starts with a small, slightly disappointing observation: you cannot just hand the LLM the question "which key should be held for the next frame?"

In Dome Keeper, when a monster is right on top of you, you have to turn and fire immediately; when an ore is at your feet, you have to press the button right away. Decisions like these live on the scale of tens of milliseconds. Even the fastest LLM takes a round trip of hundreds of milliseconds to several seconds — by the time it has made up its mind, half of the dome has already been gnawed away.

So [ADR-0004](https://github.com/proj-airi/game-playing-ai-dome-keeper/blob/main/docs/decisions/0004-adopt-a-multi-timescale-gameplay-agent.md) splits the whole thing into three layers:

- **AIRI** decides whether the run should start or stop, and owns your intent and memory;
- the **Upper Agent** (an LLM) makes mid-frequency decisions, like "go mine some iron first, then come back and upgrade the drill";
- the **Lower Agent** handles high-frequency control, translating that fuzzy intent into "hold `ui_right` for this second."

In one sentence: the top layer does strategy, the bottom layer does reflexes. They run on completely different timescales, and the thing connecting them is a **task**.

Which naturally raises the next question — this Lower Agent that has to be lightning fast *and* look at the screen, how do we actually build it?

## Start from the smallest unit of action

Before training anything, the word "action" needs a definition.

Inside the mod I introduced a concept called a **Quark Action**. The name is a little odd, but I like it. The conventional term for this kind of thing is "Atomic Action" — but I don't think that's right. An atom isn't the smallest thing in physics, so why should it be the endpoint here? Hence, a quark.

A Quark Action has exactly one definition: **it is a stateless, frame-scoped resolution of input, based only on the current frame and the current world state.** It does not remember what the previous frame did, and it does not care whether the task succeeded. The one for movement looks like this:

```ts
export class _MoveQuarkAction extends RefCounted {
  static resolve(current: Vector2i, target: Vector2i): string {
    if (current.x < target.x)
      return 'ui_right'
    if (current.x > target.x)
      return 'ui_left'
    if (current.y < target.y)
      return 'ui_down'
    if (current.y > target.y)
      return 'ui_up'

    return ''
  }
}
```

The input is "where am I, where do I want to go," and the output is "which direction to hold this frame, or nothing at all." It looks almost suspiciously simple for AI code — because this layer is **not supposed to be** intelligent. The intelligence lives above it.

Right now the mod has these Quark Actions: `Move`, `Pickup`, `Drop`, `Activate`, `AimLaser`, `FireLaser`. Each does one thing, and each only produces input when its condition is actually met: `Pickup` returns `keeper1_pickup` only when you are already focused on that object, and `Activate` returns `ui_select` only when you are precisely aimed at the target `Usable`.

## A task layer: borrowing HTN's clothes

A single Quark Action cannot solve something like "walk over and pick up that iron," because that spans many frames and has to react to intermediate results. So we wrap it in a `TaskExecutor`.

Its structure borrows the vocabulary of Hierarchical Task Networks (HTNs):

- a **compound task** decomposes a larger goal into an ordered list of subtasks;
- a **primitive task** resolves one Quark Action per frame;
- only the currently active primitive leaf is allowed to produce game input.

For example: `PickupTargetTask` walks toward the target ore, presses the pickup key once it is focused, and only completes when the object actually attaches to the Keeper. `DropByType` is a little more convoluted — because the game's "drop" key cannot specify which item to drop (it always drops the one closest to you), this compound task presses repeatedly until the released item is of the desired type, then picks every other item it accidentally dropped back up.

The cadence is **10 Hz** — one check every six physics frames. In other words, the Lower Agent makes 10 decisions per second, and that number matters later.

One caveat: `TaskExecutor` only *borrows* HTN's clothes. It is not a full HTN planner. There is no planning backward from the goal, no backtracking to alternative methods, no replanning. It just runs one hardcoded sequence, once.

## The low-level action classifier: Lower v0

With that structure in place, we can collect data and train the actual "hand." That is **Lower v0**, from [ADR-0005](https://github.com/proj-airi/game-playing-ai-dome-keeper/blob/main/docs/decisions/0005-train-lower-v0-with-automated-multitask-demonstrations.md).

### Why behavior cloning, not reinforcement learning

The most obvious question is: why not RL?

The answer is plain — **we don't have the compute**. I only have a single Apple M5 Pro (64 GB unified memory) and one RTX 3060 (12 GB VRAM). VPT's "train an inverse dynamics model, then train a policy" path is elegant, but at that scale it is far too heavy for this machine.

There is a much nicer trick, though: **the demonstrations don't need to be recorded by a human at all.** Because `TaskExecutor` already knows how to play, we can simply let it run and record the whole thing. So instead of being human labelers, we wrote a mod that generates demonstrations automatically in controlled scenarios.

### What the model actually sees

Lower v0 is an *action classifier*: at every decision point it predicts **which action should be held next**. Its input is three tensors:

| Input | Shape | Meaning |
| --- | --- | --- |
| RGB frames | `[10, 3, 216, 384]` | The last 10 full-view frames (oldest first) |
| Held actions | `[10, 9]` | The action held at each frame's capture (one-hot) |
| Instruction | `[9]` | 4 task slots + 5 target slots (one-hot) |

The instruction is structured and closed; only these combinations are valid:

| Task | Valid targets |
| --- | --- |
| `pickup` | `iron` / `cobalt` / `water` |
| `drop` | `iron` / `cobalt` / `water` |
| `activate` | `gadget_chamber` |
| `attack` | `monster` |

The output is nine scores for nine action classes: `ui_up`, `ui_down`, `ui_left`, `ui_right`, `ui_select`, `keeper1_pickup`, `keeper1_drop`, `dome1_fire`, and `none`.

One thing that is easy to confuse: these nine classes describe a **desired held state**, not isolated key events. Repeating a class means maintaining the currently held action, and only one class is active at a time. And `none` merely means "release whatever this controller is holding" — **it does not mean the task is complete**.

The network itself is plain: a shared ResNet-18 (ImageNet-pretrained, classification layer removed) compresses each frame into 512 visual features, so 10 frames give 5,120 features; those are concatenated with 90 held-action values and 9 instruction values, 5,219 inputs in total; then an MLP produces the 9 scores. The CNN and the MLP are trained jointly.

### Causal alignment: no peeking at the future

The easiest way to blow up training like this is to let the model quietly **peek at the future**.

So the alignment rules are strict. When predicting action `t`, the input contains only frames `F_(t-9)` through `F_t`, and held actions `H_(t-9)` through `H_t`. **The input never contains `A_t` itself, a later frame, or the outcome of the run.** At the start of a session, missing frames repeat the first frame and missing actions use `none`; windows never cross a session boundary. The collector stores each full session, and the training loader derives overlapping windows from it.

This sounds basic, but it is genuinely easy to get wrong — especially for task transitions, input releases, and cancellations, which can fall between the 10 Hz grid. So the session honestly records their real ordering and physics-frame indices instead of inventing an aligned timestamp.

## How the data got built

Collection is also fully automated: `mise run lower-v0:collect` runs eight seeded scenarios per instruction, using the existing ViKeeper fixture as the base and placing ores, monsters, and the gadget chamber at controlled positions by seed.

One detail that was genuinely annoying: during collection, the game window **must not gain focus**, otherwise it would interrupt whatever else you're doing. So recording goes through the Movie Maker flow — record to video first, then extract 384×216 RGB PNGs with ffmpeg afterward, and verify frame/action alignment. **Only sessions that complete successfully and align perfectly are promoted into the dataset**; failed, timed-out, and interrupted ones stay in `.incomplete` and never reach the training set.

What we froze in the end is the `frozen-20260911` snapshot: **166 sessions and 2,727 frames** (160 earlier sessions plus 6 new mixed-cargo Drop scenarios).

## How it's doing now

The training configuration is unremarkable: 5 epochs, batch size 8, seed 5, learning rate `1e-4`, on MPS, with a ResNet-18 plus one 256-unit hidden layer. The validation split groups sessions by scenario, at a fraction of 0.25.

That yields 2,054 training windows and 673 validation windows. The results:

- Validation action accuracy **83.95%**;
- the majority-class baseline is **26.75%** (always guessing `dome1_fire`);
- Pickup recall **80%** (48/60), Drop recall **100%** (18/18).

Looks decent? But the next numbers are the ones that matter:

- Upward movement (`ui_up`) recall is only **21.74%** (5/23);
- of the five `ui_select` labels, **not a single one was predicted correctly**.

The reason isn't hard to guess: `dome1_fire` shows up far too often in the data, so the model learned the lazy-but-high-scoring strategy of "when in doubt, fire." The rarer-but-critical actions like `ui_up` and `ui_select` it has not learned at all.

I don't want to gloss over these numbers. They describe **per-action-label accuracy, not how many waves it can survive in the game**. High accuracy does not mean it can actually play.

## This is only the beginning

To be clear: Lower v0 is an **offline policy, not a verified game controller**.

It cannot drive the game yet — how live inference connects, how actions get into the game via OS-level input, and, most importantly, how the Upper Agent should command the Lower one — all of that is still undecided. ADR-0005 only picks the **first** measurable training contract, to measure where the line between "how coarse the top layer should be" and "how fine the bottom layer should be" actually falls. It is not the final architecture.

What comes next is connecting it to the game, measuring real forward / pickup / attack success on held-out scenarios, and then looking back to see whether we drew the boundary in the right place. If it can't survive a single run, then the problem isn't the model — it's that we cut the tasks in the wrong spot.

Oh, right — the whole project is open source, from the collection mod to the training scripts, at [proj-airi/game-playing-ai-dome-keeper](https://github.com/proj-airi/game-playing-ai-dome-keeper). Come play, come complain, come help teach this little cat to play games.

See you next time.
