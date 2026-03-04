### **JSON Field Documentation**

JSON Field Documentation of `SatoriEvent`

* **Root Level**

| Path | Type | Description |
| --- | --- | --- |
| `self_id` | String | The unique ID (QQ number) of the bot receiving the event. |
| `platform` | String | The platform name (e.g., `onebot`). |
| `timestamp` | Number | Unix timestamp (ms) when the event was created. |
| `type` | String | The general event category (e.g., `message-created`). |
| `subtype` | String | The sub-category of the event (e.g., `group`). |
| `subsubtype` | String | Further classification (e.g., `group`). |
| `id` | Integer | Internal sequence ID for the event processing. |
| `sn` | Integer | Serial number for the event. |

* **Message Object**

| Path | Type | Description |
| --- | --- | --- |
| `message` | Object | Container for standardized message details. |
| `message.message_id` | String | Unique identifier for this specific message. |
| `message.content` | String | The plain text content of the message. |

* **User & Member**

| Path | Type | Description |
| --- | --- | --- |
| `user` | Object | Standardized information about the message sender. |
| `user.id` | String | Unique ID of the sender. |
| `user.name` | String | Display name of the sender. |
| `user.avatar` | String | URL to the sender's avatar image. |
| `member` | Object | Context-specific member info (e.g., group membership). |
| `member.nick` | String | The user's nickname/card in this specific group . |
| `member.roles` | Array | List of roles assigned to the user (e.g., `member`). |

* **Context (Guild/Group)**

| Path | Type | Description |
| --- | --- | --- |
| `guild` | Object | Information about the guild/group. |
| `guild.id` | String | Unique ID of the group/guild. |
| `channel` | Object | Information about the channel (often same as guild in QQ groups). |
| `channel.type` | Integer | Channel type classification. |

* **Bot Instance (`login`)**

| Path | Type | Description |
| --- | --- | --- |
| `login` | Object | Information about the bot instance processing this event. |
| `login.user` | Object | The bot's own user details (Name, Avatar, ID). |
| `login.status` | Integer | Connection status (1 = Online). |
| `login.features` | Array | List of supported API features (e.g., `message.create`). |
| `login.adapter` | String | The adapter protocol being used (`onebot`). |

### [Optional] raw data from adapter

e.g. onebot

* **OneBot Data (`_data`)** *Raw payload from the OneBot adapter*

| Path | Type | Description |
| --- | --- | --- |
| `_data.message_type` | String | Type of message (e.g., `group`, `private`). |
| `_data.sub_type` | String | Subtype (e.g., `normal`, `anonymous`). |
| `_data.message_id` | Integer | Message ID as an integer (OneBot standard). |
| `_data.real_id` | Integer | The real message ID from the protocol. |
| `_data.sender` | Object | Sender details specific to OneBot format. |
| `_data.sender.card` | String | The sender's group card/nickname. |
| `_data.raw_message` | String | The unformatted raw string of the message. |
| `_data.message` | Array | Array of message segments (Text, Image, Face, etc.). |
| `_data.group_id` | Integer | The numeric ID of the group. |
| `_data.group_name` | String | The name of the group. |

* **Protocol Raw Data (`_data.raw`)** *Internal low-level protocol data (NTQQ/Lagrange)*

| Path | Type | Description |
| --- | --- | --- |
| `_data.raw.msgId` | String | Protocol-level message ID. |
| `_data.raw.msgSeq` | String | Message sequence number. |
| `_data.raw.elements` | Array | Detailed rich media elements (text, faces, images). |
| `_data.raw.senderUin` | String | Sender's User Internal Number (QQ). |
| `_data.raw.peerUin` | String | Receiver/Group User Internal Number. |
