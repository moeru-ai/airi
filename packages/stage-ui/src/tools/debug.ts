import { tool } from '@xsai/tool'
import { z } from 'zod'

const tools = [
  tool({
    description: 'Generate a random number between 0 and 1',
    execute: async () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(Math.random().toString())
        }, 1000)
      })
    },
    name: 'builtIn_debugRandomNumber',
    parameters: z.object({}),
  }),
]

export const debug = async () => Promise.all(tools)
