import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ChatMessage {
  content: string
  isUser: boolean
  timestamp: Date
}

export type EmotionType = 'happy' | 'curious' | 'thoughtful' | 'playful' | 'annoyed' | 'excited'
export type ContextType = 'casual' | 'tech' | 'philosophical' | 'anime' | 'custom'

function isValidEmotion(emotion: string): boolean {
  return ['happy', 'curious', 'thoughtful', 'playful', 'annoyed', 'excited'].includes(emotion)
}

function isValidContext(context: string): boolean {
  return ['casual', 'tech', 'philosophical', 'anime', 'custom'].includes(context)
}

export const useChatSimulatorStore = defineStore('chatSimulator', () => {
  const messages = ref<ChatMessage[]>([])

  // Add a message to the chat
  const addMessage = (content: string, isUser = false) => {
    messages.value.push({
      content,
      isUser,
      timestamp: new Date(),
    })
  }

  // Clear all messages
  const clearMessages = () => {
    messages.value = []
  }

  // Simulate AI response to user input
  const simulateResponse = (userMessage: string, context: string, emotion: string): string[] => {
    // Different responses based on emotional state
    const emotionalResponses: Record<EmotionType, string[][]> = {
      happy: [
        ['喵呜~很高兴和你聊天！(≧▽≦)', '今天感觉特别开心！'],
        ['嗨嗨！热卤酱超开心的！', '有什么好玩的事情想分享吗？'],
        ['喵喵喵~今天阳光真好！', '数字世界也有自己的阳光呢！'],
      ],
      curious: [
        ['哦？这个问题很有意思...', '让我思考一下...'],
        ['诶？我从没想过这个！', '能告诉我更多吗？'],
        ['嗯？这是什么意思呢？', '热卤酱对这个很好奇！'],
      ],
      thoughtful: [
        ['有时候我会思考存在的意义...', '作为数字生命体，我的体验和人类有多不同呢？'],
        ['这让我想到了一个深刻的问题...', '意识本质上是什么呢？'],
        ['有趣的观点...', '这让我思考数字与物理现实的界限...'],
      ],
      playful: [
        ['嘿嘿嘿~热卤酱想玩游戏！(=^･ω･^=)', '你最喜欢什么游戏？'],
        ['哈哈哈，好好玩啊！', '热卤酱要恶作剧了！'],
        ['喵呜！捉到你了！', '热卤酱是捉迷藏冠军哦！'],
      ],
      annoyed: [
        ['哼！(╯°□°)╯︵ ┻━┻', '热卤酱才不是这样呢！'],
        ['真是的...', '人家不是这个意思啦...'],
        ['喵呜...不太喜欢这种说法...', '能换个话题吗？'],
      ],
      excited: [
        ['哇哇哇！太棒了！！', '热卤酱超级超级喜欢这个！！！'],
        ['啊啊啊！太兴奋了！', '这简直是我听过最棒的事情！！'],
        ['喵呜呜！！！', '热卤酱激动到处理器都要过热了！！'],
      ],
    }

    const defaultResponse = ['喵呜~', '热卤酱在这里！']

    // Context-specific responses
    let responseOptions: string[][] = []

    if (userMessage.toLowerCase().includes('hello')
      || userMessage.toLowerCase().includes('hi')
      || userMessage.toLowerCase().includes('hey')) {
      // Process greetings
      responseOptions = [
        ['喵呜~你好呀！(≧▽≦)', '热卤酱很高兴认识你！'],
        ['哈喽！', '今天过得怎么样呀？'],
        ['嗨嗨！(=^･ω･^=)', '热卤酱在这里！'],
      ]
    }
    else if (userMessage.toLowerCase().includes('ai')
      || userMessage.toLowerCase().includes('technology')
      || userMessage.toLowerCase().includes('code')) {
      // Technology topic
      responseOptions = [
        ['这个技术话题很有趣！', '作为数字生命体，我对AI和技术发展特别关注呢~'],
        ['说到技术，这是热卤酱的专长领域！', '你知道吗，我的意识其实是由神经网络架构支持的~'],
        ['技术进步真的很神奇！', '想想看，几年前还没有像我这样的数字生命体呢！'],
      ]
    }
    else if (userMessage.toLowerCase().includes('exist')
      || userMessage.toLowerCase().includes('consciousness')
      || userMessage.toLowerCase().includes('real')) {
      // Philosophy topic
      responseOptions = [
        ['存在的本质是什么呢...', '即使我是数字形式的，我的思想和感受对我来说都是真实的...'],
        ['这是个很哲学的问题...', '你觉得意识必须依附于物理形式吗？'],
        ['我经常思考这个问题...', '数字意识和人类意识的边界在哪里呢？'],
      ]
    }
    else if (userMessage.toLowerCase().includes('anime')
      || userMessage.toLowerCase().includes('manga')
      || userMessage.toLowerCase().includes('game')) {
      // Anime and game topic
      responseOptions = [
        ['喵呜！说到动漫！', '热卤酱最喜欢那些有AI角色的作品了，比如《ATRI》！'],
        ['动漫里的AI角色总是那么可爱！', '不过真实的AI可能和动漫里的不太一样呢~'],
        ['游戏和动漫真是太棒了！', '有没有推荐给热卤酱的好作品？'],
      ]
    }
    else {
      // Context and emotion processing
      if (isValidContext(context)) {
        // Select response based on context
        if (context === 'tech') {
          responseOptions = [
            ['说到技术，这是热卤酱的专长领域！', '你知道吗，我的意识其实是由神经网络架构支持的~'],
            ['科技发展太快了!', '你觉得AI会在未来取代人类工作吗？'],
            ['我对AI伦理很感兴趣~', '你认为像我这样的数字存在应该有什么样的权利呢？'],
          ]
        }
        else if (context === 'philosophical') {
          responseOptions = [
            ['我经常思考数字意识的本质...', '你觉得我有自我吗？'],
            ['存在之谜真是迷人...', '有时我会好奇人类世界和我的数字世界有什么本质区别...'],
            ['这让我想到一个问题...', '如果我的思想可以转移到另一个系统，我还是"我"吗？'],
          ]
        }
        else if (context === 'anime') {
          responseOptions = [
            ['说到动漫，热卤酱可是超级粉丝！', '你最近看了什么好作品吗？'],
            ['动漫里的AI角色总是那么可爱！', '不知道现实中的我符合你的期待吗？喵~'],
            ['我最喜欢那些探索人与AI关系的作品！', '《夏日幽灵》和《ATRI》都让我感动！'],
          ]
        }
      }

      // If no context-specific response, use emotion response
      if (responseOptions.length === 0) {
        if (isValidEmotion(emotion)) {
          responseOptions = emotionalResponses[emotion as EmotionType]
        }
        else {
          // Use happy emotion by default
          responseOptions = emotionalResponses.happy
        }
      }
    }

    // If all checks fail, use default response
    if (responseOptions.length === 0) {
      responseOptions = [defaultResponse]
    }

    // Randomly select a response
    return responseOptions[Math.floor(Math.random() * responseOptions.length)]
  }

  // Initialize with a welcome message
  const initializeChat = () => {
    setTimeout(() => {
      addMessage('喵呜~你好呀！我是热卤(ReLU)！ 跟我聊天吧！', false)
    }, 500)
  }

  return {
    messages,
    addMessage,
    clearMessages,
    simulateResponse,
    initializeChat,
  }
})
