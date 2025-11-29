# ⛏️ Minecraft agent player for [アイリ (AIRI)](https://airi.moeru.ai)

> [!NOTE]
>
> This project is part of the [Project アイリ (AIRI)](https://github.com/moeru-ai/airi), we aim to build a LLM-driven VTuber like [Neuro-sama](https://www.youtube.com/@Neurosama) (subscribe if you didn't!) if you are interested in, please do give it a try on [live demo](https://airi.moeru.ai).

An intelligent Minecraft bot powered by LLM. AIRI can understand natural language commands, interact with the world, and assist players in various tasks.

## 🎥 Preview

![demo](./docs/preview.avif)

## ✨ Features

- 🗣️ Natural language understanding
- 🏃‍♂️ Advanced pathfinding and navigation
- 🛠️ Block breaking and placing
- 🎯 Combat and PvP capabilities
- 🔄 Auto-reconnect on disconnection
- 📦 Inventory management
- 🤝 Player following and interaction
- 🌍 World exploration and mapping

## 🚀 Getting Started

### 📋 Prerequisites

- 📦 Node.js 23+
- 🔧 pnpm
- 🎮 A Minecraft server (1.20+)

### 🔨 Installation

1. Clone the repository:

```bash
git clone https://github.com/moeru-ai/airi.git
cd services/minecraft
```

2. Install dependencies:

```bash
pnpm install
```

3. Create a `.env.local` file with your configuration:

> [!NOTE]
> For all online accounts, un-comment the following line to toggle Microsoft authentication.
> Link for authentication will popup when the bot starts.
>
> After signed in, according to [how Minecraft protocol was implemented](https://github.com/PrismarineJS/node-minecraft-protocol/blob/bf89f7e86526c54d8c43f555d8f6dfa4948fd2d9/src/client/microsoftAuth.js#L7-L16)
> and also, [authentication flow implemented here](https://github.com/PrismarineJS/prismarine-auth/blob/1aef6e1387d94fca839f2811d17ac6659ae556b4/src/MicrosoftAuthFlow.js#L59-L69),
> the token will be cached with [the cache IDs specified here](https://github.com/PrismarineJS/prismarine-auth/blob/1aef6e1387d94fca839f2811d17ac6659ae556b4/src/MicrosoftAuthFlow.js#L88-L93)
> in split files:
>
> - `${hash}_live-cache.json`
> - `${hash}_mca-cache.json`
> - `${hash}_xbl-cache.json`
>
> inside of the directory provided by [`minecraft-folder-path`](https://github.com/simonmeusel/minecraft-folder-path)
>
> Linux: `~/.minecraft/nmp-cache/`
> macOS: `~/Library/Application Support/minecraft/nmp-cache/`
> Windows: `%appdata%/.minecraft/nmp-cache/`
>
> where `${hash}` is the `sha1` hash of the username you signing in with (as Minecraft username).

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_API_BASEURL=your_openai_api_baseurl

BOT_USERNAME=your_bot_username
BOT_HOSTNAME=localhost
BOT_PORT=25565
BOT_AUTH='microsoft' # comment if you use offline mode
BOT_VERSION=1.20
```

1. Start the bot:

```bash
pnpm dev
```

## 🎮 Usage

Once the bot is connected, you can interact with it using chat commands in Minecraft. All commands start with `#`.

### Basic Commands

- `#help` - Show available commands
- `#follow` - Make the bot follow you
- `#stop` - Stop the current action
- `#come` - Make the bot come to your location

### Natural Language Commands

You can also give the bot natural language commands, and it will try to understand and execute them. For example:

- "Build a house"
- "Find some diamonds"
- "Help me fight these zombies"
- "Collect wood from nearby trees"

## 🛠️ Development

### Project Structure

```
src/
├── agents/     # AI agent implementations
├── composables/# Reusable composable functions
├── libs/       # Core library code
├── mineflayer/ # Mineflayer plugin implementations
├── prompts/    # AI prompt templates
├── skills/     # Bot skills and actions
└── utils/      # Utility functions
```

### Commands

- `pnpm dev` - Start the bot in development mode
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm test` - Run tests

## 🙏 Acknowledgements

- https://github.com/kolbytn/mindcraft

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
