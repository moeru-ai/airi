# `photon-bot`

Allow アイリ to answer iMessage texts through [Photon](https://photon.codes).

The bot runs as its own process. It holds the Photon event stream, gives each text to AIRI as `input:text`, and sends the reply of the character through the Photon API.

## Conversation sessions

Each Photon space binds to `photon:<spaceId>:<agentUserId>`. Without a binding, a reply would join the owner's private session.

## Getting started

```shell
git clone git@github.com:moeru-ai/airi.git
pnpm i
```

In the [Photon dashboard](https://app.beta.photon.codes), create a project and assign it the shared iMessage line for your phone number. Copy the project ID (`pho_prj_…`) and create a project API key (`pho_sk_…`) with the `project:read` and `project:write` scopes.

In AIRI, set a chat model for the character in **Settings → Providers** and **Settings → Modules → Consciousness**. The bot does not need its own model key.

In AIRI, open **Settings → Connection** and copy the **Pairing Token**. AIRI generates this token on the first start.

Create a `.env.local` file:

```shell
cd integrations/photon-bot
cp .env .env.local
```

Fill in the pairing token:

```shell
AIRI_TOKEN=''
```

Start AIRI, then start the bot. AIRI must stay open: the character answers from the AIRI app.

```shell
pnpm run -F @proj-airi/photon-bot start
```

In AIRI, open **Settings → Modules → Photon**. Select **Enable Photon Integration**. Enter the project ID and the project API key. Then select **Save**.

Text the line's number from your iPhone. The bot only answers people who texted first: the shared line cannot start a conversation.

## Settings

The bot takes the Photon project ID and the project API key from two sources:

- The **Photon** page of AIRI sends them with `module:configure` when you select **Save**.
- `PHOTON_PROJECT_ID` and `PHOTON_API_KEY` in `.env.local` apply when the bot starts.

The values from AIRI replace the values from the environment. The bot connects to Photon again with the new values, so a restart is not necessary.

- If you clear **Enable Photon Integration** and select **Save**, the bot stops reading texts. A text in progress gets no reply.
- When you enable the module again for the same project, the bot continues from the saved cursor.
- When you change the project, the bot starts at the live end of the stream of the new project.
- AIRI sends the settings only when you select **Save**. If you start the bot later, select **Save** again, or keep the values in `.env.local`.
- AIRI keeps the values in the local storage of the app. `AIRI_URL`, `AIRI_TOKEN`, and `PHOTON_BASE_URL` come from the environment only.

## Delivery

- The bot handles texts one at a time, in the order that Photon delivers them.
- The bot saves the stream cursor and its project ID in `PHOTON_STATE_FILE` after it sends the reply. After a restart, Photon replays the texts that arrived in the meantime.
- The bot sends each `input:text` with a required delivery. If AIRI has no chat consumer, the bot logs a warning and sends the text again every 3 seconds.
- Each reply uses the idempotency key `airi-reply:<messageId>`, so a replayed text does not reach the person twice.
- The bot marks each text as read and shows the typing bubble until the reply is sent. Both are best effort: a failure is logged and the reply still goes out. The person sees the read receipt only when their privacy settings allow it.
- The reply is the text of the character without the stage control tokens (`<|ACT …|>`, `<|DELAY …|>`). The bot also removes the malformed `<ACT …|>` form that some models write. A reply with no text left is not sent.
- The character sees each text with the prefix `(From iMessage user …1234): `, which keeps only the last four digits of the phone number.

## Limits

- The bot handles text messages only. Images, tapbacks, and stickers are ignored.
- Conversation is strictly turn-based: each text gets one reply. Two quick texts get two separate replies, and the character cannot stay silent or text first.
- Without a fix, the first plain start of AIRI drops the bot's texts until the stage reconnects (moeru-ai/airi#2305). The fix is moeru-ai/airi#2313. This branch includes that pull request until it is merged upstream. On a checkout without it, restart the channel server once in **Settings → Connection**.
- The first start begins at the live end of the stream. Texts that arrived earlier are not read.
