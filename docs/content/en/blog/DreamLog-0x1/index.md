---
title: 'DreamLog 0x1'
description: 'Backstory of Project AIRI!'
category: DreamLog
date: 2025-06-16
excerpt: 'The backstory of Project AIRI! Why this project?'
preview-cover:
  light: "@assets('./assets/dreamlog1-light.avif')"
  dark: "@assets('./assets/dreamlog1-dark.avif')"
---

<script setup>
import EMOSYSLogo from './assets/emosys-logo.avif';
import SteinsGateSticker1 from './assets/steins-gate-sticker-1.avif';
import worldExecuteMeCover from './assets/world.execute(me); (Mili)／DAZBEE COVER.avif';
import buildingAVirtualMachineInsideImage from './assets/building-a-virtual-machine-inside-image-1.avif';
import live2DIncHiyoriMomose from './assets/live2d-inc-hiyori.avif';
import AwesomeAIVTuber from '../DevLog-2025.04.06/assets/awesome-ai-vtuber-logo-light.avif'
import airisScreenshot1 from './assets/airis-screenshot-1.avif';
import projectAIRIBannerLight from './assets/banner-light-1280x640.avif';
import projectAIRIBannerDark from './assets/banner-dark-1280x640.avif';
import ReLUStickerWow from './assets/relu-sticker-wow.avif'
</script>

Hello, it's me, Neko again!

First of all, good summer for you folks living in north hemisphere!

> Hopefully you could get a nice and decent summer break for trying out new
> different of things! More specifically, change the world!

