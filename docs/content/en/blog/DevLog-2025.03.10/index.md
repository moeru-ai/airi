---
title: DevLog @ 2025.03.10
category: DevLog
date: 2025-03-10
---

## Dejavu

In the last Friday (March 7th), I was trying to design and manipulate a new
feeling of the AIRI stage UI and settings UI, the idea finally appears
in my mind at the ending of the DevStream.

## Day time

From the March 7th, we started to implement the new settings UI. We made a lot of
progress during this period.

Including [@LemonNekoGH](https://github.com/LemonNekoGH),
[@sumimakito](https://github.com/sumimakito),
[@kwaa](https://github.com/kwaa),
[@luoling8192](https://github.com/luoling8192), and
[@junkwarrior87](https://github.com/junkwarrior87) were helping on this.

It was me that first finished the basic version of the settings' design, it feels
like this:

![](./assets/new-ui-v1.avif)

![](./assets/new-ui-v1-dark.avif)

And later on [@sumimakito](https://github.com/sumimakito) went up online helped me
implementing this dotted effect for the buttons:

![](./assets/new-ui-v2.avif)

> We can now feels more beats from the menu, isn't it?!

During the development, we found that some of the packages that currently living
under the `packages/` directory are actually independent packages that were not
even in the workflow of Project AIRI.

This means we can now move them out to another place to simplify the installation
sizes and building process for the primary repository
[airi](https://github.com/moeru-ai/airi).

> Where do we go?

Nice question! We got [`@proj-airi`](https://github.com/proj-airi) already
registered on GitHub as a organization, since many of the packages and static
applications were not useful for Moeru AI too, perhaps we can move those
packages to [`@proj-airi`](https://github.com/proj-airi).

So, we moved some of the packages and applications into
[`@proj-airi`](https://github.com/proj-airi) organization! You can check them out:

- https://github.com/proj-airi/webai-examples : meant to make demos with WebGPU and
  related stuff.
- https://github.com/proj-airi/lobe-icons : port of
  [Lobe Icons](https://github.com/lobehub/lobe-icons) for Iconify JSON and UnoCSS use.

Those two repository will remain open source and licensed with MIT as usual, don't
worry.

Later on March 8th, [@junkwarrior87](https://github.com/junkwarrior87) went
online and helped us to make the wave animation on stage in pure CSS!

> THIS IS INSANE, I NEVER THOUGHT THIS WAS POSSIBLE.

You can go through the commits to learn from him/her:

- https://github.com/moeru-ai/airi/pull/54
- https://github.com/moeru-ai/airi/pull/55
- https://github.com/moeru-ai/airi/pull/65

Much appreciated to [@sumimakito](https://github.com/sumimakito) and
[@junkwarrior87](https://github.com/junkwarrior87) on helping fixing and improving the
wave animation on stage, really grateful to you folks.

At the end of March 8th, [@LemonNekoGH](https://github.com/LemonNekoGH) and
[@junkwarrior87](https://github.com/junkwarrior87) made it possible to have customizable
colors for the entire stage! (I never thought this could be done within hours...)

<ThemedVideo controls muted src="./assets/customizable-theme-colors.mp4" />

- https://github.com/moeru-ai/airi/pull/53
- https://github.com/moeru-ai/airi/pull/60
- https://github.com/moeru-ai/airi/pull/61
- https://github.com/moeru-ai/airi/pull/63

They even made it possible for the logo to follow the customizable colors 🤯.

> We made many more improvements during these three days, perhaps the wonderful
> contributors would like to write a dedicated DevLog to share some thoughts with
> you, stay tuned!

This was the final result we got, give it a try!

![](./assets/new-ui-v3.avif)

![](./assets/new-ui-v3-dark.avif)

And as always, feel free to come and contribute to us! We are absolutely here open and
friendly to everyone, even for those not familiar with programming and coding!

Oh, I almost missed it... [@junkwarrior87](https://github.com/junkwarrior87)
kept the feature that making the color hue shines through the entire RGB spectrum
that demonstrated previously by [@LemonNekoGH](https://github.com/LemonNekoGH), it's
called "I Want It Dynamic!" (You can think of this as a **RGB ON** feature 😂):

- https://github.com/moeru-ai/airi/pull/64

## DevStream

I was quite busy these days 😭, so there wasn't any DevStream happening.

That's all for today's DevLog, thank you to everyone that joined the DevStream
and stayed with me until the end. I'll see you all tomorrow.
