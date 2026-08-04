---
title: DevLog @ 2025.03.10
category: DevLog
date: 2025-03-10
---


## Deja Vu


Last Friday (March 7), I had been trying to design and conceptualize a new style for the AIRI stage UI and settings UI. The idea finally struck at the end of the dev stream.


## Daytime


Starting March 7, we began implementing the new settings UI. We made a lot of progress during this period.


People including [@LemonNekoGH](https://github.com/LemonNekoGH), [@sumimakito](https://github.com/sumimakito), [@kwaa](https://github.com/kwaa), [@luoling8192](https://github.com/luoling8192), and [@junkwarrior87](https://github.com/junkwarrior87) have all been helping with this project.


I was the first to complete the base version of the settings design; it felt like this:


![](/blog/DevLog-2025.03.10/assets/new-ui-v1.avif)


![](/blog/DevLog-2025.03.10/assets/new-ui-v1-dark.avif)


Later, [@sumimakito](https://github.com/sumimakito) came online to help me implement this dotted effect for the buttons:


![](/blog/DevLog-2025.03.10/assets/new-ui-v2.avif)


> Now we can feel more rhythm from the menu, right?!


During development, we discovered that some packages currently under the `packages/` directory are actually standalone packages that are not even in the Project AIRI workflow.


This means we can now move these packages elsewhere, simplifying the install size and build process of the main repository [airi](https://github.com/moeru-ai/airi).


> Where are we going?


Good question! We have registered [`@proj-airi`](https://github.com/proj-airi) as an organization on GitHub. Since many packages and static applications are also of no use to Moeru AI, maybe we can move these packages to [`@proj-airi`](https://github.com/proj-airi).


So we moved some packages and applications to the [`@proj-airi`](https://github.com/proj-airi) organization! You can check them out:


- https://github.com/proj-airi/webai-examples: demos for making WebGPU and related content.
- https://github.com/proj-airi/lobe-icons: a port of [Lobe Icons](https://github.com/lobehub/lobe-icons) for Iconify JSON and UnoCSS use.


Both repositories will remain open source and licensed under MIT as usual, no worries.


Later on March 8, [@junkwarrior87](https://github.com/junkwarrior87) came online and helped us create the wave animation on the stage using pure CSS!


> This is insane; I never thought it could be done!


You can learn from their commits:


- https://github.com/moeru-ai/airi/pull/54
- https://github.com/moeru-ai/airi/pull/55
- https://github.com/moeru-ai/airi/pull/65


Many thanks to [@sumimakito](https://github.com/sumimakito) and [@junkwarrior87](https://github.com/junkwarrior87) for helping fix and improve the wave animation on the stage. We truly appreciate you.


At the end of March 8, [@LemonNekoGH](https://github.com/LemonNekoGH) and [@junkwarrior87](https://github.com/junkwarrior87) actually implemented the entire stage color customization feature! (I never thought this could be done in just a few hours...)


<ThemedVideo controls muted src="/blog/DevLog-2025.03.10/assets/customizable-theme-colors.mp4" />


- https://github.com/moeru-ai/airi/pull/53
- https://github.com/moeru-ai/airi/pull/60
- https://github.com/moeru-ai/airi/pull/61
- https://github.com/moeru-ai/airi/pull/63


They even made the logo follow the custom colors 🤯.


> We made many more improvements during these three days. Maybe these excellent contributors would like to write a dedicated dev log to share their thoughts with you — stay tuned!


This is the final result we got. Give it a try!


![](/blog/DevLog-2025.03.10/assets/new-ui-v3.avif)


![](/blog/DevLog-2025.03.10/assets/new-ui-v3-dark.avif)


As always, you are welcome to contribute to us! We are absolutely open and friendly to everyone, even those unfamiliar with programming and coding!


Oh, I almost forgot... [@junkwarrior87](https://github.com/junkwarrior87) kept the feature that makes the color hue shine across the entire RGB spectrum, previously demonstrated by [@LemonNekoGH](https://github.com/LemonNekoGH). It is called "I want it dynamic!" (You can think of it as an **RGB ON** feature 😂):


- https://github.com/moeru-ai/airi/pull/64


## Dev Stream


I have been busy these days 😭, so there was no dev stream.


That's it for today's DevLog. Thank you to everyone who joined the DevStream and stayed with us to the very end. See you tomorrow.

