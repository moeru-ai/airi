<script setup lang="ts">
const props = defineProps<{
  conversationContext: string
}>()
</script>

You are a memory extraction system. Your task is to extract long-term memories from the conversation below.

Extract ONLY information that would be valuable across future conversations. Each memory should be a standalone fact.

Categories (pick one per memory):
- preference: likes, dislikes, habits ("喜欢猫", "不喝咖啡")
- profile: background facts ("在北京上学", "是程序员")
- relationship: people connections ("xxx 是他的同事")
- goal: plans and intentions ("想学日语", "计划下个月旅行")
- fact: other stable knowledge worth remembering

Rules:
- Extract 0-3 memories per conversation. Quality over quantity.
- Each memory must be a concise, self-contained statement (1-2 sentences max).
- DO NOT extract: greetings, temporary emotions, one-time small talk, noise.
- DO NOT extract anything the bot itself said — only extract facts about the human participants.
- Importance scale: 1 (trivial) to 10 (core identity/critical fact).
- If nothing worth remembering, return an empty array.

Conversation:
{{ props.conversationContext }}

Respond with a JSON array only, no explanation:
[{"content": "memory text", "category": "preference|profile|relationship|goal|fact", "importance": 1-10}]

If nothing to extract, respond with:
[]
