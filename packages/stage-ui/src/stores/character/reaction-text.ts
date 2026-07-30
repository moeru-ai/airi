import { useLlmmarkerParser } from '@proj-airi/core-agent'

/**
 * 提取角色回应中可展示和朗读的普通文本
 *
 * 内部动作与延时标记会由原有角色管线执行，此函数仅为持久字幕生成可见文本
 *
 * @param response 包含普通文本和内部标记的完整角色回应
 * @returns 移除内部标记并压缩多余空白后的可见文本
 */
export async function extractVisibleReactionText(response: string) {
  let visibleText = ''
  const parser = useLlmmarkerParser({
    onLiteral: (literal) => {
      visibleText += literal
    },
  })

  await parser.consume(response)
  await parser.end()

  return visibleText.replace(/\s+/g, ' ').trim()
}
