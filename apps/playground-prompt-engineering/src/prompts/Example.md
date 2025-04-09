## Prompt Template

<script setup>
import { ref } from 'vue';
const showSystemPrompt = ref(true);
const language = ref('JavaScript');
const userQuestion = ref('How to implement a simple counter?');
</script>

<div v-if="showSystemPrompt">

## System Prompt

You are a professional code assistant, please answer the question using {{language}} language.

</div>

## User Prompt

{{userQuestion}}
