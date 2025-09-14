import type { Agent, Neuri } from 'neuri'

import type { Mineflayer } from '../libs/mineflayer'

import { neuri } from 'neuri'

import { createActionNeuriAgent } from '../agents/action/adapter'
import { createChatNeuriAgent } from '../agents/chat/llm'
import { createPlanningNeuriAgent } from '../agents/planning/adapter'
import { useLogger } from '../utils/logger'
import { config } from './config'

let neuriAgent: Neuri | undefined
const agents = new Set<Agent | Promise<Agent>>()

export async function createNeuriAgent(mineflayer: Mineflayer): Promise<Neuri> {
  useLogger().log('Initializing neuri agent')
  let n = neuri()

  agents.add(createPlanningNeuriAgent())
  agents.add(createActionNeuriAgent(mineflayer))
  agents.add(createChatNeuriAgent())

  agents.forEach(agent => n = n.agent(agent))

  neuriAgent = await n.build({
    provider: {
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseUrl,
    },
  })

  return neuriAgent
}

export function useNeuriAgent(): Neuri {
  if (!neuriAgent) {
    throw new Error('Agent not initialized')
  }
  return neuriAgent
}
