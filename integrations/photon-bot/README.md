# iMessage integration (`photon-bot`)

Allow アイリ to answer iMessage texts. The iMessage integration uses the [Photon](https://photon.codes) API.

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

In AIRI, open **Settings → Modules → iMessage**. Enter the Photon project ID and the Photon API key. Then select **Enable iMessage Integration**.

Text the line's number from your iPhone. The bot only answers people who texted first: the shared line cannot start a conversation.

## Settings

The bot takes the Photon project ID and the project API key from two sources:

- The **iMessage** page of AIRI sends them with `module:configure`.
- `PHOTON_PROJECT_ID` and `PHOTON_API_KEY` in `.env.local` apply when the bot starts.

The values from AIRI replace the values from the environment. The bot connects to Photon again with the new values, so a restart is not necessary.

- The **Enable iMessage Integration** switch applies at once. It sends the values that the two fields hold.
- You can select the switch only when both fields have a value.
- **Save** sends a changed project ID or API key. It is available only while the switch is on.
- If you clear the switch, the bot stops reading texts. A text in progress gets no reply.
- When you enable the module again for the same project, the bot continues from the saved cursor.
- When you change the project, the bot starts at the live end of the stream of the new project.
- AIRI sends the settings only when you use the switch or select **Save**. If you start the bot later, select **Save** again, or keep the values in `.env.local`.
- AIRI keeps the values in the local storage of the app. `AIRI_URL`, `AIRI_TOKEN`, and `PHOTON_BASE_URL` come from the environment only.

## Delivery

- The bot handles texts one at a time, in the order that Photon delivers them.
- The bot saves the stream cursor and its project ID in `PHOTON_STATE_FILE` after it sends the reply. After a restart, Photon replays the texts that arrived in the meantime.
- The bot sends each `input:text` with a required delivery. If AIRI has no chat consumer, the bot logs a warning and sends the text again every 3 seconds.
- Each reply uses the idempotency key `airi-reply:<messageId>`, so a replayed text does not reach the person twice.
- The bot marks each text as read and shows the typing bubble until the reply is sent. Both are best effort: a failure is logged and the reply still goes out. The person sees the read receipt only when their privacy settings allow it.
- The reply is the text of the character without the stage control tokens (`<|ACT …|>`, `<|DELAY …|>`). The bot also removes the malformed `<ACT …|>` form that some models write. A reply with no text left is not sent.
- The character sees each text with the prefix `(From iMessage user …1234): `, which keeps only the last four digits of the phone number.

## Replies and tapbacks

Photon Beta does not deliver what this section needs yet. So today an inline reply reaches the character as a plain text with no quote, and a tapback does not reach the character.

- Photon delivers an inline reply without `parentMessageId`. This was seen on a real shared iMessage line on 2026-11-20. The Photon API schema has the field.
- Photon does not deliver an iMessage tapback. Its Beta documentation lists tapbacks as a Stable feature.

The rest of this section applies from the time that Photon delivers both.

AIRI takes plain text only. So an inline reply and a tapback of the person reach the character as a sentence that quotes the message they point to.

| The person does this | The character gets this text |
| --- | --- |
| Answers a message of the character inline | `Replying to your message "Do you want tea?": yes please` |
| Answers one of their own messages inline | `Replying to their own message "tea": I mean coffee` |
| Puts a tapback on a message | `Reacted ❤️ to your message "good night"` |

- A quote is one line of at most 80 characters.
- The bot takes the quoted message from the last 200 messages that it received or sent. For an older message, it reads the message from Photon. This read needs the `project:read` permission.
- If the bot cannot find the message, or the message has no text, the sentence says `a message` in place of the quote.
- The six tapbacks `love`, `like`, `dislike`, `laugh`, `emphasize`, and `question` become ❤️ 👍 👎 😂 ‼️ ❓. Any other value, such as an emoji, goes through as it is.
- A tapback starts one turn of the character, the same as a text. So each tapback costs one request to the chat model, and the character answers it with a message.
- A removed tapback gets no reply.
- The character answers only with plain messages. It cannot send an inline reply or a tapback.

The bot reads a tapback in the shape that the Photon API gives a reaction on other platforms (`content.type` is `reaction`, with `parentMessageId`). The Photon API schema does not have this shape for iMessage yet, so the shape of a real iMessage tapback can differ.

When Photon delivers content that the bot does not handle, the bot writes a warning with the message as JSON. It does this one time for each content type. Each string in the JSON keeps at most 200 characters, and each phone number is masked.

## Rejected API key

Photon answers 401 or 403 when the API key is wrong or revoked, or when it has no access to the project.

- The bot writes one error to its log: `Photon rejected the API key for project <id> (401)`. It does not repeat the error for each retry.
- The bot does not ask AIRI for a reply while Photon rejects the key.
- The bot tries again after 30 seconds. Each later wait is two times longer, up to 10 minutes.
- To correct the key, enter the new key on the **iMessage** page and select **Save**. The bot connects again at once.
- **Save** with the same values also makes the bot try again at once.
- The **iMessage** page does not show this error. The notice on the page means only that the switch is on and both fields have a value.

## Limits

- The bot handles texts. Images, stickers, and voice messages are ignored. Photon has a `group` content type for a message with more than one part, such as a text with an image. The bot ignores it too.
- Photon Beta delivers an inline reply as a plain text, and it does not deliver a tapback. The bot is ready for both, in one direction only, from the person to the character. See [Replies and tapbacks](#replies-and-tapbacks).
- Conversation is strictly turn-based: each text gets one reply. Two quick texts get two separate replies, and the character cannot stay silent or text first.
- Without a fix, the first plain start of AIRI drops the bot's texts until the stage reconnects (moeru-ai/airi#2305). The fix is moeru-ai/airi#2313. This branch includes that pull request until it is merged upstream. On a checkout without it, open **Settings → Connection**, and turn **Expose To All** on and then off. This restarts the channel server, and the stage connects again.
- The first start begins at the live end of the stream. Texts that arrived earlier are not read.
