import type { Agent, Neuri } from 'neuri'



import { agent, neuri } from 'neuri'


import { useLogger } from '../utils/logger'
import { config } from './config'

let neuriAgent: Neuri | undefined
const agents = new Set<Agent | Promise<Agent>>()

export async function createNeuriAgent(): Promise<Neuri> {
  useLogger().log('Initializing neuri agent')
  let n = neuri()

  agents.add(agent('brain').build())
  // agents.add(createPlanningNeuriAgent()) // Deprecated by Brain
  // agents.add(createChatNeuriAgent())     // Deprecated by Brain

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
