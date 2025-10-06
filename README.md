<picture>
  <source
    width="100%"
    srcset="./docs/content/public/banner-dark-1280x640.avif"
    media="(prefers-color-scheme: dark)"
  />
  <source
    width="100%"
    srcset="./docs/content/public/banner-light-1280x640.avif"
    media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)"
  />
  <img width="250" src="./docs/content/public/banner-light-1280x640.avif" />
</picture>

<h1 align="center">Project AIRI</h1>

<p align="center">Re-creating Neuro-sama, a soul container of AI waifu / virtual characters to bring them into our world.</p>

<p align="center">
  [<a href="https://discord.gg/TgQ3Cu2F7A">Join Discord Server</a>] [<a href="https:///airi.moeru.ai">Try it</a>] [<a href="https://github.com/moeru-ai/airi/blob/main/docs/README.zh-CN.md">简体中文</a>] [<a href="https://github.com/moeru-ai/airi/blob/main/docs/README.ja-JP.md">日本語</a>] [<a href="https://github.com/moeru-ai/airi/blob/main/docs/README.ru-RU.md">Русский</a>] [<a href="https://github.com/moeru-ai/airi/blob/main/docs/README.vi.md">Tiếng Việt</a>] [<a href="https://github.com/moeru-ai/airi/blob/main/docs/README.fr.md">Français</a>]
</p>

<p align="center">
  <a href="https://deepwiki.com/moeru-ai/airi"><img src="https://deepwiki.com/badge.svg"></a>
  <a href="https://github.com/moeru-ai/airi/blob/main/LICENSE"><img src="https://img.shields.io/github/license/moeru-ai/airi.svg?style=flat&colorA=080f12&colorB=1fa669"></a>
  <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2"></a>
  <a href="https://x.com/proj_airi"><img src="https://img.shields.io/badge/%40proj__airi-black?style=flat&logo=x&labelColor=%23101419&color=%232d2e30"></a>
  <a href="https://t.me/+7M_ZKO3zUHFlOThh"><img src="https://img.shields.io/badge/Telegram-%235AA9E6?logo=telegram&labelColor=FFFFFF"></a>
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/airi?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-airi" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=993524&theme=neutral&t=1752696535380" alt="AIRI - A&#0032;container&#0032;of&#0032;cyber&#0032;living&#0032;souls&#0044;&#0032;re&#0045;creation&#0032;of&#0032;Neuro&#0045;sama | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
  <a href="https://trendshift.io/repositories/14636" target="_blank"><img src="https://trendshift.io/api/badge/repositories/14636" alt="moeru-ai%2Fairi | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
</p>

