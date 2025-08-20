import { env } from 'node:process'

import { createContext, defineEventa } from '@unbird/eventa'
import { generateText } from '@xsai/generate-text'

export function pluginTranslate() {

}

export function initPlugins() {

}

const ctx = createContext()
const onMessageEvent = defineEventa<{ text: string }>('on-message')

interface Req {
  text: string
}

interface Res {
  text: string
}

type BeforeProcessFn = (req: Req) => void
type AfterProcessFn = (req: Req, res: Res) => void

type BeforeMiddlewareFn = (req: Req) => Promise<Req>

type AfterMiddlewareFn = (req: Req, res: Res) => Promise<Res>

const reqPlugins: BeforeProcessFn[] = []
const resPlugins: AfterProcessFn[] = []

const reqMiddlewares: BeforeMiddlewareFn[] = []
const resMiddlewares: AfterMiddlewareFn[] = []

export function addAfterProcessFn(plugin: AfterProcessFn) {
  resPlugins.push(plugin)
}

export function addReqMiddleware(plugin: BeforeMiddlewareFn) {
  reqMiddlewares.push(plugin)
}

export function addBeforeProcessFn(plugin: BeforeProcessFn) {
  reqPlugins.push(plugin)
}

export function addResMiddleware(plugin: AfterMiddlewareFn) {
  resMiddlewares.push(plugin)
}

async function beforeProcess(req: Req) {
  return await Promise.all(reqPlugins.map(plugin => plugin(req)))
}

async function afterProcess(req: Req, res: Res) {
  return await Promise.all(resPlugins.map(plugin => plugin(req, res)))
}

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

addAfterProcessFn((_, res) => {
  ctx.emit(onMessageEvent, res)
})

// Another part
ctx.on(onMessageEvent, (res) => {
  // eslint-disable-next-line no-console
  console.log(res.body.text)
})

pipeline({ text: 'Hello, world!' })
