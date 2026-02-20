---
title: DevLog @ 2026.02.16
category: DevLog
date: 2026-02-16
excerpt: |
  Sharing LemonNeko’s recent progress on the Dome Keeper direction.
---

Happy Lunar New Year’s Eve! This is [@LemonNekoGH](https://github.com/LemonNekoGH) — I’ll be writing the last DevLog before Spring Festival.

## Recap

In last year’s [DevLog](../DevLog-2025.08.26/index.md), we shared progress on the pure‑vision direction of `airi-factorio`. Today I want to share what we’ve been doing on the Dome Keeper direction.

Wait, LemonNeko? Why not keep going on `airi-factorio`?

Honestly, I chickened out — Factorio is too open‑ended and complex for me to control, so I switched to [Dome Keeper](https://store.steampowered.com/app/1637320/Dome_Keeper/), a relatively simpler game.

![Dome Keeper](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1637320/334439c379674a719de3f12028f76977aeb176c6/header.jpg?t=1770751169)

So what have we done so far?

1. Wrote a mod to collect data. After installing the mod, you’ll see a `Start YOLO Data Collection` button in the pause menu. Click it to start collecting.

    ![add-button-to-menu](./assets/add-button-to-menu.png)

2. Collected a small amount of data.

    ![some-collected-data](./assets/some-collected-data.png)

It’s not much yet, but we already hit quite a few pitfalls and details worth recording — hence this DevLog.

### Details

- Repository structure.

    Developing a Dome Keeper mod requires decompiling the game, but we cannot publish the source code. So we had to design the repo structure carefully. I put the decompiled game under the top‑level `external/` folder and ignored it in `.gitignore`, while the mod code is linked into the game’s source directory.

- Sampling strategy.

    Our initial strategy was to capture one frame every 0.5s, but often there are no targets in the frame. That produced too many “negative samples” — the dataset size grows, but the effective information density drops.

    We later changed the rule: only frames containing `enemy` or `ore_*` count as “target frames”, and **we only allow 1 no‑target frame after 5 target frames**. This keeps a bit of background while avoiding a diluted dataset.

- UI overlay causing “wrong labels”.

    When the pause menu or upgrade panel (TechTree) is open, the UI covers the scene, but our labels still mark ores and enemies. This is tricky to notice because the label txt looks normal, and you only see the issue during visualization.

    We solved it by tagging PauseMenu / TechTreePopup with a group and skipping capture whenever a visible node from that group exists.

- Coordinate mismatch caused global offset.

    This was the most painful bug: every bbox was offset in the same direction, like the entire image was scaled incorrectly.

    The root cause was a mismatch between the **logical view size** and the **actual texture pixel size**. We used `viewport.get_visible_rect().size` for bbox calculation, but the screenshot was taken from the texture. The fix was to scale bboxes from view‑space to image‑space first, then apply the letterbox scale + offset.

- Letterbox affects labels.

    We normalize output to `640×640` and add centered padding (gray `114/255`). Without applying the same transform to bboxes, labels will be wrong.

    So the fix is a two‑step transform: scale + offset, then normalize to `640×640`.

- Dataset split strategy.

    We initially wanted to split by session, but a single session can include multiple runs and can be quite long. We switched to time‑based splits: **30 seconds per segment**, cycling **4/1/1** into `train/val/test`. That gives a full split cycle in 3 minutes, which is much cheaper for validation.

- Performance and stutter.

    `Image.resize()` and `save_png()` are CPU/IO heavy. Capturing too frequently causes stutters. We prefer reducing no‑target frames rather than jumping straight to multithreading.

### Summary

At this point, we have a **stable and fast‑to‑validate pipeline**:
Capture → filter negatives → auto split → auto generate `data.yaml` → train directly.

The training logs already show progress:
ore classes (ore_*) achieve decent mAP, which means the pipeline is correct;
dome / enemy / player are still sparse and need more samples.

## Next Steps

Remember the pure‑vision Playground in the `airi-factorio` repo? I plan to extend it for Dome Keeper so the entire `proj-airi` org can reuse it. We also need more samples, especially for `dome`, `enemy`, and `player`.

Stay tuned for the next update. Oh — the mod code is already open‑sourced, feel free to [try it out](https://github.com/proj-airi/game-playing-ai-dome-keeper)!

Happy Lunar New Year’s Eve!