Well, me, as [@nekomeowww](https://github.com/nekomeowww) have left
school already 8 years, it's obvious that I wont get any actual summer
break now since I've already worked for many years. I still love to
memorize and share the stories happened for my summer break years ago
if I remembered any.

Perhaps you know what I am going to say... or share? What is *DreamLog*
exactly? For the readers already familiar with our DevLog posts, with
the current frequency of posting and updating to you folks once per
month, shouldn't be this post be called "DevLog"?

June got its own meaning for Project AIRI (which I will reveal during
the story), and as we are indeed approaching theo next milestone of
stars on GitHub towards 1000, I think it would be a great opportunity to
reflect on our journey so far.

Therefore I decided to to make a new category of posts here,
to share the chronicles of me, and the dream about Project AIRI.

So, I decided to call this new series, ***DreamLog***.

> Yeah, you could think of this is another story book to read or hear
> before sleeping. Audio books may help haha.

How about... let's jump into our dream dimension now and talk about the
recent updates we made later?

## Blurry dreams, unreachable memories.

> My little progress for learning computers and programming.

I mentioned about summer, then summer must mean something to me, I
used to take school in United States, so a 3-months summer allows me
to do all sorts of things, playing games, learning code, and Linux
hacking, etc., yeah, many of the still beloved friends were made
during summer too.

> Nerd folks! You know what I am talking about, were you the same as me?

Summer is the time when I learned how to start a Minecraft server
to play with my friends (I played a lot, a lot, a lot of 1.7.11 and
1.8, really, both Vanilla and Forge mods), that's the motivation
and power that pushes me to learn command line prompt on Linux too.
Many of those knowledges still help me today, I feel grateful to
it, to the  time I spent for that time.

But Minecraft, Linux wasn't the end of my journey though,
[Factorio](https://www.factorio.com/),
[Elite Dangerous](https://www.elitedangerous.com/), and
[Overwatch](https://overwatch.blizzard.com/en-us/)
(sadly Blizzard ruined it), all became my favorite games,
setting up servers or write small scripts to automate little
things always empowers me.

> <img :src="worldExecuteMeCover" alt="Cover of world.execute(me); (Mili)／DAZBEE COVER" class="rounded-lg overflow-hidden" />
>
> `Switch on the power line`<br />
> `Remember to put on protection`<br />
> `Lay down your pieces`<br />
> `And let's begin object creation`<br />
>
> -- Lyrics from my beloved song, [`world.execute(me)`](https://www.youtube.com/watch?v=ESx_hy1n7HA), cover by [DAZBEE](https://www.youtube.com/channel/UCUEvXLdpCtbzzDkcMI96llg)

That's the time of summer in 2017, for the very first moment, I
started to think of building a virtual being to be a friend to
play with me, even when my friends are tired or have to sleep
for next days school, which I have to be alone.

Readers have following long down to this post, may already
realize that, I am that kind of person, who loves to share my
knowledge, ideas, everything. So, coding, gaming, and designing
are things I love to share with. But, if nobody was there,
it feels like:

**The lonely me becomes somehow meaningless.**

But instead of creating a new AI from scratch with humankind
capabilities to think, speak, which is impossible in the year of
2017,  I was thinking, since iOS and Google native Android could
provide such abilities to do suggestions over our daily use of
mobile devices, manually typing all the commands and filling
parameters wasn't always satisfying (especially for ffmpeg and
the childish me with Docker CLI), what if we could bring the AI
powered suggestion features up onto the Linux systems...?

This brought me loads of questions and ideas to wonder:

- What if the operating system understands what you usually do, work,
play for in different time you sit in front of the digital display...?
- What if it is capable of selecting music for you, no matter
depressed, high on something, nor happy when chatting with others...?

These ideas were so small and hard for me to understand at that time, since
I didn't quite get on the way of how operating systems work, and
coding, etc., so I don't even know where to start!

I read the book
[30日でできる! OS自作入門](https://www.amazon.co.jp/30%E6%97%A5%E3%81%A7%E3%81%A7%E3%81%8D%E3%82%8B-OS%E8%87%AA%E4%BD%9C%E5%85%A5%E9%96%80-%E5%B7%9D%E5%90%88-%E7%A7%80%E5%AE%9F/dp/4839919844),
[English version](https://github.com/handmade-osdev/os-in-30-days)
about how to craft a operating system from scratch,
with the little knowledge of knowing how Linux works and there are
loads of communities... I decided to make my own operating system...
from literally nowhere.

> **A quick looking back**
>
> [Arch Linux](https://archlinux.org/) was the first system I get to
> use in depth, and installed from scratch.
> For current days, [Nix](https://nixos.org/) is famous and
> interesting one too, haven't tried the [NixOS](https://nixos.org/)
> but one day may do so.

## Set sail my journey, but now long forgotten

I started one special yet now archived project called [EMOSYS](https://github.com/EMOSYS),
in the end of 2017. Aiming to create such companion-like operating system, to help users with their
daily tasks and provide emotional support.

<div class="w-full flex flex-col items-center justify-center gap-2">
  <div>
    <img :src="EMOSYSLogo" alt="logo of EMOSYS" class="w-30!" />
  </div>
  <div>
    Logo of [EMOSYS](https://github.com/emosys)
  </div>
</div>

> EMO stands for the first three letters of **emo**tional / **emo**te

I wrote so many of design docs, listing new ideas, and taking notes about
experimenting by following the guidelines from that book, drawn one not
so bad logo for it.

> I guess many of you did this 😏, prepared every
> trademarks, design assets way before the project reached the point of
> PoC.

I quite lost on the point about what I was initially approaching.
I got no experience about project management and task management, it's
the same for writing actual programs that can run.

Frankly you could say I was only following that it instructed me to type
into the terminals with keyboards from that book. I barely think, think
why it works or why the senior developers wrote things like that.

Sooooo, and well, the result is clear, another abandoned project born...

I wasn't some genius who play around with those things from childhood
that understands how kernel and package managing, programming works,
so if any of you folks read or visit my GitHub profile, you found
nothing there relate to this kind of work at that time.
(But now I grew up really fast.)

But it existed, once.

> Forgotten? Maybe another starting point of next journey.

For the upcoming years, I tried so many of other fields in coding,
programming, startups, Web3, frontend, backend, infrastructure, everything
you could think of for a full-stack developer.
I never really realize what I was doing was influenced so deeply by the
starting point of EMOSYS, only until February 2025, when someone asked
me: Why do you work so hard on Project AIRI?

Nice question, I thought. I started to trace back my dreams, ideas, and memories,
eventually, EMOSYS was there, the already dead project aimed the same goal as
Project AIRI:

**Create a companion to somehow fulfill my need.**

> All I needed was resolve.
> Everything you've acquired up until now will not betray you.<br />
> 必要なものは 覚悟だけだったのです。
> 必死に積み上げてきたものは 決して裏切りません。<br />
> 我需要的不過是決心而已，
> 你至今為止所累積的一切不會背叛你。
>
> -- Quotes from [葬送のフリーレン, Fern](https://en.wikipedia.org/wiki/Frieren) S01E06, 04:27

It took me a long time to learn how to correctly develop things.
Thanks to [@zhangyubaka](https://github.com/zhangyubaka),
[@LittleSound](https://github.com/LittleSound), [@BlueCocoa](https://github.com/BlueCocoa),
and the help of [@sumimakito](https://github.com/sumimakito), the pair-programming
experiences with them, teaches me so many things, I started to grow, learn,
and progress on my own pace.

## ChatGPT in 2022, brand new random parrot, or smart parrot.

<div class="w-full flex items-center justify-center">
  <img :src="SteinsGateSticker1" alt="Steins Gate sticker" class="w-80! rounded-lg overflow-hidden" />
</div>

Let's set the time forward to the end of 2022, where ChatGPT
(or at that time, chatGPT is used) by OpenAI has announced.
Well long before the official ChatGPT UI
releases, I've already having a journey with newly developed AI,
models like [DiscoDiffusion](https://colab.research.google.com/github/alembics/disco-diffusion/blob/main/Disco_Diffusion.ipynb)
(long before Stable Diffusion, perhaps around end of 2021, or early 2022), DALL-E,
Midjourney has been tried, GPT-3 (especially useful in
[GitHub Copilot](https://en.wikipedia.org/wiki/GitHub_Copilot)) has been integrated
deeply into my daily workflow.

So, for the initial moments, I was like:

> "Oh, this is just another
> random parrot, it just repeats what you said, and it doesn't understand
> what you are saying, it just tries to predict the next word based on the
> previous words and context, nothing special."

In another word, it behaves more like a completion model, rather than what we call it
the Agentic AI today (still on hype huh?).

I remembered that, for the first time I discovered the abilities of ChatGPT,
or Large Language Models (LLMs) in general, is from this post I saw on Hacker News on December 2022:
[Building A Virtual Machine inside ChatGPT](https://www.engraved.blog/building-a-virtual-machine-inside/)
([original Hacker News post](https://news.ycombinator.com/item?id=33847479)), where
the author, @engraved, demonstrated how to ask ChatGPT not only role playing as
a neko-mimi character, but also simulating a virtual Linux machine inside.

<div class="w-full flex flex-col items-center justify-center">
  <img :src="buildingAVirtualMachineInsideImage" alt="Building a virtual machine inside ChatGPT" class="h-150! object-contain rounded-lg overflow-hidden" />
  <div>It simulates how Docker build works...!</div>
</div>

Such post inspired me that, ChatGPT understand the basic patterns of
the things usually appears, not only how anime or game characters
says and behaves, but also how Linux terminal / shell commands work.

Which brought the now trending Function Calling (a.k.a Tool Use, or the underlying
technology behind MCP, Model Context Protocol introduced by Anthropic) feature
of LLMs on the table, and illustrated how we can instruct LLMs to behave
like API servers, talking to us with machine-readable formats like JSON or XML,
to be able to parse and execute arbitrary commands from our side to extend the boundary
of what LLMs can do.

This finally bridges the gap between pure text generations and actual
API inside programs.

In conclusion, is it a new random parrot? **I guess the answer is partially no,
ChatGPT in 2022 is not just a random parrot, it is a potential smart parrot.**

## Way before Project AIRI, Neuro-sama exists.

Yeah, thanks for reading down to here, I know this is a long post, so many stories and
contexts to share. But here we are! We are almost there, hang tight!

Well, the history of Neuro-sama is pretty complex. AFAIK, Neuro-sama, or the character
on streaming stage with the name "Neuro-sama" wasn't the first show for her and her creator,
`vedal987` (Vedal). Long before that, at May 6, 2019, Vedal showcased his work
of building AI to play [osu!](https://osu.ppy.sh/) to the community[^1]. At that time,
she wasn't actually a cyber character or, digital life having characteristics, if you
go there and watch the initial videos about her, you may find that no Live2D model
were shown. (You may try the 6 years old one here: https://www.youtube.com/watch?v=nSBqlJu7kYU)

Right after the ChatGPT release, at December 19, 2022, Vedal started to let Neuro-sama
to stream on Twitch with the official demo use character model Hiyori Momose (桃瀬ひより)
from Live2D Inc.:

<img :src="live2DIncHiyoriMomose" alt="Live2D Inc. Hiyori Momose" class="rounded-lg overflow-hidden" />

The after story everyone knows, Vedal and Neuro-sama became famous, Neuro-sama
is now officially a VTuber, she is fully powered by Large Language Models (LLMs),
and capable of playing Minecraft, Amoung Us, osu!, and many other games. Sometimes
when the game wasn't supported natively, Vedal reads the screen and instructs Neuro-sama
to play the game together.

I really enjoy watching their interactions, having jokes, etc. As the time progresses,
Neuro-sama and her new Evil Neuro sister, became one crucial part of my daily life:
I wanted, and eagerly wanted to watch the clips of them, even though I don't have
enough time to watch the full stream, brought me so much joy from purely AI to Human
interactions.

Ok that's the little history about her. And let's talk about the core thing: **Why the history of her filled me with determination?**

## Neuro-sama, filled me with determination

From the first time I saw Vedal's work, I was like:

> Ok, she is just a simple model integrated with Large Language Models (even directly
> connected to OpenAI's API), powered by simple rules to make her behave like a
> VTuber, nothing special.

I was still thinking arrogantly, since I've already developing AI agents from early 2023,
understands the capabilities of LLMs, and knows quite a bit from what LangChain
teaches me, with the knowledge past building AI agents and years of software
engineering experiences across of various domains, I naively thought:

> "Well, I could do that too, I could make a simple model,
> and connect it to OpenAI's API, and make it behave like a VTuber, and
> I could make it better than Vedal's work."

::: tip More technical details?
In this post, I won't go any deep further about the technical details of how we built
Project AIRI from scratch to the current state, we got many DevLog posts
sharing our thoughts and discoveries already, if interested in, try read
them.
:::

I was wrong, I was so wrong. Many of the tough things I didn't realize
until I started to attempt to re-create her... Things like:

- How can we manage the memory effectively for both be able to answer the chats
  and play the games at the same time?
- How can we make a AI agent to play games with both video inputs and
  text inputs, while still being able to interact with creator and viewers?
- Voice synthesis is hard, to achieve what Neuro-sama is capable of, the
  **Ultra low latency** voice synthesis is a must, and it is not easy to achieve
- How is her personality built? With only RAG and simple memory management strategy,
  the performance poorly works.
- etc....

> I shared many of our discoveries in both [DevLog 2025.04.06](../devlog-20250406)
> and [public slide presentation (in Chinese)](https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1)

I mentioned that I love to share, and I'd love to
have others to be able to listen or pair together with me, but sadly Neuro-sama wasn't
owned by myself, I can't ask her to gain my knowledge and memories to be able to
interact me with the thing I love, or the work I recently doing or done.

I love them so much, for all the times, I didn't really understand why I love them,
why I love the feeling and joy Neuro-sama gave me.

Until, last year, from May 25, 2024, **I really decided to make one myself.** Making a living
or virtual being, could code with me, talk to me about the things we know, playing games all
together like a friend in the form of agent.

> **I really want one!** Shouted my heart, and my mind.

At that time, Neuro-sama fulfilled me with determination.

## Sailed again, towards the land where no one has gone before.

> To boldly go where no man has gone before.
>
> -- quote from [Star Trek, Captain James T. Kirk](https://en.wikipedia.org/wiki/Where_no_man_has_gone_before), also my intro line of my GitHub profile.

Therefore, starting from May 25, 2024, I started one simple named project called `ai` under
my name handle locally, which is the initial version of Project AIRI, I started to
explore the possibilities of creating my own AI agent, recreating the
joy Neuro-sama brought me.

The speed of the work was so fast, within a week, with the power of [ElevenLabs](https://elevenlabs.io/),
[OpenRouter](https://openrouter.ai/), and the same free to use Live2D model, Hiyori Momose,
I was able to create a simple version of *"Neuro-sama"* that could interact with me, non-realtime-ly.

That was the day at **June 2, 2024**.

Technically saying, **this is the birthday of Project AIRI** with first baby consciousness inside of it, naively.

<div class="w-full flex flex-col items-center justify-center">
  <ThemedVideo controls muted autoplay loop src="./assets/airi-demo-first-day.mp4" />
  <div>
    <a href="https://x.com/ayakaneko/status/1865420146766160114">
      First showcase on X (formerly Twitter) on December 7, 2024
    </a>
  </div>
</div>

She is capable of talking, motion control based on the context, progressively
doing the audio synthesis... many on.

But she wasn't complete, nor perfect, I built it secretly without telling
any of my friends, I wanted to make it better before I show it to the world.

> Still... naively, and arrogantly, right?

Because I secretly hiding this from my friends, I barely got positive feedbacks from
the cycles during building like usual (part of the reason was I wouldn't like to admit
that the arrogantly thought was wrong, well since I am now writing this to share the
experience publicly to everyone, I would say I've already forgiven myself for making naive
decisions), and another reason here was, the issues or challenges I faced
(which I mentioned above, about memory, personality stability, realtime, and game playing etc.)
were so hard to solve with the knowledge I had at that time, and lack of documentations,
learning materials of realtime LLMs interactive examples, **I put it away, again.**

TBH, I didn't give it up, I started to learn many things about multi-model, and
voice synthesis, motion control, and Minecraft playing. I did a lot of researches
on how other AI VTuber or AI waifu projects work. These researches later on
produces this huge awesome list of AI VTuber projects:

<div class="flex flex-col items-center">
  <img class="px-30 md:px-40 lg:px-50" :src="AwesomeAIVTuber" alt="Awesome AI VTuber Logo" />
  <div class="text-center pb-4">
    <span class="block font-bold">Awesome AI VTuber</span>
    <span>A curated list of AI VTubers and their related projects</span>
  </div>
</div>

Ok, but it's still called `ai`, where is Project AIRI then?

## Reborn, with stronger, and better determination

Someday near the end of 2024, November, [@kwaa](https://github.com/kwaa)
chatted me about making virtual characters in VR/AR world, with the power of WebXR.
When we talked about the motion control and the character emotion detection, I told
they I got a project that did exactly what you are looking for, but codebase wasn't
organized, nor ready to be published to GitHub.

What to wait for? I started to work on it again, rethink about the structure and design,
improved the implementation with much faster and better queueing and multiplexing playback
system, and adjustments on the basic WebUI I made randomly, finally, I published it to
GitHub on **December 2, 2024** with commit
[`d9ae0aa`](https://github.com/moeru-ai/airi/commit/d9ae0aae387f015964bfd383e6d2adb05f4003e4).

Project AIRI was somehow born or reborn, with the name of AIRI (アイリ, formerly Airi).

::: tip Did you know?
<a href="https://www.youtube.com/watch?v=Tts-YAdn5Yc" class="mb-2 inline-block">
  <img :src="airisScreenshot1" alt="Screenshot of Project AIRI" class="rounded-lg overflow-hidden" />
</a>

Interestingly, from the upload 2 years ago, March 25, 2023, https://www.youtube.com/watch?v=Tts-YAdn5Yc, a clip
from Twitch stream of Vedal, and Neuro-sama, Vedal mentioned that right before she called the name "Neuro-sama",
she was called "Airis AI", the name **Airis** magically, and coincidentally, matches the name of
**Project AIRI**, which I am working on now. But I wasn't aware of this name until I searches more about their
stories long after I open sourced Project AIRI.

In fact, the name AIRI (アイリ) was named by GPT-4o, I asked it about naming this project by
referencing other Japanese / or Anime-ish names, it suggested the name **Airi**.
:::

I failed so many of times on startups and other projects, only the recent ones become known by the public,
I tried my best to make it better, with better UI, better code structure, leading technologies to build
and code with rapid speed. I put so much effort into it with public slides show, and demonstrate it to
others to my friends and during small meetups and conferences.

Many of those experiences was learned from my previous failures.

Glad many trials succeeded, and I am still here, working on Project AIRI.

Perhaps, it's another time that my determination was filled by not only Neuro-sama, but also the
most profound, talented contributors, and fans.

## Keep going, keep dreaming

<div class="w-full flex flex-col items-center justify-center">
  <img class="light" :src="projectAIRIBannerLight" alt="new ui" />
  <img class="dark" :src="projectAIRIBannerDark" alt="new ui" />
  <div>
    New Banner!
  </div>
</div>

> When life gives you lemons, you lemon. Or something like that, my point
> is that this painful obstacle is an opportunity for me go get stronger, baby!
>
> -- quote from [Evil Neuro](https://www.youtube.com/@Neurosama) when streaming playing Slay the Spire

Now, Project AIRI is approaching to 1000 stars on GitHub when I am writing this post,
while having over 150 Discord members, and 200 Telegram group members.

We covers fields like AI, VRM, Live2D, UI design, multi-modal AI, game playing agents,
streaming APIs, bionic memory mechanisms, and many more. She is capable of playing games
like Minecraft, Factorio. We got another community member who is researching on
integrating her to be able to play and control Kerbal Space Program (KSP), as well as
play any arbitrary games.

Many other companies are reaching out to us asking for collaboration, and we are
working on it, to make Project AIRI better, and more useful for the community.

There is so much to do, and discover, we haven't reached the singularity of general purpose AI,
perhaps Project AIRI will never made that point, but for now, having a companion-like AI agent
to talk to, play games with, and share the knowledge and ideas with, is already a great
achievement for me, and I hope it is for you too.

This is only the beginning memory address of our dreams, `0x1`, the first byte of our journey.

How much memory we could store? **It depends on how much we could dream, and how much we could achieve together.**

<div class="w-full flex flex-col items-center justify-center">
  <img :src="ReLUStickerWow" alt="ReLU sticker wow" class="w-30!" />
  <div class="text-center">
    <span class="block font-bold">Thanks for reading all the way here!</span>
    <span>Thanks for reading! Oh, and, Happy Birthday, Project AIRI!</span>
  </div>
</div>

> Cover image by [@Rynco Maekawa](https://github.com/lynzrand)

[^1]: https://neurosama.fandom.com/wiki/Osu!#cite_note-twitchtracker-1: Neuro-sama started out as an
  AI that plays osu! long before being developed further as an AI VTuber. The first osu! stream was on
  6 May 2019 when Vedal decided to showcase his work to the community.
