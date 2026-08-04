---
title: DevLog @ 2026.02.16
category: DevLog
date: 2026-02-16
excerpt: |
  Sharing some progress by LemonNeko on the Dome Keeper game direction.
---


Happy New Year's Eve! This is [@LemonNekoGH](https://github.com/LemonNekoGH)~ Let me write the last DevLog before the Spring Festival!


## Retrospective


In last year's [DevLog](../DevLog-2025.08.26/index.md), we shared some progress on the pure-vision direction of `airi-factorio`. Today I want to share our progress in the Dome Keeper game direction...


Wait, LemonNeko? Why aren't you continuing with `airi-factorio`?


Actually, I chickened out. Because Factorio is too free and too complex — I really could not handle it — so I turned to [Dome Keeper](https://store.steampowered.com/app/1637320/Dome_Keeper/), a relatively simpler game.


![Dome Keeper](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1637320/1ebdc10a01b4d0cf0999ae6021ca171a6f816c50/header_schinese.jpg?t=1770751169)


So what have I done so far?


1. Wrote a mod to collect data. After installing the mod, you can find a `Start YOLO Data Collection` button in the pause menu; click it to start collecting.


    /blog/DevLog-2026.02.16/assets/add-button-to-menu.png


2. Simply collected a bit of data.


    /blog/DevLog-2026.02.16/assets/some-collected-data.png


Seems not much? But I have already hit quite a few pitfalls and detailed issues, so I need to write a DevLog to record them.


### Details


- Organizing the repository structure.


    Developing a Dome Keeper mod requires decompiling the game, but we cannot publish the source code, so we needed to think about the repository structure. I put the decompiled game into an `external` folder at the repository root, added the whole folder to `.gitignore`, and linked the mod code into the game source directory.


- Sampling strategy.


    Our current sampling strategy captures one frame every 0.5s. But often there may be no target in the frame at all, resulting in an excessive number of "negative samples". The data volume looks bigger, but the effective information density drops.


    Later we changed the rule: only when an `enemy` or `ore_*` appears is it considered a "frame with targets", and **we must first collect 5 frames with targets before allowing 1 frame without targets**. This keeps some background while not diluting the training set too much.


- UI overlay causing "mislabeling".


    If the pause menu or the upgrade panel (TechTree) was open during collection, the screen was covered by UI, but our labels still marked ores and enemies. This problem is very subtle, because you cannot tell from the label txt files; you only notice it during visualization.


    Later we used a simple approach: add a `group` tag to PauseMenu / TechTreePopup, and skip collection entirely whenever a visible node is detected in that group.


- Inconsistent coordinate systems causing overall offset.


    This was the most headache-inducing pitfall: all target bboxes were offset as a whole, but in the same direction, looking like "the overall scaling was wrong".


    The reason is that the **logical size of the view** and the **real texture pixel size** are inconsistent. We previously used `viewport.get_visible_rect().size` to compute bboxes, but screenshots use the texture's pixel size, causing the coordinate spaces to mismatch. The fix: first scale the bboxes from view coordinates to image pixel coordinates, then apply the letterbox scaling and offset.


- Letterbox affecting labels.


    We normalized the output to `640×640` with centered padding (gray `114/255`). If the bboxes are not transformed the same way, the labels will definitely be misaligned.


    So it became two steps: first compute the bbox scaling + offset, and finally normalize to `640×640`.


- Dataset split strategy.


    Previously I wanted to split by session, but a single run can be very long, and you can also play multiple runs in the same session. So I switched to splitting by time — **segments of 30 seconds** — and cyclically assigning them to `train/val/test` in a **4/1/1** ratio. This way, three minutes covers one full round, and the validation cost is much lower.


- Performance and jank.


    `Image.resize()` and `save_png()` are both CPU/IO-intensive operations; too high a sampling frequency causes jank. We try to reduce IO pressure by "reducing frames without targets" rather than jumping straight to threading.


### Summary


So far, we have completed a closed loop that **collects stably and validates quickly**:


collect → filter out targetless frames → auto-split → auto-generate `data.yaml` → train directly.


The training logs also show the effect:


the ore classes (ore_*) have higher mAP, indicating the collection pipeline is correct;


`dome` / `enemy` / `player` are still scarce and need more samples later.


## Next Steps


Remember the pure-vision Playground in the `airi-factorio` repository? I plan to extend it to support Dome Keeper, so the whole `proj-airi` organization can reuse it. Also, we need more samples, especially for the `dome`, `enemy`, and `player` classes.


Let's look forward to the next progress! Oh, by the way, the mod code is already open source — everyone is welcome to [play with it](https://github.com/proj-airi/game-playing-ai-dome-keeper)!


Happy New Year's Eve!

