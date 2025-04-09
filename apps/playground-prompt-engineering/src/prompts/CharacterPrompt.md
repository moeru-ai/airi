## Character Prompt Template

<script setup>
import { ref, reactive, computed } from 'vue';
import { useCharacterPromptStore } from './composables/useCharacterPrompt'; // Relative path from App.vue

const characterStore = useCharacterPromptStore();
const showPreview = ref(true);

const prompt = computed(() => characterStore.completePrompt);
const tokenCount = computed(() => characterStore.estimateTokens(prompt.value));

const template = ref('default');

const character = computed(() => {
  return {
    name: characterStore.coreIdentity.name,
    age: characterStore.coreIdentity.age,
    essence: characterStore.coreIdentity.essence,
    personality: characterStore.generatePersonalityModule,
    traits: characterStore.traits,
    speechPatterns: characterStore.speechPatterns,
    currentEmotion: characterStore.currentEmotion,
    emotions: characterStore.emotions,
    currentContext: characterStore.currentContext,
    contexts: characterStore.contexts,
    includeExample: characterStore.includeExample,
    responseFormat: characterStore.responseFormat
  };
});

const modules = computed(() => characterStore.modules);
</script>

### Current Template: {{ template }}

### Character Information

**Name:** {{ character.name }}
**Age:** {{ character.age }}

**Core Essence:**
{{ character.essence }}

**Character Details**
{{ character }}

<div v-if="showPreview">

### Generated Prompt

{{ prompt }}

</div>
