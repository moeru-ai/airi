---
title: DevLog @ 2025.03.06
category: DevLog
date: 2025-03-06
---

## Dejavu

Previous day, I was on DevStream to show the progress of making the
fundamental animations and transitions for AIRI.

The goal is to port and adapt the amazing work done by [@yui540](https://yui540.com/)
into a reusable Vue component for any of the Vue project to be able to use it.

> Details of yui540 and referenced libraries and work already were included
> at the newly deployed documentation site at
> [https://airi.build/references/design-guidelines/resources/](../references/design-guidelines/resources/).

The result is quite good, already deployed to
[https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/).

![](./assets/animation-transitions.gif)

> And also, from now on, all of the playgrounds of each packages will use
> "proj-airi" + "${subDirectory}" + "$｛packageName}" pattern for the Netlify
> deployment.

While the goal of previous day was trying to split the implementation of
CSS into Vue component, the actual part for reusable wasn't done yet,
I'll still need to design a workflow and mechanism that extensible and
flexible for other pages to use.

## Day time

I experimented with the [`definePage`](https://uvr.esm.is/guide/extending-routes.html#definepage)
macro hook from [`unplugin-vue-router`](https://github.com/posva/unplugin-vue-router),
found it quite worked well for my scenario and decided the path to follow
on.

And I ported 3 extra new animation transitions from
[https://cowardly-witch.netlify.app/](https://cowardly-witch.netlify.app/),
they were already available on
[https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/) .

I deployed the official documentation site onto [https://airi.build](https://airi.build) yesterday,
[@kwaa](https://github.com/kwaa) commented that he would suggest me try
the `https://airi.more.ai/docs` approach instead, ~~but I couldn't figure out~~
~~a way to make a 200 redirect proxy for /docs.~~

EDIT: Finally learned. How to do this, will include the details in the future
DevLogs.

I experimented it a little with like ten commits fighting against CI/CD
pipeline (yes fighting against again), but still not made it work.

Later on this day, I researched some of the technologies and
[open source repositories](https://github.com/deepseek-ai/open-infra-index)
that DeepSeek team has released for a week ago, as well as the so called
ByteDance released [LLM gateway AIBrix](https://github.com/vllm-project/aibrix).
And was researching whether the newly released and announced Phi-4-mini was
capable of porting for AIRI to use, good news is,
[Phi-4-mini](https://techcommunity.microsoft.com/blog/educatordeveloperblog/welcome-to-the-new-phi-4-models---microsoft-phi-4-mini--phi-4-multimodal/4386037)
included the function calling abilities, that means we can finally build our
agents with pre-trained support.

## DevStream

I contacted another artist afternoon, saying that I am willing to pay
for a customized pixel art commission for me to use it as an avatar
for my next coming update accounts.

~~Yes I asked the artist to put some Easter eggs inside haha, good luck you folks finding it.~~

The layout and setup of the live stream has been updated 😻 It was designed
by myself almost a year ago, but it still looks great and feel calm when
looking at it. Please leave comments in the chat for any suggestions, really
appreciated.

![](./assets/live-stream-layout-update.avif)

During the DevStream of today, I was trying to integrate the stage transition
animation component into AIRI's website main stage, it wasn't that smooth,
I found several bugs in my previous design for the animation component, good
news is that I already fixed them, and the new animation transition is available
already at our official deployment at [https://airi.moeru.ai](https://airi.moeru.ai).

I finally made the decision that coming from some random thoughts about the module
configuration UI and settings page. They were all implemented, and went on live,
should provide a better feeling when tweaking the settings now, I hope you
like it.

After I get off the stream and finally get on hands playing the result on my
phone, while it does work on desktop and tablet devices, I found that I
accidentally break the animation on mobile devices, will get this fixed tomorrow
daytime 😹.

That's all for today's DevLog, thank you to everyone that joined the DevStream
and stayed with me until the end. I'll see you all tomorrow.
