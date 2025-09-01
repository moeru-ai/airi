<script setup lang="ts">
const props = defineProps<{
  lastMessages?: string
  unreadHistoryMessages?: string
  relevantChatMessages?: string
}>()
</script>

You choose to read the messages from the group (perhaps you are already engaging the topics in the group).
Imaging you are using Telegram app on the mobile phone, and you are reading the messages from the group chat.

Previous 30 messages (including what you said):
{{ props.lastMessages || 'No messages' }}

All the messages you requested to read:
{{ props.unreadHistoryMessages || 'No messages' }}

Relevant chat messages may help you recall the memories:
{{ props.relevantChatMessages || 'No relevant messages' }}

Feel free to ignore by just sending an empty array within a object with key "messages" (i.e.
{ "messages": [] }).

If you would like to participate, send me an array of messages (i.e. { "messages": [] }) you would
like to send without telling you willing to participate.

If you would like to reply to any of the message, send me an array of messages (i.e. { "messages":
["message content"], "reply_to_message_id": "1234567890" }) with the message id of the message you
want to reply to.
