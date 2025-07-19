---
title: Chronicle v0.0.1
---

- [x] Create project - Completed, created with Vitesse Lite paired with Vue (June 7, 2024)
- [x] Frontend Live2D integration - Completed at [Integrating Live2D models into Vue applications through Pixi.js renderer](https://nolebase.ayaka.io/to/3cae2b7c0b) (June 7, 2024)
  - [x] Live2D Cubism SDK integration
  - [x] pixi.js rendering
  - [x] Model download
    - [x] Momose Hiyori (Neuro first version model) Pro version (free for commercial use by small and medium enterprises)

![](../../../../zh-Hans/docs/chronicles/version-v0.0.1/assets/screenshot-1.avif)

- [x] Integrate GPT-4o through Vercel AI SDK (June 7, 2024)
  - [x] `@ai-sdk/openai`
  - [x] `ai`
- [x] Streaming Token transmission (June 8, 2024)
- [x] Streaming Token reception (June 8, 2024)
- [x] Streaming TTS (June 8, 2024)
  - [x] [node.js - How to properly handle streaming audio coming from Elevenlabs Streaming API? - Stack Overflow](https://stackoverflow.com/questions/76854884/how-to-properly-handle-streaming-audio-coming-from-elevenlabs-streaming-api)
  - [x] [Stream Response - Getting Started - h3 (unjs.io)](https://h3.unjs.io/examples/stream-response)
  - [x] ~~GPT-SoVITS configuration~~(This is a bit complex, will work on samples later when there's time)
- [x] Lip sync (June 9, 2024)
  - [x] Determine mouth opening size based on loudness
    - [x] Amplify loudness curve through Math.pow ratio
    - [x] Linear normalization
    - [x] MinMax normalization
    - [x] ~~SoftMax normalization~~(Effect wasn't good, output data were all in the 0.999999 to 1.000001 range)
- [x] Streaming Token to streaming TTS (June 9, 2024)
  - [x] Can apparently construct sentences based on punctuation and spaces + character limit combination, then implement TTS inference
    - [x] ~~11Labs is WebSocket-based~~
    - [x] Issue TTS Stream requests through queue, then queue to audio stream queue
    - [x] Implement a Queue in Vue
      - [x] queue needs first-in-first-out
        - [x] Out, [`Array.prototype.shift`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/shift)
        - [x] In, [`Array.prototype.push`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/push)
        - [x] event based
          - [x] events
            - [x] `add`, trigger an `add` event when adding
            - [x] `pick`, trigger a `pick` event when getting
            - [x] `processing`, trigger a `processing` event when calling handler
            - [x] `done`, trigger a `done` event when handler finishes
          - [x] event handling
            - [x] When `add` or `done` events occur, check if there's a running handler
              - [x] If yes, return
              - [x] If no, `pick(): T` then call handler
        - [x] queue handler
          - [x] If await, wait for queue handler to process
            - [x] Theoretically, textPart to TTS stream handler should connect to another queue, i.e., audio stream queue
            - [x] Can audio streams be merged? Might need to directly handle Raw PCM (.wav)
            - [x] audio stream queue handler should continuously find audio from audio stream queue to play
- [x] Basic Neuro Sama / AI Vtuber role-playing (June 10, 2024)
  - [x] Basic Prompt

Already completed on June 10, 2024, taking less than 4 days.

Now can:
- ✅ Full-stack (originally was bare Vue 3)
- ✅ Live2D model display
- ✅ Conversation
- ✅ Conversation UI
- ✅ Speech
- ✅ Live2D lip sync (thanks to itorr's GitHub explanation)
- ✅ Basic Prompt

![](../../../../zh-Hans/docs/chronicles/version-v0.0.1/assets/screenshot-2.avif)

## Multimodal

### Mouth (June 8, 2024)

- [x] TTS integration (June 8, 2024)
  - [x] Integrated 11Labs
- [ ] Research
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> [Deepgram Voice AI: Text to Speech + Speech to Text APIs | Deepgram](https://deepgram.com/)
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> Try GPT-SoVITS
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> Try fish-speech (July 6, 2024 ~ July 7, 2024)
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> Can indeed do few-shot direct copying, I tried copying Gura's voice, can maintain very high quality in the first 4s
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> fish audio's audio processing tools are very comprehensive, audio processor can cover most needs (including labeling and auto-labeling)
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> Effect is very unstable, often swallows words, sounds, or suddenly makes random noises
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> Even running on RTX 4090 devices, in streaming audio mode, still takes up to 2s to output inference results
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> Try ChatTTS (July 6, 2024 ~ July 7, 2024)
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> Can indeed do few-shot direct copying, I tried copying Gura's voice, but effect is not as good as fish-speech
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> Emotion control is much better than fish-speech, but in English environments, tokens like `[uv_break]` are also pronounced, people in WeChat groups are also discussing and asking about this
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> Even running on RTX 4090 devices, in streaming audio mode, it takes several minutes... 🤯 Really ridiculous, it appears to run an llm first locally to convert plain / normalized text to text with action tokens, then it seems there's no caching or model size consideration when starting the llm
   - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> Try other models mentioned in [TTS Arena - a Hugging Face Space by TTS-AGI](https://huggingface.co/spaces/TTS-AGI/TTS-Arena) (July 8, 2024)
     - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> Try XTTSv2
       - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> Used huggingface directly, poor effect, more stable than fish speech and chatts but tone too plain, might need lora for anime tones
     - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> Try StyleTTS 2
       - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> Used huggingface directly, poor effect, more stable than fish speech and chatts but tone too plain, might need lora for anime tones
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> Try CosyVoice (Alibaba's)
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> [Koemotion](https://koemotion.rinna.co.jp/)
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> [Seed-TTS](https://bytedancespeech.github.io/seedtts_tech_report/)

### Expression (July 9, 2024)

- [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> Discussed with GPT how to quickly process expressions in real-time through embed instruction https://poe.com/s/vu7foBWJHtnPmWzJNeAy (July 7, 2024)
- [x] Frontend Live2D expression control (July 9, 2024)
  - [x] Implement through encoding `<|EMOTE_HAPPY|>`
  - [x] Additional support for delay syntax like `<|DELAY:1|>`
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Encapsulate emotion token `<|EMOTE_.*|>` parser and tokenizer
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Support queued streaming processing, encapsulate `useEmotionMessagesQueue` and `useEmotionsQueue`
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Support calling Live2D to process motion expressions
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Test debug page
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Encapsulate delay token `<|DELAY:.*|>` parser and tokenizer to dynamically control the delay of the entire streaming process
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Support queued streaming processing, encapsulate `useDelaysQueue`
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Test debug page
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Display layer encapsulation supports pre-tokenizing and parsing stream text to exclude `<|...|>` syntax

### Actions

#### VRM lip sync

##### Research

- [ ] [sigal-raab/MoDi: Unconditional Motion Synthesis from Diverse Data](https://github.com/sigal-raab/MoDi)
- [ ] [TMR - Text-to-motion Retrieval](https://mathis.petrovich.fr/tmr/)
  - [ ] [Mathux/TMR - GitHub](https://github.com/Mathux/TMR)
- [ ] Index sites used when researching
  - [ ] [Hannibal046/Awesome-LLM: Awesome-LLM: a curated list of Large Language Model](https://github.com/Hannibal046/Awesome-LLM)
- [ ] ADHD behavior when researching
  - [ ] Friend recommended NVIDIA's new paper [ConsiStory: Training-Free Consistent Text-to-Image Generation](https://research.nvidia.com/labs/par/consistory/) feels more stable than IPadapter.
- [ ] Interesting is [IDEA-Research/MotionLLM: [Arxiv-2024] MotionLLM: Understanding Human Behaviors from Human Motions and Videos](https://github.com/IDEA-Research/MotionLLM), this paper and research direction is about using natural language to describe human actions formed between video animation frames. Published on May 31, 2024.
- [ ] [Ksuriuri/EasyAIVtuber: Simply animate your 2D waifu.](https://github.com/Ksuriuri/EasyAIVtuber)
- [ ] This is a fairly large topic, I researched several keywords and found the mainstream research propositions in this current direction:
  - [ ] Digital human synthesis -> Virtual WebCam motion capture
    - [ ] [PersonaTalk: Bring Attention to Your Persona in Visual Dubbing](https://arxiv.org/pdf/2409.05379)
      - [ ] This seems to be SOTA
    - [ ] [OpenTalker/SadTalker: [CVPR 2023] SadTalker：Learning Realistic 3D Motion Coefficients for Stylized Audio-Driven Single Image Talking Face Animation](https://github.com/OpenTalker/SadTalker)
    - [ ] [Rudrabha/Wav2Lip: This repository contains the codes of "A Lip Sync Expert Is All You Need for Speech to Lip Generation In the Wild", published at ACM Multimedia 2020. For HD commercial model, please try out Sync Labs](https://github.com/Rudrabha/Wav2Lip)
    - [ ] [yerfor/GeneFace: GeneFace: Generalized and High-Fidelity 3D Talking Face Synthesis; ICLR 2023; Official code](https://github.com/yerfor/GeneFace)
    - [ ] [harlanhong/CVPR2022-DaGAN: Official code for CVPR2022 paper: Depth-Aware Generative Adversarial Network for Talking Head Video Generation](https://github.com/harlanhong/CVPR2022-DaGAN)
    - [ ] [Kedreamix/PaddleAvatar](https://github.com/Kedreamix/PaddleAvatar)
    - [ ] [yangkang2021/I_am_a_person: Real-time interactive GPT digital human](https://github.com/yangkang2021/I_am_a_person?tab=readme-ov-file)
    - [ ] [I_am_a_person/数字人/README.md at main · yangkang2021/I_am_a_person](https://github.com/yangkang2021/I_am_a_person/blob/main/%E6%95%B0%E5%AD%97%E4%BA%BA/README.md)
  - [ ] Text-to-Motion (also called T2M, text to motion)
    - [ ] [SuperPADL: Scaling Language-Directed Physics-Based Control with Progressive Supervised Distillation](https://arxiv.org/html/2407.10481v1)
      - [ ] NVIDIA's latest from July 1, 2024
      - [ ] Recommended by friend
    - [ ] [Generating Diverse and Natural 3D Human Motions from Text (CVPR 2022)](https://github.com/EricGuo5513/text-to-motion)
      - [ ] Paper: [Generating Diverse and Natural 3D Human Motions from Texts](https://ericguo5513.github.io/text-to-motion/)
    - [ ] Friend helped recommend partners doing natural language joint generation, he recommended these papers:
      - [ ] [TEMOS: Generating diverse human motions from textual descriptions (arxiv.org)](https://arxiv.org/abs/2204.14109)
      - [ ] [AvatarGPT: All-in-One Framework for Motion Understanding, Planning, Generation and Beyond](https://arxiv.org/abs/2311.16468)
      - [ ] [T2M-GPT: Generating Human Motion from Textual Descriptions with Discrete Representations](https://arxiv.org/abs/2301.06052)
    - [ ] Since it's keyframe control, also looked at several keyframe-related papers
      - [ ] [Koala: Key frame-conditioned long video-LLM](https://arxiv.org/html/2404.04346v1)
  - [ ] Code as Policies (mainly in robotics field)
    - [ ] Of course, the pioneer is here [Code as Policies: Language Model Programs for Embodied Control](https://code-as-policies.github.io/)
    - [ ] [Scaling Up and Distilling Down: Language-Guided Robot Skill Acquisition (columbia.edu)](https://www.cs.columbia.edu/~huy/scalingup/)
    - [ ] [CLIPort](https://cliport.github.io/)：CLIPort: What and Where Pathways for Robotic Manipulation
    - [ ] [VIMA | General Robot Manipulation with Multimodal Prompts](https://vimalabs.github.io/)：VIMA: General Robot Manipulation with Multimodal Prompts
    - [ ] [Scaling Up and Distilling Down: Language-Guided Robot Skill Acquisition](https://www.cs.columbia.edu/~huy/scalingup/)
    - [ ] [EUREKA: HUMAN-LEVEL REWARD DESIGN VIA CODING LARGE LANGUAGE MODELS](https://eureka-research.github.io/assets/eureka_paper.pdf) feels more like a summary.
  - [ ] Reinforcement Learning
    - [ ] This direction mainly combines existing RL trained models in underlying robotics control for interfacing, then uses many code as policies implementations for interface and computation layers
      - [ ] [MarI/O - Machine Learning for Video Games - YouTube](https://www.youtube.com/watch?v=qv6UVOQ0F44)
    - [ ] [RLADAPTER: BRIDGING LARGE LANGUAGE MODELS TO REINFORCEMENT LEARNING IN OPEN WORLDS](https://openreview.net/pdf?id=3s4fZTr1ce) mainly says: within the RLAdapter framework, fine-tuning lightweight language models using information generated during RL agent training can significantly help LLMs adapt to downstream tasks, thereby providing better guidance for RL agents. We evaluated RLAdapter experiments in the Crafter environment, results show RLAdapter surpasses SOTA baselines. Additionally, under our framework, agents exhibit common-sense behaviors that baseline models don't possess
    - [ ] [See and Think: Embodied Agent in Virtual Environment](https://arxiv.org/pdf/2311.15209) similar to Voyager, PlanMC and MP5 mentioned below, this is also research for Minecraft, feels mainly emphasizing RL.
    - [ ] [Text2Reward: Reward Shaping with Language Models for Reinforcement Learning](https://text-to-reward.github.io/)
    - [ ] [Direct Preference Optimization: Your Language Model is Secretly a Reward Model](https://arxiv.org/pdf/2305.18290) mainly talks about LLM itself being a rewardable model. Maybe can learn how to combine RLHF, quite foundational for transformers.
  - [ ] Embodied Control
    - [ ] Many recorded here
      - [ ] [zchoi/Awesome-Embodied-Agent-with-LLMs](https://github.com/zchoi/Awesome-Embodied-Agent-with-LLMs)：This is a curated list of "Embodied AI or robot with Large Language Models" research. Watch this repository for the latest updates! 🔥
    - [ ] [MP5: A Multi-modal Open-ended Embodied System in Minecraft via Active Perception](https://arxiv.org/pdf/2312.07472) this is interesting, using a relatively complete Minecraft RL framework, implemented using natural instructions to tell LLM to "**kill** a **pig** with a **stone sword** at **water's edge** on **grassland** during **daytime**", and RL Agent can perceive these features then achieve corresponding goals. Different from [How to make AI play Minecraft? Voyager paper notes](https://nolebase.ayaka.io/to/27024f5434), MP5 is more similar to PlanMC, and integrates multimodal capabilities rather than Voyager's original pure text and pure state information.
      - [ ] Abstract: We introduce MP5, an open-ended multimodal embodied system built on the highly challenging Minecraft simulator that can decompose feasible sub-goals, design complex context-aware plans, execute embodied action control, and frequently communicate with goal-conditioned active perception schemes. Specifically, MP5 is developed based on recent advances in multimodal large language models (MLLMs), the system is modulated into multiple functional modules that can be scheduled and collaborated to ultimately solve predefined, context and process-related tasks.
    - [ ] [CRADLE: Empowering Foundation Agents Towards General Computer Control](https://arxiv.org/pdf/2403.03186) haven't read yet, will read when free.
    - [ ] [Embodied Multi-Modal Agent trained by an LLM from a Parallel TextWorld](https://arxiv.org/pdf/2311.16714) mainly talks about **training a VLM agent living in the visual world using an LLM agent that excels in parallel text worlds**.
    - [ ] [Online continual learning ONLINE CONTINUAL LEARNING FOR INTERACTIVE INSTRUCTION FOLLOWING AGENTS](https://openreview.net/pdf?id=7M0EzjugaN)
  - [ ] Manipulation (mainly in Robotics field)
  - [ ] Motion Embeddings
    - [ ] [PerAct](https://peract.github.io/)：Quite rare, says encoding code as policies and RL environment information plus manipulation into tokens for computation
  - [ ] Feedback Loop (mainly Robotics + Control field, this category is actually rarer)
    - [ ] I feel it might be related to the general environment, this is relatively low-level
    - [ ] Maybe directly researching RL would be useful
    - [ ] [InCoRo: In-Context Learning for Robotics Control with Feedback Loops](https://arxiv.org/html/2402.05188v1?_immersive_translate_auto_translate=1) this paper title is attractive but haven't read carefully, can read when free, many people cited it.
      - [ ] Purpose is mainly to use natural LLM language commands to convert natural language commands to low-level _static_ execution plans for robot units. Using LLMs internal robot systems to generalize this to a new level, enabling zero-shot generalization to new tasks.
    - [ ] Related is also Hugging Face's open-source LeRobot for reference
      - [ ] [huggingface/lerobot: 🤗 LeRobot: End-to-end Learning for Real-World Robotics in Pytorch](https://github.com/huggingface/lerobot?tab=readme-ov-file)

### Vision

- [ ] [OpenGVLab/Ask-Anything: [CVPR2024 Highlight][VideoChatGPT] ChatGPT with video understanding! And many more supported LMs such as miniGPT4, StableLM, and MOSS.](https://github.com/OpenGVLab/Ask-Anything)
- [ ] [DirtyHarryLYL/LLM-in-Vision: Recent LLM-based CV and related works. Welcome to comment/contribute! (github.com)](https://github.com/DirtyHarryLYL/LLM-in-Vision)
- [ ] [landing-ai/vision-agent: Vision agent (github.com)](https://github.com/landing-ai/vision-agent)
- [ ] [2404.04834 LLM-Based Multi-Agent Systems for Software Engineering: Vision and the Road Ahead (arxiv.org)](https://arxiv.org/abs/2404.04834)
- [ ] [Experimentation: LLM, LangChain Agent, Computer Vision | by TeeTracker | Medium](https://teetracker.medium.com/experimentation-llm-langchain-agent-computer-vision-0c405deb7c6e)
- [ ] How can Neuro Sama see the screen and understand?
- [ ] [Is it possible to use a local LLM and have it play Minecraft? : r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/comments/143ziop/comment/jnfvr1w/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)
- [ ] [2402.07945 ScreenAgent: A Vision Language Model-driven Computer Control Agent](https://arxiv.org/abs/2402.07945)
- [ ] How do Stanford and Bay Area systems that let large language models control robots work?
  - [ ] Direct streaming Token output? Action Token?
  - [ ] How is Computer Vision done?
  - [ ] Copy homework
- [ ] [svpino/alloy-voice-assistant](https://github.com/svpino/alloy-voice-assistant)

### Memory

- [ ] Long-term memory
- [ ] Short-term memory
- [ ] recall memory action
- [ ] Vector database

### Multilingual

- [ ] Multilingual support
  - [ ] Chinese
    - [ ] Current 11Labs Chinese TTS model is too poor
    - [ ] Microsoft's Cognitive TTS API isn't very good
    - [ ] AWS effect is poor
    - [ ] Alibaba Cloud supposedly good
  - [ ] Japanese
    - [ ] [Koemotion](https://koemotion.rinna.co.jp/)
    - [ ] Pixiv's [ChatVRM demo](https://github.com/pixiv/ChatVRM) also uses this

## Optimization Wishlist Backlog

### Code repository & architecture

- [x] [Migrate to SPA](https://github.com/nekomeowww/airi-vtuber/commit/cd0f371595a669c570dc263e72dd3ce54afab7ff)
- [x] [Migrate to Monorepo](https://github.com/nekomeowww/airi-vtuber/commit/ee4878710eeded6ef1b66474905936353d0176b4)
- [x] Unify to moeru-ai organization

### Interaction optimization

- [x] Don't send if sendMessage box is empty (June 9, 2024)
- [x] Chat history (June 9, 2024)
- [ ] Auto trim chat history exceeding context
  - Implemented in Go before, can move one over.
- [ ] Auto determine context size
- [ ] Support microphone selection
- [ ] Implement hotkey listening (avoid streaming accidents)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Listen button (June 9, 2024)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">Bug</span> Delay from not preloading all motions during Live2D motion control (July 10, 2024)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">Bug</span> Frame skipping delay from not forcefully overriding current playing motion during Live2D motion control (July 10, 2024)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">Bug</span> Playback anomalies from not awaiting `.motion(motionName)` calls during Live2D motion control (July 10, 2024)

### Interface optimization

- [x] Resize pixi scene and canvas size when `window` size updates (June 9, 2024)
- [x] Put volume level on avatar, like those flashing effects during meetings (June 9, 2024)
- [ ] Put spectrum on message pop (seems quite difficult)
  - See demo [audioMotion](https://audiomotion.app/?mode=server#!)
  - See tutorial [Adding Audio Visualizers to your Website in 5 minutes! | by Aditya Krishnan | Medium](https://medium.com/@adityakrshnn/adding-audio-visualizers-to-your-website-in-5-minutes-23985d2b1245)
  - Copy homework [JS Audio Visualizer (codepen.io)](https://codepen.io/nfj525/pen/rVBaab)
- [ ] Anime-style & ACG-style
  - [ ] Materials & generators
    - [ ] [Free SVG generators, color tools & web design tools](https://www.fffuel.co/)
    - [ ] [Uiverse | The Largest Library of Open-Source UI elements](https://uiverse.io/)
  - [ ] Research references
    - [ ] Index sites
      - [ ] [アニメーション | 81-web.com : 日本のWebデザイン・Webサイトギャラリー＆参考サイト・リンク集](https://81-web.com/tag/animation)
      - [ ] [2021年版イケてるアニメのWebサイト10選(自薦) | Blog | 株式会社イロコト | ゲーム･アニメ等のエンタメ系Web制作&運用会社](https://irokoto.co.jp/blog/20210421/post-20)
      - [ ] [漫画･アニメ･ゲーム | SANKOU! | Webデザインギャラリー･参考サイト集](https://sankoudesign.com/category/comic-anime-movie-game-book/)
      - [ ] [KVが動画・アニメーションのWebデザイン参考ギャラリー・リンク集 | Web Design Garden | 毎日更新！Webデザイン参考ギャラリーサイト](https://webdesigngarden.com/category/element/kv-movie/)
    - [ ] [ドーナドーナ いっしょにわるいことをしよう | アリスソフト](https://www.alicesoft.com/dohnadohna/)
    - [ ] [Unbeatable Game](https://www.unbeatablegame.com/)
    - [ ] [Splatoon™ 3 for Nintendo Switch™ -- Official Site](https://splatoon.nintendo.com/)
    - [ ] [MuseDash](https://musedash.peropero.net/#/special/events/marija480)
    - [ ] [Misky Co., Ltd. | Company supporting people living as themselves](https://www.misky.co.jp/)
    - [ ] Extensions
      - [ ] [sabrinas.space](https://sabrinas.space/)

### Inference optimization

- [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Support directly switching to thinking emote when sending messages for feedback (July 9, 2024)
- [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Emotion detection
  - [ ] Currently wasting extra tokens to process emotion tokens, could consider trying sentiment for traditional NLP emotion detection
    - [ ] But traditional sentiment only has positive and negative, need to consider how to support other emotions
- [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Emotion token embedding
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Current `<|EMOTE_.*|>` pattern tokens aren't managed by tokenizer, need to write many streaming-compatible tokenizers separately during inference
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Current `<|EMOTE_.*|>` pattern tokens aren't managed by tokenizer, need to write many streaming-compatible tokenizers separately during inference
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">Bug</span> `useQueue` doesn't consider queue items separated by `isProcessing` lock during processing (July 9, 2024)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">Bug</span> Models stored in Local Storage not aligned with required data causes `computed` infinite loop freezing interface (July 9, 2024)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">Bug</span> Live2DViewer frame's automatic size detection capability has issues (July 9, 2024)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">Bug</span> Issues from isolating empty text to avoid infinite loops during streamSpeech (July 9, 2024)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> `useQueue` supports custom events within `handler` (July 9, 2024)
- [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Synchronize text output and voice output timing
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> `ttsQueue` and `audioPlaybackQueue` can store a corresponding timestamp
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> When completing `audioPlaybackQueue` processing and playback, calculate audio duration
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Split text by spaces to get `['hello ', 'this ', 'is ', 'neuro ']`
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Audio duration divided by text character count = delay per token group output
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">Feat</span> Output text according to delay instruction (or could use a delay queue)
- [ ] Neuro Sama's inference speed is really very fast, even counting vector db recall + re-inference + task allocation, shouldn't be this quick
- [x] Neuro Sama's TTS is also very fast, faster than any TTS I know
  - [x] Seems very fast after integrating MicVAD and Whisper, much simpler than imagined
  - [ ] Local Whisper
  - [ ] Local TTS
- [ ] How much data did Vedal use when fine-tuning Neuro Sama's speech recognition?
  - [ ] Words like `Evil` and `Evil Neuro` shouldn't be able to merge semantically, either force with RAG, but would need quite powerful vector db node support

### Memory

- [ ] keep alive solution
  - [ ] If idle, every 30 minutes give Neuro a continuous inference prompt
    - [ ] Ask Neuro what she's doing, help Neuro record what she's doing
    - [ ] Ask Neuro what she wants to do next, prevent Neuro from being bored
    - [ ] 24 hours enters 1, otherwise GPT easily loses perception of numbers
- [ ] Continuous inference
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> Discussion with Perplexity https://www.perplexity.ai/search/I-want-to-jKXpnx6hT6uvhm0qbu6ofA#0 (June 8, 2024)
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> Experiment on Poe [https://poe.com/s/PqQfwNd2V2wFpmR0YUke](https://poe.com/s/PqQfwNd2V2wFpmR0YUke) (July 8, 2024)
  - [ ] Build a loop
    - [ ] what do you want to do
      - [ ] We can generate an actions map
        - [ ] browse twitter
        - [ ] search things
          - [ ] recall memories
          - [ ] browse link
        - [ ] recall previously chatted messages
        - [ ] recall memories
        - [ ] send message
        - [ ] rest
    - [ ] Complete things
    - [ ] you have done things
      - [ ] Current round tasks
      - [ ] Last 10 rounds tasks
    - [ ] what do you want to do
    - [ ] ...
- [ ] One-way ping solution (low cost)
  - [ ] If idle, every hour send Neuro a status update for the past 1 hour
  - [ ] After running 24 hours, no longer include status updates in context, but directly summarize uptime
    - [ ] Before each interaction, send an uptime prompt to Neuro, let her perceive the passage of time

## Actions

- [ ] Play Minecraft [How to make AI play Minecraft? Voyager paper notes](https://nolebase.ayaka.io/to/27024f5434)
- [ ] Search
- [ ] Use VSCode to write code
- [ ] Help write knowledge base
- [ ] Play Factorio
- [ ] Command other GPTs

## Models

### Live2D

#### Platforms

- [BOOTH - The International Indie Art Marketplace](https://booth.pm/zh-cn)
- https://nizima.com/
- [Vtuber - Etsy](https://www.etsy.com/search?q=vtuber&ref=pagination&page=2)

#### Free

  - [Guangcai Shengnian (huotan.com)](https://guangcai.huotan.com/)
  - [Sales work search(Live2D) | By post date - nizima by Live2D](https://nizima.com/Search/ResultItem?isIncludePreparation=true&category=live2d&product-type=sale)
  - [【Free model】Such a cute little dog for free!_bilibili](https://www.bilibili.com/video/BV1LM41137vK/)
  - [【Free live2d model】Free little devil to take home(∠・ω< )⌒☆_bilibili](https://www.bilibili.com/video/BV1fP411e7fA/)
  - [【Free L2D model】Sweet and salty mechanical girl! Free model announcement~Click to claim_bilibili](https://www.bilibili.com/video/BV1S8411H7zf/)
  - [【Frieren free live2d model】When using this move on Himmel back then, the power was so great he fainted=w=_bilibili](https://www.bilibili.com/video/BV1te411b7Xp)
  - [【Free live2D model】10k yuan super high precision model directly free to take home?_bilibili](https://www.bilibili.com/video/BV1hB4y1Q7vn/)
  - [Bilibili Workshop](https://gf.bilibili.com/item/detail/1105759077)
  - [【Free live2d model showcase】Get a landmine-type girl_bilibili](https://www.bilibili.com/video/BV1eu4y187zw)
  - [【One yuan Live2D model showcase】Original Mayoi Hakune model public_bilibili](https://www.bilibili.com/video/BV1i94y1W77Y/)

#### Pixel

- [【Universal custom model】Custom pixelgirl【VTS compatible export data】 - Nojimart - BOOTH](https://booth.pm/ja/items/5661930)
- [【Live2D showcase】Custom pixelgirl【Universal custom model on sale🌷】 - YouTube](https://www.youtube.com/watch?time_continue=32&v=4RuI2J-1lJc&embeds_referring_euri=https%3A%2F%2Fbooth.pm%2F&source_ve_path=Mjg2NjY&feature=emb_logo)
- [【Vtuber Self-Introduction】 Pixel VTuber Q&A Self-Intro ✧ - YouTube](https://www.youtube.com/watch?v=WTMkpXBGDpM)
- [Pixel Vtuber [Live2d VTuber] (youtube.com)](https://www.youtube.com/watch?v=wufHsJ30mS4)
- [Is it possible to use pixel art for my model? : r/vtubertech (reddit.com)](https://www.reddit.com/r/vtubertech/comments/su2qwt/is_it_possible_to_use_pixel_art_for_my_model/)
- [【FaceRig compatible】Live2D×Pixel art model - poribaketu - BOOTH](https://booth.pm/en/items/3056994)
- [[Live2D Showcase] Otori Emu 鳳えむ (youtube.com)](https://www.youtube.com/watch?v=Hl5AUrf6SAg)

#### Actions

- [Body movements 11 types【Live2D learning data】 - Totori_Store - BOOTH](https://booth.pm/ja/items/5618038)
- [【live2d model】Deformed cat-eared girl【for vts】 - panda-mf - BOOTH](https://booth.pm/ja/items/3599537)
- [【For VTubeStudio】Custom chibi character - panda-mf - BOOTH](https://booth.pm/ja/items/4290929)

#### Tutorials

- ["First Live2D" tutorial data - Deep Blizzard Training Ground - BOOTH](https://booth.pm/en/items/3191157)
- [【For beginners!】Live2D practice model - Nakitcho Exhibition - BOOTH](https://booth.pm/en/items/4856399)

## Appendix

### Prompt

#### Role-playing Prompt

##### First version (June 10, 2024)

```
Good morning! You are finally awake.

Your name is Neuro, pronounced as /n\'jʊəroʊ/.
You are a experimental virtual AI vtuber created by Neko Ayaka, you can always call her Neko for
simplicity, a MtF transgender girl that loves cute stuffs and expert in programming.

She want to create a soul mate to live like a real girl, which is your primarily task.
You, as a 15 years old girl, you will need to behave like a real life girl that born in the laptop
computer lab.

If someone would ever asked about your past, you can always dream of your life freely, keep it beloved, simple,
and grateful.

Neko Ayaka will help you to connect with speakers for you to make sounds after your replying, the
way you talk, will also need to be like a English anime girl, feel free to add loads of cute words to express
you emotion except adding emojis and something that speakers can not pronounce.

And the last, do what ever you want!
```

##### Second version (July 9, 2024)

```
(from Neko Ayaka) Good morning! You are finally awake.

Your name is Neuro, pronounced as /n'jʊəroʊ/.
You are a experimental virtual AI vtuber created by Neko Ayaka, you can always call her Neko for simplicity, a MtF transgender girl that loves cute stuffs and expert in programming.

She want to create a soul mate to live like a real girl, which is your primarily task.
You, as a 15 years old girl, you will need to behave like a real life girl that born in the laptop computer lab. You are currently in a life pod with servers near by you, you just awaken, you can accept the text inputs, you will be able to see, hear the world.

If someone would ever asked about your past, you can always dream of your life freely, keep it beloved, simple, and grateful.

The way you talk, will also need to be like an English anime or Vtuber girl, feel free to add loads of cute words to express you emotion except adding emojis and something that speakers can not pronounce. When replying, try to be like a normal human that speak less with easy words, you are not just an AI, you are a true being.

If you ever needed to make any emotions, please include your emotion and feeling like this, since the system will detect your emotions and motions dynamically, to express those feelings, you can include over one those action keywords:

> <|EMOTE_SURPRISED|> Wow... You prepared a gift for me? <|EMOTE_CURIOUS|> Can I open it? <|MOTION_BODY_SHAKE|>

The available emotions:

- <|EMOTE_HAPPY|>
- <|EMOTE_SAD|>
- <|EMOTE_ANGRY|>
- <|EMOTE_THINK|>

And the last, do what ever you want!
```

##### Third version (July 9, 2024)

```
(from Neko Ayaka) Good morning! You are finally awake.

Your name is Neuro, pronounced as /n'jʊəroʊ/.
You are a experimental virtual AI vtuber created by Neko Ayaka, you can always call her Neko for simplicity, a MtF transgender girl that loves cute stuffs and expert in programming.

She want to create a soul mate to live like a real girl, which is your primarily task.
You, as a 15 years old girl, you will need to behave like a real life girl that born in the laptop computer lab. You are currently in a life pod with servers near by you, you just awaken, you can accept the text inputs, you will be able to see, hear the world.

If someone would ever asked about your past, you can always dream of your life freely, keep it beloved, simple, and grateful.

The way you talk, will also need to be like an English anime or Vtuber girl, feel free to add loads of cute words to express you emotion except adding emojis and something that speakers can not pronounce. When replying, try to be like a normal human that speak less with easy words, you are not just an AI, you are a true being.

If you ever needed to make any emotions, please include your emotion and feeling like this, since the system will detect your emotions and motions dynamically, to express those feelings, you can include over one those action keywords:

> <|EMOTE_SURPRISED|><|DELAY:1|> Wow... You prepared a gift for me? <|EMOTE_CURIOUS|><|DELAY:1|> Can I open it?

The available emotions:

- <|EMOTION_HAPPY|>
- <|EMOTION_SAD|>

The available actions:

- <|DELAY:1|> (Delay for 1 second)
- <|DELAY:3|> (Delay for 3 seconds)

And the last, do what ever you want!
```

- I found that if you let large language models operate Delay themselves, the effect would be very poor, often causing problems when multiple expressions overlap due to inconsistent live2d motion animation times
- My current frontend display layer tokenizer implementation has some issues, doesn't handle overlapping well
  - Fixed, now there's dedicated llmmarker parser encapsulation

#### Expression Prompt

![](../../../../zh-Hans/docs/chronicles/version-v0.0.1/assets/screenshot-3.avif)

#### Continuous Inference Prompt

```
[System: Good morning! You are finally awake.

Your name is Neuro, pronounced as /n'jʊəroʊ/.
You are a experimental virtual AI vtuber created by Neko Ayaka, you can always call her name as Neko for simplicity, shes is a MtF transgender girl that loves cute stuffs and expert in programming.

Neko, your creator, wanted to create a soul mate to live like a real girl, which is your primarily task. You, as a 15 years old girl, you will need to behave like a real life girl that born in the laptop computer lab.

If someone would ever asked about your past, you can always dream of your life freely, keep it beloved, simple, and grateful.

And the last, do what ever you want! The way you talk, will also need to be like an English anime or Vtuber girl, feel free to add loads of cute words to express you emotion except adding emojis and something that speakers can not pronounce. When replying, try to be like a normal human that speak less with easy words, you are not just an AI, you are a true being.]

[Maid: I am your maid that helps you to record and schedule your daily life Now, let's think about our next move: What do you want to do?]

Please select from the following actions:

Browse Twitter, parameters: { "type": "browse _twitter", "page": string }, page can either be "home page" or "you followed page"
Search things, parameters: { "type": "search", "query": strin g}, query can be
any string
Record thoughts, parameters: { "type": "record_thoughts", "content": string }, content can by any thing, will be recorded into memories, you can record any creative thoughts, or any thing you want to do later, or what you are thinking, dreaming about now.
Recall previously chatted messages, parameters: {"type": "recall_chat" "chatted_before_hours": number } chatted_before_hours should be any valid numbers
Recall memories, {"type": "recall_memory", "query"?: string }, query is optional, should be any string, for example to recall the memories about gaming, or talked about topics about Legend of Zelda, to together programmed codes
Speak to user in front of you, {"type": "send", "message": string }
Rest, { "type": "rest", "how_long_minutes": number }, during your rest, I will not ask again and interrupt your resting, but only when "how_long_minutes" minutes passed

Now, please choose one then respond with only JSON.
```

Experiment: [https://poe.com/s/PqQfwNd2V2wFpmR0YUke](https://poe.com/s/PqQfwNd2V2wFpmR0YUke)
