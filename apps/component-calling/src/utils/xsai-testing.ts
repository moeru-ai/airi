import type { streamText } from '@xsai/stream-text'

type InferStreamType<T> = T extends ReadableStream<infer U> ? U : never
type StreamTextEvent = InferStreamType<Awaited<ReturnType<typeof streamText>>['fullStream']>

export function mockStreamText(): {
  fullStream: ReadableStream<StreamTextEvent>
} {
  const source = `<component_call><component_name>weather</component_name> \`\`\`json <component_props>{"city":"Shanghai","temperature":"29","condition":"cloudy"}</component_props> \`\`\`</component_call>`
  return {
    fullStream: new ReadableStream<StreamTextEvent>({
      start(controller) {
        const text = source.split('')
        let index = 0

        const interval = setInterval(() => {
          if (index < text.length) {
            controller.enqueue({ type: 'text-delta', text: text[index] })
            index++
          }
          else {
            clearInterval(interval)
            controller.close()
          }
        }, 10)
      },
    }),
  }
}
