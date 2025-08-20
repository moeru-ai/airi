import { env } from 'node:process'

import { generateText } from '@xsai/generate-text'

export function pluginTranslate() {

}

export function initPlugins() {

}
interface Req {
  text: string
}

interface Res {
  text: string
}

const reqPlugins: ((req: Req) => Promise<Req>)[] = []
const resPlugins: ((req: Req, res: Res) => Promise<Res>)[] = []

async function beforeProcess(req: Req) {
  return await Promise.all(reqPlugins.map(plugin => plugin(req)))
}

async function afterProcess(req: Req, res: Res) {
  return await Promise.all(resPlugins.map(plugin => plugin(req, res)))
}

const reqMiddlewares: ((req: Req) => Promise<Req>)[] = []
const resMiddlewares: ((req: Req, res: Res) => Promise<Res>)[] = []

export async function reqMiddleware(req: Req) {
  let result = req

  for (const middleware of reqMiddlewares) {
    result = await middleware(result)
  }

  return result
}

export async function resMiddleware(req: Req, res: Res) {
  let result = res

  for (const middleware of resMiddlewares) {
    result = await middleware(req, result)
  }

  return result
}

export async function pipeline(req: Req) {
  await beforeProcess(req)
  req = await reqMiddleware(req)

  const { text } = await generateText({
    apiKey: env.OPENAI_API_KEY!,
    baseURL: 'https://api.openai.com/v1/',
    messages: [
      {
        content: 'You\'re a helpful assistant.',
        role: 'system',
      },
      {
        content: req.text,
        role: 'user',
      },
    ],
    model: 'gpt-4o',
  })

  const res = { text }
  await afterProcess(req, res)
  return await resMiddleware(req, res)
}
