export function mockStreamText(): {
  textStream: ReadableStream<string>
} {
  const source = `<component_call><component_name>weather</component_name> \`\`\`json <component_props>{"city":"Shanghai","temperature":"29","condition":"cloudy"}</component_props> \`\`\`</component_call>`
  return {
    textStream: new ReadableStream<string>({
      start(controller) {
        const text = source.split('')
        let index = 0

        const interval = setInterval(() => {
          if (index < text.length) {
            controller.enqueue(text[index]!)
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
