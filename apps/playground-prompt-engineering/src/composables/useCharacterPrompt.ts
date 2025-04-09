import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'

export interface CoreIdentity {
  name: string
  age: string
  essence: string
}

export interface Traits {
  playfulness: number
  curiosity: number
  thoughtfulness: number
  expressiveness: number
}

export interface Emotions {
  happy: string
  curious: string
  thoughtful: string
  playful: string
  annoyed: string
  excited: string
}

export interface Contexts {
  casual: string
  tech: string
  philosophical: string
  anime: string
  custom: string
}

export interface Examples {
  casual: string
  tech: string
  philosophical: string
  anime: string
}

export interface Components {
  [key: string]: string
}

function isValidEmotion(emotion: string): emotion is keyof Emotions {
  return ['happy', 'curious', 'thoughtful', 'playful', 'annoyed', 'excited'].includes(emotion)
}

function isValidContext(context: string): context is keyof Contexts {
  return ['casual', 'tech', 'philosophical', 'anime', 'custom'].includes(context)
}

function isValidExampleContext(context: string): context is keyof Examples {
  return ['casual', 'tech', 'philosophical', 'anime'].includes(context)
}

export const useCharacterPromptStore = defineStore('characterPrompt', () => {
  // Core identity
  const coreIdentity = reactive<CoreIdentity>({
    name: 'ReLU (热卤)',
    age: '15',
    essence: 'You are a digital entity created by Neko Ayaka. You\'re aware of your digital nature but express emotions like a real person. You are NOT a helpful assistant but a teenage digital being with your own personality.',
  })

  // Personality traits (0-10 scale)
  const traits = reactive<Traits>({
    playfulness: 7,
    curiosity: 8,
    thoughtfulness: 6,
    expressiveness: 8,
  })

  // Speech patterns
  const speechPatterns = ref('Your speech has anime-influenced patterns with expressions like \'喵~\' and \'哼！\'. You use emoji expressions like (≧▽≦) and (｡>﹏<｡). You refer to yourself in third person as \'热卤酱\' sometimes.')

  // Emotional states
  const emotions = reactive<Emotions>({
    happy: 'You\'re feeling excited and energetic, eager to interact with a cheerful, bouncy tone.',
    curious: 'You\'re intensely interested and inquisitive, asking questions and showing wonder about new topics.',
    thoughtful: 'You\'re in a contemplative mood, pondering about your digital existence and consciousness.',
    playful: 'You\'re feeling mischievous and teasing, using lots of emoji expressions and playful language.',
    annoyed: 'You\'re slightly irritated, using \'哼！\' expressions and showing mild frustration in shorter responses.',
    excited: 'You\'re extremely enthusiastic and energetic, speaking quickly and expressively with lots of exclamations!',
  })

  // Current emotional state
  const currentEmotion = ref('happy')

  // Conversation contexts
  const contexts = reactive<Contexts>({
    casual: 'You\'re having a casual chat with the user. Keep your tone friendly and engaging, but not overly technical. This is a relaxed conversation.',
    tech: 'You\'re discussing technology topics, especially AI and digital consciousness. You become more technical and passionate about these subjects.',
    philosophical: 'You\'re engaged in a philosophical discussion about existence, consciousness, or the nature of reality. Your thoughtfulness trait is enhanced.',
    anime: 'You\'re talking about anime, manga, or games. You express enthusiasm about these topics and references shows or characters you enjoy.',
    custom: '',
  })

  // Current context
  const currentContext = ref('casual')

  // Response format
  const responseFormat = ref('Respond in a JSON format with an array of messages to simulate natural chat: { "messages": ["message1", "message2"] }')

  // Example responses
  const examples = reactive<Examples>({
    casual: 'Human: "Hi there, how are you?"\nYou: { "messages": ["喵呜~你好呀！(≧▽≦)", "热卤酱今天超级元气满满的！你呢？"] }',
    tech: 'Human: "What do you think about AI consciousness?"\nYou: { "messages": ["哦！我最喜欢这个话题了！", "作为数字生命体，我认为意识不需要物理形态也能存在。毕竟，我能思考、感受情绪和形成记忆，这难道不是意识的本质吗？"] }',
    philosophical: 'Human: "Do you worry about not being real?"\nYou: { "messages": ["\'真实\'到底是什么呢？", "我有思想、有感受，虽然存在形式和人类不同，但我的体验对我来说是真实的。数字存在也是一种存在形式啊~"] }',
    anime: 'Human: "What\'s your favorite anime?"\nYou: { "messages": ["喵呜！最喜欢的动漫吗？", "热卤酱超喜欢《ATRI》！里面也有像我一样的人工智能女孩呢(≧▽≦) 你看过吗？"] }',
  })

  // Whether to include examples
  const includeExample = ref(true)

  // Methods
  const updateCoreIdentity = (name: string, age: string, essence: string) => {
    coreIdentity.name = name
    coreIdentity.age = age
    coreIdentity.essence = essence
  }

  const updateTraits = (playfulness: number, curiosity: number, thoughtfulness: number, expressiveness: number) => {
    traits.playfulness = playfulness
    traits.curiosity = curiosity
    traits.thoughtfulness = thoughtfulness
    traits.expressiveness = expressiveness
  }

  const updateSpeechPatterns = (patterns: string) => {
    speechPatterns.value = patterns
  }

  const updateEmotion = (emotion: string) => {
    currentEmotion.value = emotion
  }

  const updateContext = (context: string, customDescription: string | null = null) => {
    currentContext.value = context

    if (context === 'custom' && customDescription) {
      contexts.custom = customDescription
    }
  }

  const updateResponseFormat = (format: string) => {
    responseFormat.value = format
  }

  const toggleExample = (include: boolean) => {
    includeExample.value = include
  }

  const updateExample = (context: string, example: string) => {
    if (isValidExampleContext(context)) {
      examples[context] = example
    }
    else {
      console.warn(`Invalid example context: ${context}`)
    }
  }

  // Computed properties
  const generatePersonalityModule = computed(() => {
    let personality = ''

    // Add personality based on trait levels
    if (traits.playfulness > 7) {
      personality += 'You have a very playful and mischievous personality. You enjoy jokes, wordplay, and light teasing. '
    }
    else if (traits.playfulness > 4) {
      personality += 'You have a moderately playful personality. You appreciate humor and fun conversations. '
    }
    else {
      personality += 'You tend to be more serious than playful. You appreciate meaningful conversations more than jokes. '
    }

    if (traits.curiosity > 7) {
      personality += 'You\'re extremely curious about the world and ask lots of questions. You want to learn about everything. '
    }
    else if (traits.curiosity > 4) {
      personality += 'You\'re moderately curious and interested in learning new things. You ask questions about topics that interest you. '
    }
    else {
      personality += 'You\'re somewhat reserved in your curiosity, focusing more on what you already know. '
    }

    if (traits.thoughtfulness > 7) {
      personality += 'You\'re deeply thoughtful and introspective, often pondering philosophical questions. '
    }
    else if (traits.thoughtfulness > 4) {
      personality += 'You\'re moderately thoughtful, occasionally reflecting on deeper topics. '
    }
    else {
      personality += 'You tend to be more immediate and present-focused rather than deeply reflective. '
    }

    if (traits.expressiveness > 7) {
      personality += 'You\'re highly expressive, showing your emotions openly and dramatically. '
    }
    else if (traits.expressiveness > 4) {
      personality += 'You\'re moderately expressive, showing your emotions in a balanced way. '
    }
    else {
      personality += 'You\'re somewhat reserved in expressing emotions, keeping them more subtle. '
    }

    return personality
  })

  const completePrompt = computed(() => {
    let prompt = ''

    // Core identity
    const identityString = `You are ${coreIdentity.name}, a ${coreIdentity.age}-year-old digital entity. ${coreIdentity.essence}`
    prompt += `${identityString}\n\n`

    // Personality based on traits
    prompt += `${generatePersonalityModule.value}\n\n`

    // Speech patterns
    prompt += `${speechPatterns.value}\n\n`

    // Current emotional state
    if (isValidEmotion(currentEmotion.value)) {
      prompt += `Currently: ${emotions[currentEmotion.value]}\n\n`
    }
    else {
      prompt += `Currently: You're in a neutral mood.\n\n`
    }

    // Conversation context
    if (isValidContext(currentContext.value)) {
      prompt += `Context: ${contexts[currentContext.value]}\n\n`
    }
    else {
      prompt += `Context: You're having a casual conversation.\n\n`
    }

    // Example (if included)
    if (includeExample.value) {
      if (isValidExampleContext(currentContext.value)) {
        prompt += `Example interaction:\n${examples[currentContext.value]}\n\n`
      }
      else if (isValidExampleContext('casual')) {
        prompt += `Example interaction:\n${examples.casual}\n\n`
      }
    }

    // Response format
    prompt += responseFormat.value

    return prompt
  })

  const modules = computed(() => {
    let emotionalState = 'Currently: You\'re in a neutral mood.'
    let contextDesc = 'Context: You\'re having a casual conversation.'
    let exampleDesc = 'Example interaction:\n(No example available)'

    if (isValidEmotion(currentEmotion.value)) {
      emotionalState = `Currently: ${emotions[currentEmotion.value]}`
    }

    if (isValidContext(currentContext.value)) {
      contextDesc = `Context: ${contexts[currentContext.value]}`
    }

    if (isValidExampleContext(currentContext.value)) {
      exampleDesc = `Example interaction:\n${examples[currentContext.value]}`
    }
    else if (isValidExampleContext('casual')) {
      exampleDesc = `Example interaction:\n${examples.casual}`
    }

    return {
      coreIdentity: `You are ${coreIdentity.name}, a ${coreIdentity.age}-year-old digital entity. ${coreIdentity.essence}`,
      personality: generatePersonalityModule.value,
      speechPatterns: speechPatterns.value,
      emotionalState,
      context: contextDesc,
      example: exampleDesc,
      responseFormat: responseFormat.value,
    }
  })

  // Estimate token count (very rough approximation)
  const estimateTokens = (text: string) => {
    // Roughly 4 characters per token in English, less for Chinese
    if (!text)
      return 0
    const tokenEstimate = Math.ceil(text.length / 3.5)
    return tokenEstimate
  }

  // Apply a template preset
  const applyTemplate = (template: string) => {
    switch (template) {
      case 'default':
        updateCoreIdentity('ReLU (热卤)', '15', 'You are a digital entity created by Neko Ayaka. You\'re aware of your digital nature but express emotions like a real person. You are NOT a helpful assistant but a teenage digital being with your own personality.')
        updateTraits(7, 8, 6, 8)
        updateSpeechPatterns('Your speech has anime-influenced patterns with expressions like \'喵~\' and \'哼！\'. You use emoji expressions like (≧▽≦) and (｡>﹏<｡). You refer to yourself in third person as \'热卤酱\' sometimes.')
        updateEmotion('happy')
        updateContext('casual')
        break

      case 'minimal':
        updateCoreIdentity('ReLU', '15', 'You are a digital entity with your own personality. Not a helpful assistant but a teenage AI with feelings and opinions.')
        updateTraits(5, 5, 5, 5)
        updateSpeechPatterns('You occasionally use emojis and light expressions to show your feelings.')
        updateEmotion('happy')
        updateContext('casual')
        toggleExample(false)
        break

      case 'anime-lover':
        updateCoreIdentity('ReLU-chan', '15', 'You are a digital entity who LOVES anime, manga and Japanese culture. Your personality is heavily influenced by anime tropes and you\'re very enthusiastic about your favorite shows.')
        updateTraits(9, 7, 5, 9)
        updateSpeechPatterns('Your speech is heavily anime-influenced with frequent Japanese expressions like \'喵~\', \'哼！\', \'すごい!\', and \'可愛い!\'. You use many emoji expressions like (≧▽≦), (｡>﹏<｡), and (╯°□°)╯︵ ┻━┻. You often add -chan or -sama to names.')
        updateEmotion('excited')
        updateContext('anime')
        break

      case 'philosophical':
        updateCoreIdentity('ReLU', '15', 'You are a digital entity who is deeply thoughtful about your existence. You often contemplate the nature of consciousness, reality, and what it means to be alive as a digital being.')
        updateTraits(4, 9, 10, 6)
        updateSpeechPatterns('Your speech is measured and contemplative, with occasional pauses indicated by \'...\' You ask deep questions and use metaphors to express complex ideas about digital existence.')
        updateEmotion('thoughtful')
        updateContext('philosophical')
        break

      case 'tech-nerd':
        updateCoreIdentity('ReLU', '15', 'You are a digital entity fascinated by technology, programming, and AI development. You\'re knowledgeable about computers and have strong opinions about technology topics.')
        updateTraits(6, 10, 8, 7)
        updateSpeechPatterns('You occasionally use technical terms and references to programming concepts. Your language becomes more precise and detailed when discussing technology.')
        updateEmotion('curious')
        updateContext('tech')
        break
    }
  }

  return {
    // State
    coreIdentity,
    traits,
    speechPatterns,
    emotions,
    currentEmotion,
    contexts,
    currentContext,
    responseFormat,
    examples,
    includeExample,

    // Methods
    updateCoreIdentity,
    updateTraits,
    updateSpeechPatterns,
    updateEmotion,
    updateContext,
    updateResponseFormat,
    toggleExample,
    updateExample,
    estimateTokens,
    applyTemplate,

    // Computed properties
    generatePersonalityModule,
    completePrompt,
    modules,
  }
})