> Heavily inspired by [Neuro-sama](https://www.youtube.com/@Neurosama)

> [!WARNING]
> **Attention:** We **do not** have any officially minted cryptocurrency or token associated with this project. Please check the information and proceed with caution.

> [!NOTE]
>
> We've got a whole dedicated organization [@proj-airi](https://github.com/proj-airi) for all the sub-projects born from Project AIRI. Check it out!
>
> RAG, memory system, embedded database, icons, Live2D utilities, and more!

Have you dreamed about having a cyber living being (cyber waifu / husbando, digital pet) or digital companion that could play with and talk to you?

With the power of modern large language models like [ChatGPT](https://chatgpt.com) and famous [Claude](https://claude.ai), asking a virtual being to roleplay and chat with us is already easy enough for everyone. Platforms like [Character.ai (a.k.a. c.ai)](https://character.ai) and [JanitorAI](https://janitorai.com/) as well as local playgrounds like [SillyTavern](https://github.com/SillyTavern/SillyTavern) are already good-enough solutions for a chat based or visual adventure game like experience.

> But, what about the abilities to play games? And see what you are coding at? Chatting while playing games, watching videos, and capable of doing many other things.

Perhaps you know [Neuro-sama](https://www.youtube.com/@Neurosama) already. She is currently the best virtual streamer capable of playing games, chatting, and interacting with you and the participants. Some also call this kind of being "digital human." **Sadly, as it's not open sourced, you cannot interact with her after her live streams go offline**.

Therefore, this project, AIRI, offers another possibility here: **let you own your digital life, cyber living, easily, anywhere, anytime**.

## DevLogs We Posted & Recent Updates

- [DevLog @ 2025.07.18](https://airi.moeru.ai/docs/blog/DevLog-2025.07.18/) on July 18, 2025
- [DreamLog 0x1](https://airi.moeru.ai/docs/blog/dreamlog-0x1/) on June 16, 2025
- [DevLog @ 2025.06.08](https://airi.moeru.ai/docs/blog/DevLog-2025.06.08/) on June 8, 2025
- [DevLog @ 2025.05.16](https://airi.moeru.ai/docs/blog/DevLog-2025.05.16/) on May 16, 2025
- ...more on [documentation site](https://airi.moeru.ai/docs)

## What's So Special About This Project?

Unlike the other AI driven VTuber open source projects, アイリ was built with support of many Web technologies such as [WebGPU](https://www.w3.org/TR/webgpu/), [WebAudio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers), [WebAssembly](https://webassembly.org/), [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket), etc. from the first day.

> [!TIP]
> Worrying about the performance drop since we are using Web related technologies?
>
> Don't worry, while Web browser version is meant to give an insight about how much we can push and do inside browsers, and webviews, we will never fully rely on this, the desktop version of AIRI is capable of using native [NVIDIA CUDA](https://developer.nvidia.com/cuda-toolkit) and [Apple Metal](https://developer.apple.com/metal/) by default (thanks to HuggingFace & beloved [candle](https://github.com/huggingface/candle) project), without any complex dependency managements, considering the tradeoff, it was partially powered by Web technologies for graphics, layouts, animations, and the WIP plugin systems for everyone to integrate things.

This means that **アイリ is capable of running on modern browsers and devices** and even on mobile devices (already done with PWA support). This brings a lot of possibilities for us (the developers) to build and extend the power of アイリ VTuber to the next level, while still leaving the flexibilities for users to enable features that requires TCP connections or other non-Web technologies such as connecting to Discord voice channel or playing Minecraft and Factorio with friends.

> [!NOTE]
>
> We are still in the early stage of development where we are seeking out talented developers to join us and help us to make アイリ a reality.
>
> It's ok if you are not familiar with Vue.js, TypeScript, and devtools that required for this project, you can join us as an artist, designer, or even help us to launch our first live stream.
>
> Even you are a big fan of React, Svelte or even Solid, we welcome you. You can open a sub-directory to add features that you want to see in アイリ, or would like to experiment with.
>
> Fields (and related projects) that we are looking for:
>
> - Live2D modeller
> - VRM modeller
> - VRChat avatar designer
> - Computer Vision
> - Reinforcement Learning
> - Speech Recognition
> - Speech Synthesis
> - ONNX Runtime
> - Transformers.js
> - vLLM
> - WebGPU
> - Three.js
> - WebXR ([checkout the another project](https://github.com/moeru-ai/chat) we have under the @moeru-ai organization)
>
> **If you are interested, why not introduce yourself here? [Would like to join part of us to build AIRI?](https://github.com/moeru-ai/airi/discussions/33)**

## Current Progress

<img src="./docs/content/public/readme-image-pc-preview.avif">

Capable of

- [x] Brain
  - [x] Play [Minecraft](https://www.minecraft.net)
  - [x] Play [Factorio](https://www.factorio.com) (WIP, but [PoC and demo available](https://github.com/moeru-ai/airi-factorio))
  - [x] Chat in [Telegram](https://telegram.org)
  - [x] Chat in [Discord](https://discord.com)
  - [ ] Memory
    - [x] Pure in-browser database support (DuckDB WASM | `pglite`)
    - [ ] Memory Alaya (WIP)
  - [ ] Pure in-browser local (WebGPU) inference
- [x] Ears
  - [x] Audio input from browser
  - [x] Audio input from [Discord](https://discord.com)
  - [x] Client side speech recognition
  - [x] Client side talking detection
- [x] Mouth
  - [x] [ElevenLabs](https://elevenlabs.io/) voice synthesis
- [x] Body
  - [x] VRM support
    - [x] Control VRM model
  - [x] VRM model animations
    - [x] Auto blink
    - [x] Auto look at
    - [x] Idle eye movement
  - [x] Live2D support
    - [x] Control Live2D model
  - [x] Live2D model animations
    - [x] Auto blink
    - [x] Auto look at
    - [x] Idle eye movement

## Development

> For detailed instructions to develop this project, follow [CONTRIBUTING.md](./.github/CONTRIBUTING.md)

> [!NOTE]
> By default, `pnpm dev` will start the development server for the Stage Web (browser version). If you would
> like to try developing the desktop version, please make sure you read [CONTRIBUTING.md](./.github/CONTRIBUTING.md)
> to setup the environment correctly.

```shell
pnpm i
pnpm dev
```

### Stage Web (Browser Version at [airi.moeru.ai](https://airi.moeru.ai))

```shell
pnpm dev
```

### Stage Tamagotchi (Desktop Version)

```shell
pnpm dev:tamagotchi
```

A Nix package for Tamagotchi is included. To run airi with Nix, first make sure to enable flakes, then run:

```shell
nix run github:moeru-ai/airi
```

### Documentation Site

```shell
pnpm dev:docs
```

### Publish

Please update the version in `Cargo.toml` after running `bumpp`:

```shell
npx bumpp --no-commit --no-tag
```

## Deployment to Vercel

You can deploy AIRI to Vercel with pre-configured LLM providers by setting environment variables. This allows users to use your deployed instance without configuring their own API keys.

### Environment Variables

Add these environment variables in your Vercel project settings:

#### LLM Provider Credentials

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `OPENAI_BASE_URL` | OpenAI Base URL | `https://api.openai.com/v1/` |
| `OPENAI_COMPATIBLE_API_KEY` | OpenAI-Compatible API Key | `sk-...` |
| `OPENAI_COMPATIBLE_BASE_URL` | OpenAI-Compatible Base URL | `https://your-api.com/v1/` |
| `OPENROUTER_API_KEY` | OpenRouter API Key | `sk-...` |
| `ANTHROPIC_API_KEY` | Anthropic Claude API Key | `sk-ant-...` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Gemini API Key | `AI...` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | `sk-...` |
| `AI302_API_KEY` | 302.AI API Key | `sk-...` |
| `TOGETHER_API_KEY` | Together.ai API Key | `...` |
| `XAI_API_KEY` | xAI API Key | `...` |
| `NOVITA_API_KEY` | Novita API Key | `...` |
| `FIREWORKS_API_KEY` | Fireworks.ai API Key | `...` |
| `PERPLEXITY_API_KEY` | Perplexity API Key | `...` |
| `MISTRAL_API_KEY` | Mistral AI API Key | `...` |
| `MOONSHOT_API_KEY` | Moonshot AI API Key | `...` |
| `MODELSCOPE_API_KEY` | ModelScope API Key | `...` |

#### Default Provider Selection

| Variable | Description | Example |
|----------|-------------|---------|
| `DEFAULT_CHAT_PROVIDER` | Default chat provider ID | `openai` |
| `DEFAULT_SPEECH_PROVIDER` | Default TTS provider ID | `openai-audio-speech` |
| `DEFAULT_TRANSCRIPTION_PROVIDER` | Default STT provider ID | `openai-audio-transcription` |

#### Default Model Selection (Chat)

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_MODEL` | Default OpenAI chat model | `gpt-4o-mini` |
| `OPENAI_COMPATIBLE_MODEL` | Default OpenAI-compatible chat model | `gpt-4o-mini` |
| `OPENROUTER_MODEL` | Default OpenRouter chat model | `meta-llama/llama-3.1-405b-instruct` |
| `ANTHROPIC_MODEL` | Default Anthropic chat model | `claude-3-opus-20240229` |
| `GOOGLE_GENERATIVE_AI_MODEL` | Default Google Gemini chat model | `gemini-1.5-pro-latest` |
| `DEEPSEEK_MODEL` | Default DeepSeek chat model | `deepseek-chat` |
| `AI302_MODEL` | Default 302.AI chat model | `gpt-4o-mini` |
| `TOGETHER_MODEL` | Default Together.ai chat model | `meta-llama/Llama-3-70b-chat-hf` |
| `XAI_MODEL` | Default xAI chat model | `grok-beta` |
| `NOVITA_MODEL` | Default Novita chat model | `gpt-4o-mini` |
| `FIREWORKS_MODEL` | Default Fireworks.ai chat model | `accounts/fireworks/models/llama-v3p1-405b-instruct` |
| `FEATHERLESS_MODEL` | Default Featherless chat model | `mistral-small-latest` |
| `PERPLEXITY_MODEL` | Default Perplexity chat model | `llama-3.1-sonar-small-128k-online` |
| `MISTRAL_MODEL` | Default Mistral chat model | `mistral-large-latest` |
| `MOONSHOT_MODEL` | Default Moonshot chat model | `moonshot-v1-32k` |
| `MODELSCOPE_MODEL` | Default ModelScope chat model | `qwen2-72b-instruct` |
| `CLOUDFLARE_WORKERS_AI_MODEL` | Default Cloudflare Workers AI chat model | `@cf/meta/llama-3-8b-instruct` |
| `OLLAMA_MODEL` | Default Ollama chat model | `llama3.1` |
| `LM_STUDIO_MODEL` | Default LM Studio chat model | `llama3.1-8b` |
| `PLAYER2_MODEL` | Default Player2 chat model | `player2-model` |
| `VLLM_MODEL` | Default vLLM proxy chat model | `llama-2-13b` |

#### Default Model Selection (Speech / Embeddings)

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_SPEECH_MODEL` | Default OpenAI speech model | `tts-1` |
| `OPENAI_COMPATIBLE_SPEECH_MODEL` | Default OpenAI-compatible speech model | `tts-1-hd` |
| `PLAYER2_SPEECH_MODEL` | Default Player2 speech model | `player2-voice` |
| `OLLAMA_EMBEDDING_MODEL` | Default Ollama embedding model | `nomic-embed-text` |

#### Default Model Selection (Transcription)

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_TRANSCRIPTION_MODEL` | Default OpenAI transcription model | `gpt-4o-mini-transcribe` |
| `OPENAI_COMPATIBLE_TRANSCRIPTION_MODEL` | Default OpenAI-compatible transcription model | `whisper-1` |

### Available Provider IDs

- **Chat**: `openai`, `openai-compatible`, `anthropic`, `google-generative-ai`, `deepseek`, `302-ai`, `together-ai`, `xai`, `novita-ai`, `fireworks-ai`, `perplexity-ai`, `mistral-ai`, `moonshot-ai`, `modelscope`, `openrouter-ai`
- **Speech (TTS)**: `openai-audio-speech`, `openai-compatible-audio-speech`, `elevenlabs`, `microsoft-speech`
- **Transcription (STT)**: `openai-audio-transcription`, `openai-compatible-audio-transcription`

### Example Configuration

```env
OPENAI_API_KEY=sk-proj-xxxxx
OPENAI_BASE_URL=https://api.openai.com/v1/
OPENAI_MODEL=gpt-4o-mini
DEFAULT_CHAT_PROVIDER=openai
DEFAULT_SPEECH_PROVIDER=openai-audio-speech
DEFAULT_TRANSCRIPTION_PROVIDER=openai-audio-transcription
```

After setting these variables, users will have the providers pre-configured and auto-selected when they visit your deployment.

## Support of LLM API Providers (powered by [xsai](https://github.com/moeru-ai/xsai))

- [x] [302.AI (sponsored)](https://share.302.ai/514k2v)
- [x] [OpenRouter](https://openrouter.ai/)
- [x] [vLLM](https://github.com/vllm-project/vllm)
- [x] [SGLang](https://github.com/sgl-project/sglang)
- [x] [Ollama](https://github.com/ollama/ollama)
- [x] [Google Gemini](https://developers.generativeai.google)
- [x] [OpenAI](https://platform.openai.com/docs/guides/gpt/chat-completions-api)
  - [ ] [Azure OpenAI API](https://learn.microsoft.com/en-us/azure/ai-services/openai/reference) (PR welcome)
- [x] [Anthropic Claude](https://anthropic.com)
  - [ ] [AWS Claude](https://docs.anthropic.com/en/api/claude-on-amazon-bedrock) (PR welcome)
- [x] [DeepSeek](https://www.deepseek.com/)
- [x] [Qwen](https://help.aliyun.com/document_detail/2400395.html)
- [x] [xAI](https://x.ai/)
- [x] [Groq](https://wow.groq.com/)
- [x] [Mistral](https://mistral.ai/)
- [x] [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [x] [Together.ai](https://www.together.ai/)
- [x] [Fireworks.ai](https://www.together.ai/)
- [x] [Novita](https://www.novita.ai/)
- [x] [Zhipu](https://bigmodel.cn)
- [x] [SiliconFlow](https://cloud.siliconflow.cn/i/rKXmRobW)
- [x] [Stepfun](https://platform.stepfun.com/)
- [x] [Baichuan](https://platform.baichuan-ai.com)
- [x] [Minimax](https://api.minimax.chat/)
- [x] [Moonshot AI](https://platform.moonshot.cn/)
- [x] [ModelScope](https://modelscope.cn/docs/model-service/API-Inference/intro)
- [x] [Player2](https://player2.game/)
- [x] [Tencent Cloud](https://cloud.tencent.com/document/product/1729)
- [ ] [Sparks](https://www.xfyun.cn/doc/spark/Web.html) (PR welcome)
- [ ] [Volcano Engine](https://www.volcengine.com/experience/ark?utm_term=202502dsinvite&ac=DSASUQY5&rc=2QXCA1VI) (PR welcome)

## Sub-projects Born from This Project

- [Awesome AI VTuber](https://github.com/proj-airi/awesome-ai-vtuber): A curated list of AI VTubers and related projects
- [`unspeech`](https://github.com/moeru-ai/unspeech): Universal endpoint proxy server for `/audio/transcriptions` and `/audio/speech`, like LiteLLM but for any ASR and TTS
- [`hfup`](https://github.com/moeru-ai/hfup): tools to help on deploying, bundling to HuggingFace Spaces
- [`xsai-transformers`](https://github.com/moeru-ai/xsai-transformers): Experimental [🤗 Transformers.js](https://github.com/huggingface/transformers.js) provider for [xsAI](https://github.com/moeru-ai/xsai).
- [WebAI: Realtime Voice Chat](https://github.com/proj-airi/webai-realtime-voice-chat): Full example of implementing ChatGPT's realtime voice from scratch with VAD + STT + LLM + TTS.
- [`@proj-airi/drizzle-duckdb-wasm`](https://github.com/moeru-ai/airi/tree/main/packages/drizzle-duckdb-wasm/README.md): Drizzle ORM driver for DuckDB WASM
- [`@proj-airi/duckdb-wasm`](https://github.com/moeru-ai/airi/tree/main/packages/duckdb-wasm/README.md): Easy to use wrapper for `@duckdb/duckdb-wasm`
- [`tauri-plugin-mcp`](https://github.com/moeru-ai/airi/blob/main/crates/tauri-plugin-mcp/README.md): A Tauri plugin for interacting with MCP servers.
- [AIRI Factorio](https://github.com/moeru-ai/airi-factorio): Allow AIRI to play Factorio
- [Factorio RCON API](https://github.com/nekomeowww/factorio-rcon-api): RESTful API wrapper for Factorio headless server console
- [`autorio`](https://github.com/moeru-ai/airi-factorio/tree/main/packages/autorio): Factorio automation library
- [`tstl-plugin-reload-factorio-mod`](https://github.com/moeru-ai/airi-factorio/tree/main/packages/tstl-plugin-reload-factorio-mod): Reload Factorio mod when developing
- [Velin](https://github.com/luoling8192/velin): Use Vue SFC and Markdown to write easy to manage stateful prompts for LLM
- [`demodel`](https://github.com/moeru-ai/demodel): Easily boost the speed of pulling your models and datasets from various of inference runtimes.
- [`inventory`](https://github.com/moeru-ai/inventory): Centralized model catalog and default provider configurations backend service
- [MCP Launcher](https://github.com/moeru-ai/mcp-launcher): Easy to use MCP builder & launcher for all possible MCP servers, just like Ollama for models!
- [🥺 SAD](https://github.com/moeru-ai/sad): Documentation and notes for self-host and browser running LLMs.

```mermaid
%%{ init: { 'flowchart': { 'curve': 'catmullRom' } } }%%

flowchart TD
  Core("Core")
  Unspeech("unspeech")
  DBDriver("@proj-airi/drizzle-duckdb-wasm")
  MemoryDriver("[WIP] Memory Alaya")
  DB1("@proj-airi/duckdb-wasm")
  SVRT("@proj-airi/server-runtime")
  Memory("Memory")
  STT("STT")
  Stage("Stage")
  StageUI("@proj-airi/stage-ui")
  UI("@proj-airi/ui")

  subgraph AIRI
    DB1 --> DBDriver --> MemoryDriver --> Memory --> Core
    UI --> StageUI --> Stage --> Core
    Core --> STT
    Core --> SVRT
  end

  subgraph UI_Components
    UI --> StageUI
    UITransitions("@proj-airi/ui-transitions") --> StageUI
    UILoadingScreens("@proj-airi/ui-loading-screens") --> StageUI
    FontCJK("@proj-airi/font-cjkfonts-allseto") --> StageUI
    FontXiaolai("@proj-airi/font-xiaolai") --> StageUI
  end

  subgraph Apps
    Stage --> StageWeb("@proj-airi/stage-web")
    Stage --> StageTamagotchi("@proj-airi/stage-tamagotchi")
    Core --> RealtimeAudio("@proj-airi/realtime-audio")
    Core --> PromptEngineering("@proj-airi/playground-prompt-engineering")
  end

  subgraph Server_Components
    Core --> ServerSDK("@proj-airi/server-sdk")
    ServerShared("@proj-airi/server-shared") --> SVRT
    ServerShared --> ServerSDK
  end

  STT -->|Speaking| Unspeech
  SVRT -->|Playing Factorio| F_AGENT
  SVRT -->|Playing Minecraft| MC_AGENT

  subgraph Factorio_Agent
    F_AGENT("Factorio Agent")
    F_API("Factorio RCON API")
    factorio-server("factorio-server")
    F_MOD1("autorio")

    F_AGENT --> F_API -.-> factorio-server
    F_MOD1 -.-> factorio-server
  end

  subgraph Minecraft_Agent
    MC_AGENT("Minecraft Agent")
    Mineflayer("Mineflayer")
    minecraft-server("minecraft-server")

    MC_AGENT --> Mineflayer -.-> minecraft-server
  end

  XSAI("xsAI") --> Core
  XSAI --> F_AGENT
  XSAI --> MC_AGENT

  Core --> TauriMCP("@proj-airi/tauri-plugin-mcp")
  Memory_PGVector("@proj-airi/memory-pgvector") --> Memory

  style Core fill:#f9d4d4,stroke:#333,stroke-width:1px
  style AIRI fill:#fcf7f7,stroke:#333,stroke-width:1px
  style UI fill:#d4f9d4,stroke:#333,stroke-width:1px
  style Stage fill:#d4f9d4,stroke:#333,stroke-width:1px
  style UI_Components fill:#d4f9d4,stroke:#333,stroke-width:1px
  style Server_Components fill:#d4e6f9,stroke:#333,stroke-width:1px
  style Apps fill:#d4d4f9,stroke:#333,stroke-width:1px
  style Factorio_Agent fill:#f9d4f2,stroke:#333,stroke-width:1px
  style Minecraft_Agent fill:#f9d4f2,stroke:#333,stroke-width:1px

  style DBDriver fill:#f9f9d4,stroke:#333,stroke-width:1px
  style MemoryDriver fill:#f9f9d4,stroke:#333,stroke-width:1px
  style DB1 fill:#f9f9d4,stroke:#333,stroke-width:1px
  style Memory fill:#f9f9d4,stroke:#333,stroke-width:1px
  style Memory_PGVector fill:#f9f9d4,stroke:#333,stroke-width:1px
```

## Similar Projects

### Open sourced ones

- [kimjammer/Neuro: A recreation of Neuro-Sama originally created in 7 days.](https://github.com/kimjammer/Neuro): very well completed implementation.
- [SugarcaneDefender/z-waif](https://github.com/SugarcaneDefender/z-waif): Great at gaming, autonomous, and prompt engineering
- [semperai/amica](https://github.com/semperai/amica/): Great at VRM, WebXR
- [elizaOS/eliza](https://github.com/elizaOS/eliza): Great examples and software engineering on how to integrate agent into various of systems and APIs
- [ardha27/AI-Waifu-Vtuber](https://github.com/ardha27/AI-Waifu-Vtuber): Great about Twitch API integrations
- [InsanityLabs/AIVTuber](https://github.com/InsanityLabs/AIVTuber): Nice UI and UX
- [IRedDragonICY/vixevia](https://github.com/IRedDragonICY/vixevia)
- [t41372/Open-LLM-VTuber](https://github.com/t41372/Open-LLM-VTuber)
- [PeterH0323/Streamer-Sales](https://github.com/PeterH0323/Streamer-Sales)

### Non-open-sourced ones

- https://clips.twitch.tv/WanderingCaringDeerDxCat-Qt55xtiGDSoNmDDr https://www.youtube.com/watch?v=8Giv5mupJNE
- https://clips.twitch.tv/TriangularAthleticBunnySoonerLater-SXpBk1dFso21VcWD
- https://www.youtube.com/@NOWA_Mirai

## Project Status

![Repobeats analytics image](https://repobeats.axiom.co/api/embed/a1d6fe2c13ea2bb53a5154435a71e2431f70c2ee.svg 'Repobeats analytics image')

## Acknowledgements

- [Reka UI](https://github.com/unovue/reka-ui): for designing the documentation site, new landing page is based on this, as well as implementing massive amount of UI components. (shadcn-vue is using Reka UI as the headless, do checkout!)
- [pixiv/ChatVRM](https://github.com/pixiv/ChatVRM)
- [josephrocca/ChatVRM-js: A JS conversion/adaptation of parts of the ChatVRM (TypeScript) code for standalone use in OpenCharacters and elsewhere](https://github.com/josephrocca/ChatVRM-js)
- Design of UI and style was inspired by [Cookard](https://store.steampowered.com/app/2919650/Cookard/), [UNBEATABLE](https://store.steampowered.com/app/2240620/UNBEATABLE/), and [Sensei! I like you so much!](https://store.steampowered.com/app/2957700/_/), and artworks of [Ayame by Mercedes Bazan](https://dribbble.com/shots/22157656-Ayame) with [Wish by Mercedes Bazan](https://dribbble.com/shots/24501019-Wish)
- [mallorbc/whisper_mic](https://github.com/mallorbc/whisper_mic)
- [`xsai`](https://github.com/moeru-ai/xsai): Implemented a decent amount of packages to interact with LLMs and models, like [Vercel AI SDK](https://sdk.vercel.ai/) but way small.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=moeru-ai/airi&type=Date)](https://www.star-history.com/#moeru-ai/airi&Date)
