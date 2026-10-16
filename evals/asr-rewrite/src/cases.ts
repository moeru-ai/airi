/** One spoken message, as the speech recognition provider segmented it. */
export interface AsrRewriteCase {
  /** A stable name. Vieval reports use it as the case name. */
  name: string
  /** The raw text of each final segment, in order. */
  segments: string[]
}

export const asrRewriteCases: AsrRewriteCase[] = [
  {
    name: 'zh/request-then-aside',
    segments: ['也能听得到我说话了吗？帮我查询一下明天天气怎么样。这个能不能做一个动画，他那个 fade in？'],
  },
]
