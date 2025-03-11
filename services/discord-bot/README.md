# `discord-bot`

Allow アイリ to talk to you and many other users in Discord voice channels.

## Getting started

```shell
git clone git@github.com:moeru-ai/airi.git
pnpm i
```

Create a `.env.local` file:

```shell
cd services/discord-bot
cp .env .env.local
```

Fill-in the following credentials as configurations:

```shell
DISCORD_TOKEN=''
DISCORD_BOT_CLIENT_ID=''

OPENAI_MODEL=''
OPENAI_API_KEY=''
OPENAI_API_BASE_URL=''

ELEVENLABS_API_KEY=''
ELEVENLABS_API_BASE_URL=''
```

```shell
pnpm run -F @proj-airi/discord-bot start
```

## Other similar projects

- [pladisdev/Discord-AI-With-STT](https://github.com/pladisdev/Discord-AI-With-STT)

## Acknowledgements

- Implementation of Audio handling and processing https://github.com/TheTrueSCP/CharacterAIVoice/blob/54d6a41b4e0eba9ad996c5f9ddcc6230277af2f8/src/VoiceHandler.js
- Example of usage https://github.com/discordjs/voice-examples/blob/da0c3b419107d41053501a4dddf3826ad53c03f7/radio-bot/src/bot.ts
- Excellent library https://github.com/discordjs/discord.js
