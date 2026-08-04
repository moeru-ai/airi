---
title: DevLog @ 2025.03.06
category: DevLog
date: 2025-03-06
---


## Deja Vu


In the previous day's dev stream, I showed the progress I made on basic animations and transitions for AIRI.


The main goal was to port and adapt the excellent work of [@yui540](https://yui540.com/) into reusable Vue components,


so that any Vue project can easily use these beautiful animation effects.


> More details about yui540, along with related reference libraries and work, have been organized into the newly deployed documentation website:
> [https://airi.build/references/design-guidelines/resources/](../references/design-guidelines/resources/).


The final ported results are quite good and have been deployed to


[https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/).


![](/blog/DevLog-2025.03.06/assets/animation-transitions.gif)


> Also, from now on, all demo stages for each package will be deployed to Netlify using the
> "proj-airi" + "${subDirectory}" + "${packageName}" pattern.


Although the main goal of the previous day was to split CSS implementations into Vue components, the practical reusability part is not fully done yet.


I still need to design a workflow and mechanism that is both flexible and extensible so that other pages can use it conveniently.


## Daytime


I tried the [`definePage`](https://uvr.esm.is/guide/extending-routes.html#definepage) macro hook provided by [`unplugin-vue-router`](https://github.com/posva/unplugin-vue-router), found that it fits my use case very well, and decided to keep exploring in this direction.


I ported 3 additional new animation transitions from [https://cowardly-witch.netlify.app/](https://cowardly-witch.netlify.app/), which are now available at [https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/).


Yesterday I deployed the official documentation website to [https://airi.build](https://airi.build). [@kwaa](https://github.com/kwaa) commented that he suggested I try the `https://airi.more.ai/docs` approach, ~~but I could not figure out how to set up a 200 redirect proxy for /docs.~~


Edit: I finally learned how to do it; details will be included in a future dev log.


I gave it a try, and after about ten commits wrestling with the CI/CD pipeline (yes, wrestling again), I still could not get it to work properly.


Later today, I researched some technologies and the [open-source repository](https://github.com/deepseek-ai/open-infra-index) released by the DeepSeek team a week ago, as well as the so-called [LLM gateway AIBrix](https://github.com/vllm-project/aibrix) released by ByteDance. I also looked into whether the newly released and announced Phi-4-mini could be ported for AIRI use. The good news is that [Phi-4-mini](https://techcommunity.microsoft.com/blog/educatordeveloperblog/welcome-to-the-new-phi-4-models---microsoft-phi-4-mini--phi-4-multimodal/4386037) includes function calling capabilities, which means we can finally build agents with pretrained support.


## Dev Stream


In the afternoon I contacted another artist, saying I would pay for a custom pixel-art commission to use as my upcoming account avatar.


~~Yes, I asked the artist to hide some easter eggs in it, haha, good luck finding them.~~


The stream layout and setup have been updated 😻 It was designed by myself almost a year ago, but it still looks great and feels calm to watch. Please leave any suggestions in the chat comments — thank you very much.


![](/blog/DevLog-2025.03.06/assets/live-stream-layout-update.avif)


In today's dev stream, I tried to integrate the stage transition animation components into the main stage of the AIRI website. It did not go so smoothly — I found several issues in my previous animation component designs — but the good news is I have fixed them, and the new animation transitions are now live on our official deployment [https://airi.moeru.ai](https://airi.moeru.ai).


I eventually made a decision, born from some random ideas about the module configuration interface and settings pages. They have all been implemented and shipped; adjusting settings should now feel much better. I hope you like it.


After I finished the stream, I finally tested the result on my phone. Although it works fine on desktop and tablet, I discovered I accidentally broke the animations on mobile devices; I will fix that during the day tomorrow 😹


That's it for today's DevLog. Thank you to everyone who joined the DevStream and stayed with us to the very end. See you tomorrow.

