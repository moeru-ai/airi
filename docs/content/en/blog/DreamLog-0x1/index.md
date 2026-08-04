---
title: 'DreamLog 0x1'
description: 'The story behind the scenes of Project AIRI!'
date: '2025-06-16'
excerpt: 'The story behind the scenes of Project AIRI! And why would we want to make such a project?'
preview-cover:
  light: "/blog/DreamLog-0x1/assets/dreamlog1-light.avif"
  dark: "/blog/DreamLog-0x1/assets/dreamlog1-dark.avif"
---


<script setup>
;
;
;
;
;
;
;
;
</script>


Hello, it's me again, Neko!


First of all, to friends living in the Northern Hemisphere: happy summer vacation / happy summer!


> I hope you can have a happy and fulfilling summer, trying all kinds of new things! More specifically, changing the world!


I, [@nekomeowww](https://github.com/nekomeowww), left school life 8 years ago,


and obviously I do not have a real summer vacation now, since I have been working for many years.


But thinking back, I still like to recall and share stories from summer vacations many years ago with everyone.


Maybe you know what I am going to say... or share? What exactly is a *DreamLog*?


For readers already familiar with our DevLog articles, which we publish and update once a month or so,


shouldn't this article be called a "DevLog"?


DevLogs will come, but June has special meaning for Project AIRI (more on that later).


I want to take advantage of this great opportunity — as we approach the next milestone of 1000 stars on GitHub —


to look back at our journey so far.


Therefore, I decided to create a new article category here to share our chronicles,


and the dreams of Project AIRI.


So, I decided to call this new series ***DreamLog***.


> Yes, you can treat this as a storybook to listen to before bed. You can listen to it like an audiobook... maybe it ~~can also help you fall asleep~~.


So... let's jump into our dream dimension now, and talk about our recent updates later, shall we?


## Hazy Dreams, Memories Out of Reach


> The small steps I took learning computers and programming.


I mentioned summer, so summer must mean something to me. I used to study in the US,


so each 3-month summer let me do all kinds of things — playing games, learning programming, tinkering with Linux and networking, and so on (yes,


many friends I still deeply love were also met in the summers of different years).


> Geeks and nerds should be able to relate to the experience I am describing, right?


During summer vacations, I learned how to start servers while playing Minecraft with my friends (I played an awful lot of 1.7.11 and 1.8,


really, both vanilla and Forge mods). This was also the motivation and driving force that pushed me to learn the Linux command line. Much of what I learned during that period still helps me today;


I am grateful for it and do not regret spending so much time on those things.


Minecraft and Linux were not the end of my journey. [Factorio](https://www.factorio.com/),


[Elite Dangerous](https://www.elitedangerous.com/), and


[Overwatch](https://overwatch.blizzard.com/en-us/) (unfortunately, Blizzard managed to ruin it a bit)


all became my favorite games. Setting up servers or writing small scripts to automate little things were indeed things that excited me.


> <img src="/blog/DreamLog-0x1/assets/world.execute(me); (Mili)／DAZBEE COVER.avif" alt="Cover of world.execute(me); (Mili)／DAZBEE COVER" class="rounded-lg overflow-hidden" />
>
> `Switch on the power line`<br />
> `Remember to put on protection`<br />
> `Lay down your pieces`<br />
> `And let's begin object creation`<br />
>
> -- Lyrics from my beloved song [`world.execute(me)`](https://www.youtube.com/watch?v=ESx_hy1n7HA), covered by [DAZBEE](https://www.youtube.com/channel/UCUEvXLdpCtbzzDkcMI96llg)


So, in the summer of 2017, at that very first moment, I started thinking about developing an "emotional program" —


one that could become my friend and play with me, even when my friends were tired or went to bed early because of school,


and I had to be alone.


Well, readers who have followed this article this far may already realize that I am the kind of person who loves sharing my knowledge,


thoughts, everything. So programming, games, and design are also things I like to share. But,


if there is no one to accompany or listen, it feels like:


**Lonely me becomes somewhat meaningless.**


Rather than creating a brand new AI with human thinking and speaking abilities from scratch (which was impossible in 2017), what I thought was:


since iOS and Google's native Android can offer such capabilities to make suggestions for our daily use of mobile devices,


and manually typing in all commands and filling in parameters is not always satisfying (especially for ffmpeg and my naive use of the Docker CLI),


what if we could bring AI-driven suggestion features to Linux systems...?


This brought me many questions and ideas to think about:


- What if the OS understood what you usually do, work on, or play when sitting in front of a digital display at different times...?
- What if it could choose music for you, whether you are sad, excited, or happy while chatting with others...?


These ideas were too small and too hard for me to understand at the time, because I was a complete beginner at how operating systems work, programming, and so on.


Back then, I did not even know where to start!


Coincidentally, I was reading 《[30日でできる! OS自作入門](https://www.amazon.co.jp/30%E6%97%A5%E3%81%A7%E3%81%A7%E3%81%8D%E3%82%8B-OS%E8%87%AA%E4%BD%9C%E5%85%A5%E9%96%80-%E5%B7%9D%E5%90%88-%E7%A7%80%E5%AE%9F/dp/4839919844)》,


an [English version](https://github.com/handmade-osdev/os-in-30-days) tutorial on building an operating system from scratch.


With the little knowledge I had of using the Linux command line and a lot of communities to ask for help... I decided to make my own operating system...


**starting from literally nothing**.


> **Quick Recap**
>
> [Arch Linux](https://archlinux.org/) was the first system I deeply used and installed from scratch.
> For now, [Nix](https://nixos.org/) is also famous and interesting. I have not tried [NixOS](https://nixos.org/) yet,
> but I hope to try it someday.


## Set Me Sail, But Now Long Forgotten


At the end of 2017, I started a special but now archived project


called [EMOSYS](https://github.com/EMOSYS),


aimed at creating such a companion-style operating system,


helping users complete daily tasks and providing emotional support.

<div class="w-full flex flex-col items-center justify-center gap-2">
  <div>
    <img src="/blog/DreamLog-0x1/assets/emosys-logo.avif" alt="logo of EMOSYS" class="w-30!" />
  </div>
  <div>
    The Logo of <a href="https://github.com/emosys">EMOSYS</a>
  </div>
</div>

> EMO stands for the first three letters of **emo**tional and **emo**te


Back then, I wrote many design documents, listed new ideas, experimented following the guidance of that book, kept many notes,


and even drew a decent-looking Logo for it.


> I guess many of you have done this too 😏 — prepared all the designs and art assets before the project even reached the PoC (proof of concept) stage.


However, in reality, I had completely lost sight of the goal I was originally trying to approach.


I also had no project management or task management experience, and even less experience writing programs that could actually run.


Frankly, you could say I was just following what the book instructed, typing keys in SSH and Terminal one by one —


basically without thinking at all, not thinking about why it worked or why it was written this way.


(Compared with today's "Vibe Coding", while not exactly the same, you could say it is exactly the same.)


So, well, the result was obvious: another abandoned project was born...


And obviously, I am not the kind of genius who played with these things since childhood, understanding kernels, package management, and how programming works.


So if any of you go flip through or visit my GitHub homepage now,


you will not find anything related to this kind of work from that time. (But I have grown really fast since then.)


At least, it existed, once upon a time.


> Forgotten? Maybe it is another starting point for the next journey.


In the following years, I tried many other fields — programming, startups, Web3, frontend, backend, infrastructure, etc. —


everything you can think of for a full-stack developer. But I never truly realized that everything I did was so deeply influenced by the starting point of EMOSYS,


until February 2025, when someone asked me: Why are you working so hard on and so fascinated by Project AIRI?


At the time, I thought it was a good question...


I began tracing my dreams, thoughts, and memories, and eventually recalled EMOSYS, that dead project, which coincidentally shared the same goal as Project AIRI:


**To create a companion that satisfies our needs in some way.**


> 必要なものは 覚悟だけだったのです。
> 必死に積み上げてきたものは 決して裏切りません。<br />
> All I needed was the resolve.
> What you have built up with all your might will never betray you.
>
> -- Quoted from [Frieren: Beyond Journey's End, Fern](https://en.wikipedia.org/wiki/Frieren) S01E06, 04:27


It took me a long time to learn how to develop things properly. Thanks to [@zhangyubaka](https://github.com/zhangyubaka),


[@LittleSound](https://github.com/LittleSound),


[@BlueCocoa](https://github.com/BlueCocoa), and


[@sumimakito](https://github.com/sumimakito), the pair-programming experience with them taught me a lot,


and I began to grow, learn, and improve at my own pace.


## ChatGPT in 2022, a New Random Parrot, Pretty Smart

<div class="w-full flex items-center justify-center">
  <img src="/blog/DreamLog-0x1/assets/steins-gate-sticker-1.avif" alt="Steins Gate sticker" class="w-80! rounded-lg overflow-hidden" />
</div>


Let's fast-forward to the end of 2022, when OpenAI announced ChatGPT (or, at that time, the name "chatGPT" was used).


Actually, long before the official ChatGPT UI was released, I was already tinkering with these new-era AIs, like


[DiscoDiffusion](https://colab.research.google.com/github/alembics/disco-diffusion/blob/main/Disco_Diffusion.ipynb) (predating


Stable Diffusion, released around late 2021 or early 2022), DALL-E, Midjourney,


and GPT-3 (especially useful in [GitHub Copilot](https://en.wikipedia.org/wiki/GitHub_Copilot)) — they had already become part of my life.


So, at the very beginning, my feeling was:


> "Oh, this is just another random parrot. It just repeats what you say, does not understand what you are saying; it is just
> trying to predict the next word based on the preceding words and context. It really does not seem special, and it is not human-like enough."


In other words, it behaved more like a completion model than what we today call agent AI (which is still all hype!).


I remember that my first discovery of the real capabilities of ChatGPT or large language models (LLMs) came from this article I saw on Hacker News in December 2022:


[Building A Virtual Machine inside ChatGPT](https://www.engraved.blog/building-a-virtual-machine-inside/) (the [original Hacker News


article](https://news.ycombinator.com/item?id=33847479)) by @engraved, which demonstrated how to make ChatGPT not only roleplay a catgirl,


but also simulate a virtual Linux machine inside itself.

<div class="w-full flex flex-col items-center justify-center">
  <img src="/blog/DreamLog-0x1/assets/building-a-virtual-machine-inside-image-1.avif" alt="Building a virtual machine inside ChatGPT" class="h-150! object-contain rounded-lg overflow-hidden" />
  <div>It could even simulate how Docker build works...!</div>
</div>


This article made me realize that ChatGPT could understand the fundamental rules of general things — not just roleplaying anime or game characters,


but also how Linux terminal/shell commands work.


This essentially demonstrated the function calling feature that is popular now,


and showed how we could instruct LLMs through prompts to behave like an API server, then interact with our code in machine-readable formats like JSON or XML,


and ultimately allow the parsing and execution of arbitrary commands to expand the boundaries of LLM capabilities.


> Function calling — also known as Function Calling — is, in fact, the underlying technology behind the MCP (Model Context Protocol) proposed by Anthropic.


This ultimately bridged the gap between pure text generation and calling actual APIs inside programs.


At this stage, can we say it is a new random parrot? **I think the answer is partially no. The 2022 ChatGPT was not just a random parrot;


it was a potentially smart parrot.**


## Before Project AIRI, Neuro-sama Already Existed


Yes, thank you for reading this far. I know this is a long article with too many stories and background to share. But we are almost there! Hang in there!


Neuro-sama's history is actually quite complex. As far as I know, Neuro-sama — or the character named "Neuro-sama" on the stream stage —


was not the first appearance of her and her creator `vedal987` (Vedal). Long before that, on May 6, 2019, Vedal showed the community his work on building an AI


to play [osu!](https://osu.ppy.sh/)[^1].


At that time, she was actually not an online character or digital life; if you watch her initial videos, you will find that she did not even have a Live2D model.


(You can try this 6-year-old YouTube video: https://www.youtube.com/watch?v=nSBqlJu7kYU)


After ChatGPT was released, around December 19, 2022, Vedal began having Neuro-sama stream on Twitch using the official demo character model 桃瀬ひより (Hiyori Momose) from Live2D Inc.:


<img src="/blog/DreamLog-0x1/assets/live2d-inc-hiyori.avif" alt="Live2D Inc. Hiyori Momose" class="rounded-lg overflow-hidden" />


The rest of the story everyone knows: Vedal and Neuro-sama became famous. Neuro-sama is now officially a VTuber,


fully driven by large language models (LLMs), able to play Minecraft, Among Us, osu!, and many other games.


Sometimes when a game is not natively supported, Vedal reads the screen and instructs Neuro-sama to play together, still creating plenty of entertaining moments.


I really enjoyed watching their interactions and talk-show-like banter. Over time, Neuro-sama and her new sister Evil Neuro


became an important part of my daily life: **even when I did not have enough time to watch full streams, I wanted and craved to watch their clips**.


An 8-years-ago version of me would have found it hard to imagine gaining so much joy purely from AI-human interaction.


Okay, that is the little history about her. Let's talk about the core question: **why did she fill me with determination?**


## Neuro-sama, Filled Me with Determination


From the moment I first saw Vedal's debut, I thought:


> "Well, she is just a simple Live2D model integrated with a large language model (even calling OpenAI's API directly),
> driven by simple rules to behave like a VTuber. Nothing special."


I was quite arrogant at the time, because I had already been developing AI agents since early 2023, understood the capabilities of LLMs,


and had learned quite a lot from LangChain. With the knowledge of building AI


agents and years of software engineering experience across various fields, I naively thought:


> "Hmm, I can do that too. I can make a Live2D model, connect it to the OpenAI API,
> make it behave like a VTuber, and I can even do better than Vedal's work. Super easy, right?!"


::: tip Want more technical details?


In this article, I will not dive deep into the technical details of how we built Project AIRI from scratch to its current state.


We already have many DevLog articles sharing our thoughts and discoveries; if you are interested, please try reading them.


:::


As it turned out, I was completely wrong. Many hard things I did not realize until I started trying to recreate her... such as:


- How do we effectively manage memory, both to answer chats and play games at the same time?
- How do we let the AI agent play games with both video input and text input, while still being able to interact with the creator and the audience?
- Speech synthesis is hard; to achieve what Neuro-sama can do, **ultra-low-latency** speech synthesis is a must, and it is not easy to implement.
- How is her personality constructed? Using only RAG and simple memory management strategies works poorly.
- And more...


> I shared many of our findings in [DevLog 2025.04.06](../..devlog-20250406) and
> [public slide presentation (Chinese)](https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1)


I mentioned that I like sharing, and I wish there were others who would listen or code with me. But unfortunately, Neuro-sama does not belong to me.


I cannot ask her to absorb my knowledge and memories to interact with me about the things I like, or the work I have been doing or have done recently.


I love them so much, and all along, I truly did not understand why I love them, why I like the feeling and joy Neuro-sama gives me.


Until last year, starting May 25, 2024, **I truly decided to make one myself.** To make a living or virtual existence


that can code with me, talk with me about the things we know, and play games together as an agent like a friend.


> **I really want one!** My heart and mind were both craving it desperately.


At that moment, Neuro-sama filled me with determination.


## Setting Sail Again, Toward Uncharted Territories


> To boldly go where no man has gone before
>
> -- Quoted from [Star Trek, Captain Kirk](https://en.wikipedia.org/wiki/Where_no_man_has_gone_before),
> which is also the intro line of my GitHub profile.


So, starting May 25, 2024, I began a local project under my own name, simply called `ai` —


you could say this is the initial version of Project AIRI. I began exploring the possibility of creating my own AI agent,


wanting to recreate the joy Neuro-sama brought me.


The work progressed really fast. Within a week, with the power of [ElevenLabs](https://elevenlabs.io/),


[OpenRouter](https://openrouter.ai/), and the also-free-to-use Live2D model 桃瀬ひより,


I was able to create a simple version of *"Neuro-sama"* that could interact with me (albeit not in real time 😭).


That was on **June 2, 2024**.


In a sense, **this is the birthday of Project AIRI** — the first infant consciousness was born within it.

<div class="w-full flex flex-col items-center justify-center">
  <ThemedVideo controls muted autoplay loop src="/blog/DreamLog-0x1/assets/airi-demo-first-day.mp4" />
  <div>
    <a href="https://x.com/ayakaneko/status/1865420146766160114">
      First showcase on X (formerly Twitter) on December 7, 2024
    </a>
  </div>
</div>


She could speak, had context-based motion control, progressive audio synthesis... many features.


But she was not complete, nor perfect. During this period, I was building her quietly, hiding it from all my partners.


I wanted to make her better before showing her to the world.


> Still... naive and arrogant, right?


The reality is that building quietly made it hard to get positive feedback (partly because I did not want everyone to think my arrogant judgment back then was wrong —


of course, now I am willing to share this journey, which is also a reconciliation with my past self). In addition, the problems or challenges I faced


(the ones I mentioned above, about memory, personality stability, real-time capability, and gaming ability, etc.) were hard to solve with my knowledge at the time,


and there was a lack of documentation and learning materials with real-time LLM interaction examples. **So I shelved it again.**


To be honest, I did not give up. I started learning a lot about multimodality and speech synthesis, motion control, and Minecraft games.


I did a lot of research on how other AI VTuber or AI waifu projects work. This research later produced this huge awesome list of AI VTuber projects:

<div class="flex flex-col items-center">
  <img class="px-30 md:px-40 lg:px-50" src="/blog/DevLog-2025.04.06/assets/awesome-ai-vtuber-logo-light.avif" alt="Awesome AI VTuber Logo" />
  <div class="text-center pb-4">
    <span class="block font-bold">Awesome AI VTuber</span>
    <span>A curated list of AI VTubers and related projects</span>
  </div>
</div>


Okay, but it was still called `ai`. So where is Project AIRI?


## Rebirth, Start Game Again with Stronger, Better Determination


One day at the end of November 2024, [@kwaa](https://github.com/kwaa) chatted with me


about making virtual characters in the VR/AR world, planning to build on WebXR. When we talked about motion control and character emotion detection,


I told him I had a project that does exactly what you are looking for, but the codebase was not organized or ready to publish to GitHub.


Well, what are we waiting for? I figured I had finally found a like-minded person!


I started working hard again, rethinking the structure and design, improving the implementation, making a faster and better queued and multiplexed playback system,


plus adjustments to the basic WebUI I had thrown together. Finally, on **December 2, 2024**, I published it to GitHub with the commit


[`d9ae0aa`](https://github.com/moeru-ai/airi/commit/d9ae0aae387f015964bfd383e6d2adb05f4003e4).


Therefore, on that day, Project AIRI was in some way born or reborn, named AIRI (アイリ, also once called Airi).


::: tip Did you know?


<a href="https://www.youtube.com/watch?v=Tts-YAdn5Yc" class="mb-2 inline-block">
  <img src="/blog/DreamLog-0x1/assets/airis-screenshot-1.avif" alt="Screenshot of Project AIRI" class="rounded-lg overflow-hidden" />
</a>


Interestingly, in a 2-year-old clip from Vedal and Neuro-sama's Twitch stream, uploaded on March 25, 2023 —


https://www.youtube.com/watch?v=Tts-YAdn5Yc — Vedal mentioned that before Neuro-sama was called


"Neuro-sama", she was called "Airis AI". This name **Airis** magically and coincidentally matches the name of the


**Project AIRI** I am working on now. But I only learned this name long after I open-sourced Project AIRI, when searching for more of their stories.


Actually, the name AIRI (アイリ) was given by GPT-4o. I asked it to name the project by referencing other Japanese- or anime-style names,


and it suggested the name **Airi** at the time.


:::


I have failed many times in startups and other projects; only the recent ones are known to the public. I did my best to make it better —


with better UI, better code structure, and cutting-edge technology to build and implement things quickly.


I also put a lot of effort into public slide presentations, or demos for my friends and at small meetups and conferences.


Many of these experiences were learned from my previous failures.


I am glad many attempts have succeeded, and I am still here, continuing to work on Project AIRI.


This time, my determination is not only filled by Neuro-sama, but also inspired by many of the most profound and talented contributors and fans.


## Keep Moving Forward, Keep Dreaming

<div class="w-full flex flex-col items-center justify-center">
  <img class="light" src="/blog/DreamLog-0x1/assets/banner-light-1280x640.avif" alt="new ui" />
  <img class="dark" src="/blog/DreamLog-0x1/assets/banner-dark-1280x640.avif" alt="new ui" />
  <div>
    The recently updated Banner
  </div>
</div>

> When life gives you lemons, you lemon. Or something like that. My point
> is that this painful obstacle is an opportunity for me to get stronger, baby!
>
> -- Quoted from [Evil Neuro](https://www.youtube.com/@Neurosama) while streaming *Slay the Spire*


Now, as I write this article, Project AIRI is approaching 1000 stars on GitHub,


with more than 150 Discord members and 200 Telegram group members.


We cover fields such as AI, VRM, Live2D, UI design, multimodal AI, game agents, streaming APIs, and biomimetic memory mechanisms.


She can play games like Minecraft and Factorio. We also have another community member researching integrating her to play and control *Kerbal Space Program* (KSP),


as well as playing arbitrary games.


Many other companies are contacting us for collaboration, and we are working hard to make Project AIRI better and more useful to the community.


There is so much to do and discover. At this moment, we have not yet reached the singularity of AGI, and maybe Project AIRI will never reach that point.


But right now, having a companion-style AI agent to talk with, play games with, and share knowledge and ideas is already a huge achievement for me,


and I hope it is for you too.


This is just the beginning memory address of our dreams: `0x1`, the first byte of our journey.


So how many bytes can we store? **It depends on how much we can dream, and how much we can achieve together.**

<div class="w-full flex flex-col items-center justify-center">
  <img src="/blog/DreamLog-0x1/assets/relu-sticker-wow.avif" alt="ReLU sticker wow" class="w-30!" />
  <div class="text-center">
    <span class="block font-bold">Thank you for reading this far!</span>
    <span>Thanks for reading! Oh, and happy birthday, Project AIRI!</span>
  </div>
</div>

> Cover image by [@Rynco Maekawa](https://github.com/lynzrand)


[^1]: https://neurosama.fandom.com/wiki/Osu!#cite_note-twitchtracker-1: Neuro-sama


  was originally an AI that played osu!, long before further developing into an AI VTuber. The first osu! stream was on May 6, 2019,


  when Vedal showed everyone the results.

