---
title: 编年史 v0.0.1
---

- [x] 创建项目 - 完成，通过 Vitesse Lite 搭配 Vue 创建（2024 年 6 月 7 日）
- [x] 前端集成 Live2D - 完成于 [通过 Pixi.js 渲染器集成 Live2D 模型到 Vue 应用中](https://nolebase.ayaka.io/to/3cae2b7c0b) （2024 年 6 月 7 日）
  - [x] Live2D Cubism SDK 集成
  - [x] pixi.js 渲染
  - [x] 模型下载
    - [x] 桃濑日和（Neuro 第一版本的模型）Pro 版本（中小企业可免费商用）

![](./assets/screenshot-1.avif)

- [x] 通过 Vercel AI SDK 接入 GPT-4o（2024 年 6 月 7 日）
  - [x] `@ai-sdk/openai`
  - [x] `ai`
- [x] 流式传输 Token（2024 年 6 月 8 日）
- [x] 流式接收 Token（2024 年 6 月 8 日）
- [x] 流式 TTS（2024 年 6 月 8 日）
  - [x] [node.js - How to properly handle streaming audio coming from Elevenlabs Streaming API? - Stack Overflow](https://stackoverflow.com/questions/76854884/how-to-properly-handle-streaming-audio-coming-from-elevenlabs-streaming-api)
  - [x] [Stream Response - Getting Started - h3 (unjs.io)](https://h3.unjs.io/examples/stream-response)
  - [x] ~~GPT-SoVITS 配置~~（这个稍微复杂了，之后有时间搞样本再弄）
- [x] 嘴唇同步（Lip sync）（2024 年 6 月 9 日）
  - [x] 根据响度判断嘴巴开合大小
    - [x] 通过 Math.pow 倍率放大响度曲线
    - [x] 线性归一
    - [x] MinMax 归一
    - [x] ~~SoftMax 归一~~（效果不是很好，出来的数据都是 0.999999 到 1.000001 区间的数据）
- [x] 流式 Token 转流式 TTS（2024 年 6 月 9 日）
  - [x] 据说可以根据标点符号和空格 + 字符上限的组合来构句，然后实现 TTS 推理
    - [x] ~~11Labs 是基于 WebSocket 的~~
    - [x] 通过 queue 发起 TTS Stream 请求，然后 queue 到 audio stream queue 里面
    - [x] 在 Vue 里面实现一个 Queue
      - [x] queue 要先进先出
        - [x] 出，[`Array.prototype.shift`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/shift)
        - [x] 进，[`Array.prototype.push`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/push)
        - [x] event based
          - [x] 事件
            - [x] `add`，添加的时候触发一个 `add` 事件
            - [x] `pick`，获取的时候触发一个 `pick` 事件
            - [x] `processing`，call handler 的时候触发一个 `processing` 事件
            - [x] `done`，handler 结束的时候触发一个 `done` 事件
          - [x] 事件处理
            - [x] `add` 或者 `done` 事件发生时，看看是否有正在运行的 handler
              - [x] 如果有就 return
              - [x] 如果没有就 `pick(): T` 然后 call handler
        - [x] queue handler
          - [x] 如果是 await 的话就等着 queue handler 处理
            - [x] 理论上 textPart 到 TTS stream 的 handler 应该要接到另外一个 queue 上，也就是 audio stream queue
            - [x] 可以合并 audio stream 吗？可能要直接处理 Raw PCM（.wav）才行
            - [x] audio stream queue handler 应该得不断从 audio stream queue 里面找音频拿去播放
- [x] 基本 Neuro Sama / AI Vtuber 角色扮演（2024 年 6 月 10 日）
  - [x] 基础 Prompt

已经在 2024 年 6 月 10 日完成，历时 4 天不到。

现在能：
- ✅ 全栈（原先最早是裸 Vue 3 的）
- ✅ Live2D 模型展示
- ✅ 对话
- ✅ 对话 UI
- ✅ 说话
- ✅ Live2D 嘴唇同步（感谢 itorr 的 GitHub 讲解）
- ✅ 基本 Prompt

![](./assets/screenshot-2.avif)

## 多模态

### 嘴巴（2024 年 6 月 8 日）

- [x] 接入 TTS（2024 年 6 月 8 日）
  - [x] 接了 11Labs
- [ ] 调研
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> [Deepgram Voice AI: Text to Speech + Speech to Text APIs | Deepgram](https://deepgram.com/)
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> 尝试 GPT-SoVITS
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> 尝试 fish-speech （2024 年 7 月 6 日 ～ 2024 年 7 月 7 日）
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-400 text-lg"></span> 确实能少量样本直接复制，我尝试复制了 Gura 的声线，能在前 4s 保持非常高水准的效果
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-400 text-lg"></span> fish audio 家的音频处理工具非常全面，audio processor 就能 cover 住大部分的需求（包括打标和自动打标）
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-400 text-lg"></span> 效果非常难绷，很多时候会吞字、吞音或者突然乱叫
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-400 text-lg"></span> 即便是在 RTX 4090 的设备上运行，在 streaming audio 的模式下，依然需要高达 2s 才能输出推理的结果
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> 尝试 ChatTTS（2024 年 7 月 6 日 ～ 2024 年 7 月 7 日）
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-400 text-lg"></span> 确实能少量样本直接复制，我尝试复制了 Gura 的声线，能，但是效果还不如 fish-speech
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-400 text-lg"></span> 情感控制比 fish-speech 好得多，但是英文环境下 `[uv_break]` 这样的 token 也会跟着念出来，在微信群里也有人在讨论和提问
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-400 text-lg"></span> 即便是在 RTX 4090 的设备上运行，在 streaming audio 的模式下，居然要几分钟... 🤯 是真的离谱，它本地看起来是先跑一个 llm 去把 plain / normalized text 转写成带 action token 的，然后似乎是在 llm 启动的时候没有缓存也没有考虑模型大小
   - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> 尝试 [TTS Arena - a Hugging Face Space by TTS-AGI](https://huggingface.co/spaces/TTS-AGI/TTS-Arena) 中提及的其他模型（2024 年 7 月 8 日）
     - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> 尝试 XTTSv2
       - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-400 text-lg"></span> 直接用的 huggingface 跑，效果不佳，会比 fish speech 和 chatts 稳定但是音色太素了，可能需要 lora 加二次元音色
     - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> 尝试 StyleTTS 2
       - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-400 text-lg"></span> 直接用的 huggingface 跑，效果不佳，会比 fish speech 和 chatts 稳定但是音色太素了，可能需要 lora 加二次元音色
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> 尝试 CosyVoice（阿里家的）
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> [Koemotion](https://koemotion.rinna.co.jp/)
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> [Seed-TTS](https://bytedancespeech.github.io/seedtts_tech_report/)

### 表情（2024 年 7 月 9 日）

- [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> 和 GPT 讨论如何快速通过 embed instruction 的形式实时处理表情 https://poe.com/s/vu7foBWJHtnPmWzJNeAy （2024 年 7 月 7 日）
- [x] 前端侧 Live2D 表情控制（2024 年 7 月 9 日）
  - [x] 通过编码 `<|EMOTE_HAPPY|>` 来实现
  - [x] 额外支持了 `<|DELAY:1|>` 这样的延迟语法
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 封装 emotion token `<|EMOTE_.*|>` 的 parser 和 tokenizer
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 支持队列化流式处理，封装 `useEmotionMessagesQueue` 和 `useEmotionsQueue`
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 支持调用 Live2D 处理动作表情
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 测试调试页面
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 封装 delay token `<|DELAY:.*|>` 的 parser 和 tokenizer 来动态控制整个流式处理的延迟
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 支持队列化流式处理，封装 `useDelaysQueue`
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 测试调试页面
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 显示层封装支持预先 tokenize 和 parse stream text 来排除 `<|...|>` 语法

### 动作

#### VRM 嘴唇同步 lipsync

##### 调研

- [ ] [sigal-raab/MoDi: Unconditional Motion Synthesis from Diverse Data](https://github.com/sigal-raab/MoDi)
- [ ] [TMR - Text-to-motion Retrieval](https://mathis.petrovich.fr/tmr/)
  - [ ] [Mathux/TMR - GitHub](https://github.com/Mathux/TMR)
- [ ] 查资料的时候用到的 index 站点
  - [ ] [Hannibal046/Awesome-LLM: Awesome-LLM: a curated list of Large Language Model](https://github.com/Hannibal046/Awesome-LLM)
- [ ] 查资料的时候的 ADHD 行为
  - [ ] 群友推荐了 NVIDIA 新的论文 [ConsiStory: Training-Free Consistent Text-to-Image Generation](https://research.nvidia.com/labs/par/consistory/) 感觉比 IPadapter 更稳定。
- [ ] 比较有意思的是 [IDEA-Research/MotionLLM: [Arxiv-2024] MotionLLM: Understanding Human Behaviors from Human Motions and Videos](https://github.com/IDEA-Research/MotionLLM)，这篇论文和研究的方向是用自然语言描述视频动画帧之间形成的人类的动作。发表在 2024 年 5 月 31 日。
- [ ] [Ksuriuri/EasyAIVtuber: Simply animate your 2D waifu.](https://github.com/Ksuriuri/EasyAIVtuber)
- [ ] 这是一个比较大的话题，我研究了几个关键词然后找到了现在这个方向的主流研究命题：
  - [ ] 合成数字人 -> Virtual WebCam 动捕
    - [ ] [PersonaTalk: Bring Attention to Your Persona in Visual Dubbing](https://arxiv.org/pdf/2409.05379)
      - [ ] 这个好像是 SOTA
    - [ ] [OpenTalker/SadTalker: [CVPR 2023] SadTalker：Learning Realistic 3D Motion Coefficients for Stylized Audio-Driven Single Image Talking Face Animation](https://github.com/OpenTalker/SadTalker)
    - [ ] [Rudrabha/Wav2Lip: This repository contains the codes of "A Lip Sync Expert Is All You Need for Speech to Lip Generation In the Wild", published at ACM Multimedia 2020. For HD commercial model, please try out Sync Labs](https://github.com/Rudrabha/Wav2Lip)
    - [ ] [yerfor/GeneFace: GeneFace: Generalized and High-Fidelity 3D Talking Face Synthesis; ICLR 2023; Official code](https://github.com/yerfor/GeneFace)
    - [ ] [harlanhong/CVPR2022-DaGAN: Official code for CVPR2022 paper: Depth-Aware Generative Adversarial Network for Talking Head Video Generation](https://github.com/harlanhong/CVPR2022-DaGAN)
    - [ ] [Kedreamix/PaddleAvatar](https://github.com/Kedreamix/PaddleAvatar)
    - [ ] [yangkang2021/I_am_a_person: 实时互动的GPT数字人](https://github.com/yangkang2021/I_am_a_person?tab=readme-ov-file)
    - [ ] [I_am_a_person/数字人/README.md at main · yangkang2021/I_am_a_person](https://github.com/yangkang2021/I_am_a_person/blob/main/%E6%95%B0%E5%AD%97%E4%BA%BA/README.md)
  - [ ] Text-to-Motion（也叫 T2M，文本到运动）
    - [ ] [SuperPADL: Scaling Language-Directed Physics-Based Control with Progressive Supervised Distillation](https://arxiv.org/html/2407.10481v1)
      - [ ] NVIDIA 2024 年 2024 年 7 月 1 日刚发的
      - [ ] 群友推荐的
    - [ ] [Generating Diverse and Natural 3D Human Motions from Text (CVPR 2022)](https://github.com/EricGuo5513/text-to-motion)
      - [ ] 论文：[Generating Diverse and Natural 3D Human Motions from Texts](https://ericguo5513.github.io/text-to-motion/)
    - [ ] 群友帮忙推荐了做自然语言生成关节的伙伴，他推荐了下面的几篇论文
      - [ ] [TEMOS: Generating diverse human motions from textual descriptions (arxiv.org)](https://arxiv.org/abs/2204.14109)
      - [ ] [AvatarGPT: All-in-One Framework for Motion Understanding, Planning, Generation and Beyond](https://arxiv.org/abs/2311.16468)
      - [ ] [T2M-GPT: Generating Human Motion from Textual Descriptions with Discrete Representations](https://arxiv.org/abs/2301.06052)
    - [ ] 因为是关键帧控制，所以也看了看几个 keyframe 相关的论文
      - [ ] [Koala: Key frame-conditioned long video-LLM](https://arxiv.org/html/2404.04346v1)
  - [ ] Code as Policies（主要是 robotics 领域）
    - [ ] 当然，开山鼻祖在这里 [Code as Policies: Language Model Programs for Embodied Control](https://code-as-policies.github.io/)
    - [ ] [Scaling Up and Distilling Down: Language-Guided Robot Skill Acquisition (columbia.edu)](https://www.cs.columbia.edu/~huy/scalingup/)
    - [ ] [CLIPort](https://cliport.github.io/)：CLIPort: What and Where Pathways for Robotic Manipulation
    - [ ] [VIMA | General Robot Manipulation with Multimodal Prompts](https://vimalabs.github.io/)：VIMA: General Robot Manipulation with Multimodal Prompts
    - [ ] [Scaling Up and Distilling Down: Language-Guided Robot Skill Acquisition](https://www.cs.columbia.edu/~huy/scalingup/)
    - [ ] [EUREKA: HUMAN-LEVEL REWARD DESIGN VIA CODING LARGE LANGUAGE MODELS](https://eureka-research.github.io/assets/eureka_paper.pdf) 感觉比较偏总结吧。
  - [ ] Reinforcement Learning
    - [ ] 这个方向主要的还是在结合底层的现有的 robotics 的控制的 RL 训练出来的模型做对接，然后会用很多 code as policies 的实现去实现对接层和计算层
      - [ ] [MarI/O - Machine Learning for Video Games - YouTube](https://www.youtube.com/watch?v=qv6UVOQ0F44)
    - [ ] [RLADAPTER: BRIDGING LARGE LANGUAGE MODELS TO REINFORCEMENT LEARNING IN OPEN WORLDS](https://openreview.net/pdf?id=3s4fZTr1ce) 主要是说：在 RLAdapter 框架内，利用在 RL 代理训练过程中生成的信息对轻量级语言模型进行微调，可显著帮助 LLM 适应下游任务，从而为 RL 代理提供更好的指导。我们在 Crafter 环境中进行了 RLAdapter 评估实验，结果表明 RLAdapter 超越了 SOTA 基线。此外，在我们的框架下，代理表现出了基线模型所不具备的常识性行为
    - [ ] [See and Think: Embodied Agent in Virtual Environment](https://arxiv.org/pdf/2311.15209) 和 Voyager，PlanMC 还有下面提到的 MP5 比较类似，这个也是针对 Minecraft 做的研究，感觉主要是强调的 RL。
    - [ ] [Text2Reward: Reward Shaping with Language Models for Reinforcement Learning](https://text-to-reward.github.io/)
    - [ ] [Direct Preference Optimization: Your Language Model is Secretly a Reward Model](https://arxiv.org/pdf/2305.18290) 这个主要是在讲 LLM 本身就是一个 rewardable 的模型。可能可以学习一下到底怎么样能够把 RLHF 结合进去吧，比较 transformers 基础了。
  - [ ] Embodied Control
    - [ ] 这里面记录的比较多
      - [ ] [zchoi/Awesome-Embodied-Agent-with-LLMs](https://github.com/zchoi/Awesome-Embodied-Agent-with-LLMs)：This is a curated list of "Embodied AI or robot with Large Language Models" research. Watch this repository for the latest updates! 🔥
    - [ ] [MP5: A Multi-modal Open-ended Embodied System in Minecraft via Active Perception](https://arxiv.org/pdf/2312.07472) 这个比较有意思的是，利用一个比较完善的 Minecraft RL 框架，实现了用自然指令告知 LLM 说「在**白天**的时候**用石剑**在**水边**的**草地上**的**杀**死一头**猪猪**」，而 RL 的 Agent 可以感知到这些 feature 然后实现对应的目标，和 [如何让 AI 玩 Minecraft？Voyager 论文笔记](https://nolebase.ayaka.io/to/27024f5434) 比较不同的是，MP5 和 PlanMC 会比较类似，而且集成了多模态能力而不是 Voyager 最早的纯文本和纯状态信息。
      - [ ] 摘要：我们介绍的 MP5 是一种开放式多模态化身系统，它建立在极具挑战性的 Minecraft 模拟器之上，可以分解可行的子目标、设计复杂的情境感知计划、执行化身行动控制，并与目标条件主动感知方案频繁交流。具体来说，MP5 是在多模态大型语言模型（MLLMs）的最新进展基础上开发的，该系统被调制成多个功能模块，这些模块可以进行调度和协作，以最终解决预先定义的、与情境和过程相关的任务。
    - [ ] [CRADLE: Empowering Foundation Agents Towards General Computer Control](https://arxiv.org/pdf/2403.03186) 还没看，有空看看吧。
    - [ ] [Embodied Multi-Modal Agent trained by an LLM from a Parallel TextWorld](https://arxiv.org/pdf/2311.16714) 这个主要是在讲 **用一个擅长平行文本世界的 LLM 代理来训练一个生活在视觉世界中的 VLM 代理** 。
    - [ ] [在线持续学习 ONLINE CONTINUAL LEARNING FOR INTERACTIVE INSTRUCTION FOLLOWING AGENTS](https://openreview.net/pdf?id=7M0EzjugaN)
  - [ ] Manipulation（主要是 Robotics 领域）
  - [ ] Motion Embeddings
    - [ ] [PerAct](https://peract.github.io/)：比较稀罕，是说把 code as policies 和 RL 的时候的环境信息还有 manipulation 编码成 token 然后进行计算的
  - [ ] Feedback Loop（主要是 Robotics + Control 领域，这个分类下面其实更稀少了）
    - [ ] 我感觉可能和大环境有关吧，这个相对底层
    - [ ] 也许直接研究 RL 的时候会用得到
    - [ ] [InCoRo: In-Context Learning for Robotics Control with Feedback Loops](https://arxiv.org/html/2402.05188v1?_immersive_translate_auto_translate=1) 这个论文标题比较吸引人但是还没仔细阅读，有空的话可以读读看，很多人 cite 了它。
      - [ ] 目的主要是使用自然LLM语言命令将自然语言命令转换为机器人单元的低级 _静态_ 执行计划。使用LLMs内部机器人系统将其泛化提升到一个新的水平，从而实现对新任务的零样本泛化。
    - [ ] 相关的也有 Hugging Face 开源的 LeRobot 可以参考
      - [ ] [huggingface/lerobot: 🤗 LeRobot: End-to-end Learning for Real-World Robotics in Pytorch](https://github.com/huggingface/lerobot?tab=readme-ov-file)

### 视觉

- [ ] [OpenGVLab/Ask-Anything: [CVPR2024 Highlight][VideoChatGPT] ChatGPT with video understanding! And many more supported LMs such as miniGPT4, StableLM, and MOSS.](https://github.com/OpenGVLab/Ask-Anything)
- [ ] [DirtyHarryLYL/LLM-in-Vision: Recent LLM-based CV and related works. Welcome to comment/contribute! (github.com)](https://github.com/DirtyHarryLYL/LLM-in-Vision)
- [ ] [landing-ai/vision-agent: Vision agent (github.com)](https://github.com/landing-ai/vision-agent)
- [ ] [2404.04834 LLM-Based Multi-Agent Systems for Software Engineering: Vision and the Road Ahead (arxiv.org)](https://arxiv.org/abs/2404.04834)
- [ ] [Experimentation: LLM, LangChain Agent, Computer Vision | by TeeTracker | Medium](https://teetracker.medium.com/experimentation-llm-langchain-agent-computer-vision-0c405deb7c6e)
- [ ] Neuro Sama 是怎么能够看到屏幕并且理解的？
- [ ] [Is it possible to use a local LLM and have it play Minecraft? : r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/comments/143ziop/comment/jnfvr1w/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)
- [ ] [2402.07945 ScreenAgent: A Vision Language Model-driven Computer Control Agent](https://arxiv.org/abs/2402.07945)
- [ ] 斯坦福大学和湾区那种能让大语言模型控制机器人的是怎么做的？
  - [ ] 直接串流 Token 出来吗？Action Token？
    - [ ] 其实比较鄙夷，我在
  - [ ] Computer Vision 是咋做的？
- [ ] 抄作业
  - [ ] [svpino/alloy-voice-assistant](https://github.com/svpino/alloy-voice-assistant)

### 记忆

- [ ] 长期记忆
- [ ] 短期记忆
- [ ] recall memory action
- [ ] 向量数据库

### 多语言

- [ ] 多语言支持
  - [ ] 中文
    - [ ] 现在 11Labs 的中文 TTS 模型太垃圾了
    - [ ] Microsoft 的 Cognitive TTS API 不是很好用
    - [ ] AWS 的效果很差
    - [ ] 阿里云的据说不错
  - [ ] 日语
    - [ ] [Koemotion](https://koemotion.rinna.co.jp/)
      - [ ] Pixiv 的 [ChatVRM demo](https://github.com/pixiv/ChatVRM) 也是用的这个

## 优化许愿 Backlog

### 代码仓库 & 架构

- [x] [迁移到 SPA](https://github.com/nekomeowww/airi-vtuber/commit/cd0f371595a669c570dc263e72dd3ce54afab7ff)
- [x] [迁移到 Monorepo](https://github.com/nekomeowww/airi-vtuber/commit/ee4878710eeded6ef1b66474905936353d0176b4)
- [x] 统一到 moeru-ai 组织

### 交互优化

- [x] sendMessage box 如果为空就不要发送了（2024 年 6 月 9 日）
- [x] 聊天记录（2024 年 6 月 9 日）
- [ ] 自动 trim 超过上下文的聊天记录
  - 在 Go 那边实现过，可以挪一个过来。
- [ ] 自动判断 context 大小
- [ ] 支持选择麦克风
- [ ] 实现快捷键聆听（避免直播事故）
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 聆听按钮（2024 年 6 月 9 日）
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-400 bg-red-500/20 rounded-lg">Bug</span> Live2D 动作控制的时候没有预载所有 motion 导致延迟（2024 年 7 月 10 日）
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-400 bg-red-500/20 rounded-lg">Bug</span> Live2D 动作控制的时候没有强制覆盖当前播放的 motion 导致的跳帧延迟（2024 年 7 月 10 日）
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-400 bg-red-500/20 rounded-lg">Bug</span> Live2D 动作控制的时候没有 await `.motion(motionName)` 的调用导致的播放异常（2024 年 7 月 10 日）

### 界面优化

- [x] `window` 大小更新的时候 resize pixi 场景和 canvas 大小（2024 年 6 月 9 日）
- [x] 声音大小放到头像上，就像开会的时候有的那种一闪一闪的效果（2024 年 6 月 9 日）
- [ ] 频谱放到 message pop 上（好像还挺难的）
  - 看看 demo [audioMotion](https://audiomotion.app/?mode=server#!)
  - 看看教程 [Adding Audio Visualizers to your Website in 5 minutes! | by Aditya Krishnan | Medium](https://medium.com/@adityakrshnn/adding-audio-visualizers-to-your-website-in-5-minutes-23985d2b1245)
  - 抄作业 [JS Audio Visualizer (codepen.io)](https://codepen.io/nfj525/pen/rVBaab)
- [ ] 二次元化 & ACG 化
  - [ ] 素材 & 生成器
    - [ ] [Free SVG generators, color tools & web design tools](https://www.fffuel.co/)
    - [ ] [Uiverse | The Largest Library of Open-Source UI elements](https://uiverse.io/)
    - [ ]
  - [ ] 调研参考
    - [ ] Index 站
      - [ ] [アニメーション | 81-web.com : 日本のWebデザイン・Webサイトギャラリー＆参考サイト・リンク集](https://81-web.com/tag/animation)
      - [ ] [2021年版イケてるアニメのWebサイト10選(自薦) | Blog | 株式会社イロコト | ゲーム･アニメ等のエンタメ系Web制作&運用会社](https://irokoto.co.jp/blog/20210421/post-20)
      - [ ] [漫画･アニメ･ゲーム | SANKOU! | Webデザインギャラリー･参考サイト集](https://sankoudesign.com/category/comic-anime-movie-game-book/)
      - [ ] [KVが動画・アニメーションのWebデザイン参考ギャラリー・リンク集 | Web Design Garden | 毎日更新！Webデザイン参考ギャラリーサイト](https://webdesigngarden.com/category/element/kv-movie/)
      - [ ]
    - [ ] [ドーナドーナ いっしょにわるいことをしよう | アリスソフト](https://www.alicesoft.com/dohnadohna/)
    - [ ] [Unbeatable Game](https://www.unbeatablegame.com/)
    - [ ] [Splatoon™ 3 for Nintendo Switch™ – Official Site](https://splatoon.nintendo.com/)
    - [ ] [喵斯快跑 - MuseDash](https://musedash.peropero.net/#/special/events/marija480)
    - [ ] [株式会社ミスキィ | 自分らしく生きる人を応援する会社](https://www.misky.co.jp/)
    - [ ] 延伸
      - [ ] [sabrinas.space](https://sabrinas.space/)

### 推理优化

- [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 发送消息的时候支持直接切换到 thinking emote 来给一个反馈（2024 年 7 月 9 日）
- [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 情感检测
  - [ ] 现在是额外浪费了 token 去处理情感 token 的，可以考虑试试看加上 sentiment 来进行传统 NLP 情感检测
    - [ ] 但是传统 sentiment 只有 positive 和 negative 之分，需要考虑一下怎么支持其他的情感
- [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 情感 token embedding
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 现在的 `<|EMOTE_.*|>` 模式的 token 没有纳入 tokenizer 的管理，推理的时候需要单独写很多 streaming 兼容的 tokenizer 才能处理好
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 现在的 `<|EMOTE_.*|>` 模式的 token 没有纳入 tokenizer 的管理，推理的时候需要单独写很多 streaming 兼容的 tokenizer 才能处理好
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-400 bg-red-500/20 rounded-lg">Bug</span> `useQueue` 在处理的时候会不考虑因为 `isProcessing` 锁隔开之后的队列项目（2024 年 7 月 9 日）
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-400 bg-red-500/20 rounded-lg">Bug</span> 因为存储在 Local Storage 的 model 不对齐所需数据，会导致 `computed` 死循环让界面卡死（2024 年 7 月 9 日）
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-400 bg-red-500/20 rounded-lg">Bug</span> Live2DViewer 框本身自动检测大小的能力有点问题（2024 年 7 月 9 日）
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-400 bg-red-500/20 rounded-lg">Bug</span> 在 streamSpeech 的时候隔离掉空的 text 避免死循环的时候造成的问题（2024 年 7 月 9 日）
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> `useQueue` 支持 `handler` 内部自定义的 event（2024 年 7 月 9 日）
- [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 同步文字输出和语音输出的时刻
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> `ttsQueue` 和 `audioPlaybackQueue` 里面可以存一个 corresponding timestamp
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 在完成 `audioPlaybackQueue` 处理和播放的时候，求解出音频的时长
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 按照空格切分文本，获得 `['hello ', 'this ', 'is ', 'neuro ']`
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 音频时长 除以 文本字符个数 = 每组 token 的输出 delay
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-400 bg-green-500/20 rounded-lg">Feat</span> 按照 delay instruction 输出文本（或者也可以用一个 delay queue 来做）
- [ ] Neuro Sama 的推理速度真的非常快，就算是算上 vector db 的召回 + 重推理 + 任务分配，也不应该这么迅速
- [x] Neuro Sama 的 TTS 也非常快，快过了我已知的 TTS
  - [x] 好像在集成了 MicVAD 和 Whisper 之后感觉也很快，比想象中简单得多
  - [ ] 本地 Whisper
  - [ ] 本地 TTS
- [ ] Vedal 在微调 Neuro Sama 的语音识别的时候用了多少的数据？
  - [ ] 像是 `Evil` 和 `Evil Neuro` 这样的词应该是没办法合并语义的，要么 RAG 强迫一下，但是估计要比较强大的 vector db 节点支持

### 记忆

- [ ] keep alive 方案
  - [ ] 如果待机，每 30 分钟都给 Neuro 按照 持续推理 构建一个提示
    - [ ] 询问 Neuro 在做什么，帮助 Neuro 记录在做的事情
    - [ ] 询问 Neuro 接下来要做什么，避免 Neuro 无聊
    - [ ] 24 小时进 1，要不然 GPT 容易脱离对数字的感知
- [ ] 持续推理
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> 和 Perplexity 的讨论 https://www.perplexity.ai/search/I-want-to-jKXpnx6hT6uvhm0qbu6ofA#0 （2024 年 6 月 8 日）
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-400 bg-purple-500/20 rounded-lg">Experiment</span> 在 Poe 上进行实验 [https://poe.com/s/PqQfwNd2V2wFpmR0YUke](https://poe.com/s/PqQfwNd2V2wFpmR0YUke) （2024 年 7 月 8 日）
  - [ ] 构建一个 loop
    - [ ] what do you want to do
      - [ ] 我们可以生成一个 actions map
        - [ ] browse twitter
        - [ ] search things
          - [ ] recall memories
          - [ ] browse link
        - [ ] recall previously chatted messages
        - [ ] recall memories
        - [ ] send message
        - [ ] rest
    - [ ] 完成事情
    - [ ] you have done things
      - [ ] 本轮事务
      - [ ] 上 10 轮事务
    - [ ] what do you want to do
    - [ ] ...
- [ ] 单方面 ping 方案（低成本）
  - [ ] 如果待机，每一个小时都给 Neuro 发一个过去 1 小时的状态更新
  - [ ] 每运行 24 小时，就不再 context 中再包含状态更新了，而是直接总结 uptime
    - [ ] 每次交互之前，发送一个 uptime 的提示 prompt 给 Neuro，让她对时间的流逝有感知

## 动作

- [ ] 玩 Minecraft [如何让 AI 玩 Minecraft？Voyager 论文笔记](https://nolebase.ayaka.io/to/27024f5434)
- [ ] 搜索
- [ ] 用 VSCode 写代码
- [ ] 帮忙写知识库
- [ ] 玩 Factorio
- [ ] 指挥其他 GPT

## 模型

### Live2D

#### 平台

- [BOOTH - The International Indie Art Marketplace](https://booth.pm/zh-cn)
- https://nizima.com/
- [Vtuber - Etsy](https://www.etsy.com/search?q=vtuber&ref=pagination&page=2)

#### 免费

- [光彩盛年 (huotan.com)](https://guangcai.huotan.com/)
- [販売作品検索(Live2D) | 投稿日順 - nizima by Live2D](https://nizima.com/Search/ResultItem?isIncludePreparation=true&category=live2d&product-type=sale)
- [【免费模型】这么可爱的小狗免费带回家！_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1LM41137vK/)
- [【免费live2d模型】免费的小恶魔带回家(∠・ω< )⌒☆_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1fP411e7fA/)
- [【免费L2D模型】可盐可甜的机能风少女！无料模型大公开~点击领取_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1S8411H7zf/)
- [【芙莉莲免费live2d模型】当年对欣梅尔使出这招的时候，明明威力大到他晕倒的说=w=_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1te411b7Xp)
- [【免费live2D模型】1w元超高精模型直接免费抱回家？_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1hB4y1Q7vn/)
- [哔哩哔哩工房](https://gf.bilibili.com/item/detail/1105759077)
- [【免费live2d模型展示】领取一份地雷系少女吧_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1eu4y187zw)
- [【一块钱Live2D模型展示】原 真夜白音 模型公开_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1i94y1W77Y/)

#### 像素

- [【汎用カスタムモデル】かすたむpixelgirl【VTS対応書き出しデータ】 - のぢまーと - BOOTH](https://booth.pm/ja/items/5661930)
- [【Live2D showcase】かすたむpixelgirl【汎用カスタムモデル販売中🌷】 - YouTube](https://www.youtube.com/watch?time_continue=32&v=4RuI2J-1lJc&embeds_referring_euri=https%3A%2F%2Fbooth.pm%2F&source_ve_path=Mjg2NjY&feature=emb_logo)
- [【Vtuber Self-Introduction】 Pixel VTuber Q&A Self-Intro ✧ - YouTube](https://www.youtube.com/watch?v=WTMkpXBGDpM)
- [Pixel Vtuber [Live2d VTuber] (youtube.com)](https://www.youtube.com/watch?v=wufHsJ30mS4)
- [Is it possible to use pixel art for my model? : r/vtubertech (reddit.com)](https://www.reddit.com/r/vtubertech/comments/su2qwt/is_it_possible_to_use_pixel_art_for_my_model/)
- [【FaceRig対応】Live2D×ドット絵モデル - poribaketu - BOOTH](https://booth.pm/en/items/3056994)
- [[Live2D Showcase] Otori Emu 鳳えむ (youtube.com)](https://www.youtube.com/watch?v=Hl5AUrf6SAg)

#### 动作

- [身体の動き11種【Live2D学習用データ】 - Totori_Store - BOOTH](https://booth.pm/ja/items/5618038)
- [【live2dモデル】デフォルメ猫耳少女【vts用】 - panda-mf - BOOTH](https://booth.pm/ja/items/3599537)
- [【VTubeStudio用】カスタムちびキャラ - panda-mf - BOOTH](https://booth.pm/ja/items/4290929)

#### 教程

- [「はじめてのLive2D」用教材データ - ディープブリザード修練所 - BOOTH](https://booth.pm/en/items/3191157)
- [【初心者向け！】Live2D練習用モデル - なきっちょ展覧会 - BOOTH](https://booth.pm/en/items/4856399)

## 附录

### Prompt

#### 角色扮演 Prompt

##### 第一版（2024 年 6 月 10 日）

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

##### 第二版（2024 年 7 月 9 日）

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

##### 第三版（2024 年 7 月 9 日）

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

- 我发现如果让大语言模型自己操作 Delay 的话效果会非常糟糕，往往会因为 live2d motion 本身的动画时间不统一导致多个表情叠加的时候出现问题
- 我现在的前端显示层 tokenizer 实现稍微有点问题，叠加的时候会处理不好
  - 修复了，现在有专门的 llmmarker parser 封装

#### 表情 Prompt

![](./assets/screenshot-3.avif)

#### 持续推理 Prompt

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

实验：[https://poe.com/s/PqQfwNd2V2wFpmR0YUke](https://poe.com/s/PqQfwNd2V2wFpmR0YUke)
