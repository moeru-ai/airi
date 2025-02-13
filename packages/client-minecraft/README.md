# 🤖 AIRI-MC

An intelligent Minecraft bot powered by LLM. AIRI can understand natural language commands, interact with the world, and assist players in various tasks.

## 🎥 Preview

![AIRI-MC](./docs/preview.png)

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

- 📦 Node.js 20+
- 🔧 pnpm
- 🎮 A Minecraft server (1.20+)

### 🔨 Installation

1. Clone the repository:

```bash
git clone https://github.com/luoling8192/airi-mc.git
cd airi-mc
```

2. Install dependencies:

```bash
pnpm install
```

3. Create a `.env.local` file with your configuration:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_API_BASEURL=your_openai_api_baseurl

BOT_USERNAME=your_bot_username
BOT_HOSTNAME=localhost
BOT_PORT=25565
BOT_PASSWORD=optional_password
BOT_VERSION=1.20
```

4. Start the bot:

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

### Environment Variables

The bot can be configured using the following environment variables:

#### OpenAI Configuration

- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENAI_API_BASEURL` - OpenAI API base URL (default: OpenAI's official API endpoint)
- `OPENAI_MODEL` - Model to use for chat completion
- `OPENAI_REASONING_MODEL` - Model to use for reasoning tasks

#### Minecraft Bot Configuration

- `MINECRAFT_BOT_USERNAME` - Bot's username (default: "airi-bot")
- `MINECRAFT_BOT_HOSTNAME` - Minecraft server hostname (default: "localhost")
- `MINECRAFT_BOT_PORT` - Minecraft server port (default: 25565)
- `MINECRAFT_BOT_PASSWORD` - Server password if required
- `MINECRAFT_BOT_VERSION` - Minecraft version (default: "1.20")

#### AIRI Configuration

- `AIRI_WS_BASEURL` - WebSocket server URL (default: "ws://localhost:6121/ws")
- `AIRI_CLIENT_NAME` - Client name for AIRI server (default: "minecraft-bot")

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
