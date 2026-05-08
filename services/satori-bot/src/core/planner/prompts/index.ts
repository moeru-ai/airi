import { velin } from './velin'

export async function personality() {
  return await (velin('personality-v1.velin.md', import.meta.url))()
}

export async function systemPrompt() {
  return await (velin('system-action-gen-v1.velin.md', import.meta.url))()
}

export async function historyPrompt(messages: { role: string, content: string }[]) {
  // 将数组转换为字符串： "User: xxx \n Assistant: yyy"
  const formattedHistory = messages
    .map(msg => `${msg.role === 'user' ? 'User' : 'AIRI'}: ${msg.content}`)
    .join('\n')

  // 假设你有一个名为 history.velin.md 的模板文件
  // 模板内容可以是： "以下是我们的历史对话：\n{{history}}"
  return await (velin<{ history: string }>('history.velin.md', import.meta.url))({
    history: formattedHistory, // 将格式化后的字符串塞进 {{history}} 占位符
  })
}
