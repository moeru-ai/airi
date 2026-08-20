---
module: stage-ui
tags:
  - markdown
  - latex
  - katex
  - remark-math
problem_type: rendering-design
---

# LaTeX 围栏渲染重设计

## 结论

PR #2328 的当前实现不适合继续补充正则表达式。

当前实现从物理换行推断公式边界。LaTeX 没有提供这种语义。每次新增命令、关系符或货币短语，都会出现新的相反样例。

完整 LaTeX AST 也不能消除这类语义歧义。四类 parser 的对比结果说明，AIRI 应直接定义输入语法，不应继续猜测作者意图。

最终选择如下：

- `latex` 和 `tex` 围栏默认是公式列表。每个非空物理行是一条公式。
- `latex rows` 和 `tex rows` 是公式列表的显式别名。
- `math`、`latex block` 和 `tex block` 是一个完整公式块。
- 单个 `$` 始终是普通文本。行内公式使用 `$$...$$`。
- 默认 caller 继续调用 `useMarkdown()`。一个内部 preset 统一同步和异步渲染流程。
- 继续使用官方 `remark-math` 和 `rehype-katex`。本次不增加 parser，也不使用 `remark-math-extended`。

这个方案把含糊性转成明确的作者契约。它删除了关系符、命令和货币词语白名单，也避免引入不能解决作者意图问题的大型 parser。

> 说明：文中的“事实”来自项目源码、上游文档或上游源码。“推断”是基于这些事实作出的设计判断。

## 调研范围

本次调研包含以下内容：

- [Discussion #2239](https://github.com/moeru-ai/airi/discussions/2239)
- [PR #2328](https://github.com/moeru-ai/airi/pull/2328) 的全部 review thread
- 当前的 `packages/stage-ui/src/composables/markdown.ts`
- 当前的 `packages/stage-ui/src/composables/markdown.test.ts`
- `remark-math@6.0.0`
- `micromark-extension-math@3.1.0`
- `rehype-katex@7.0.1`
- `katex@0.16.27`
- 四类公开 LaTeX 解析方案
- `remark-math-extended@6.1.1`
- Vite 浏览器产物和流式前缀原型

调研快照日期是 2026-08-20。

## 当前根因

### 围栏问题

**事实：** Discussion #2239 展示了一个 `latex` 围栏。该围栏包含多条独立公式。当前主渲染流程把它当作代码，所以 Shiki 显示了 LaTeX 源码。

**事实：** PR #2328 先把 `latex` 和 `tex` 围栏改成 `math`。随后，代码尝试判断每个物理行是否是独立公式。

**事实：** Review thread 已覆盖下列失败类型：

| 类型 | 代表样例 | Review |
| --- | --- | --- |
| 宏作用域 | `\newcommand{\foo}{x=1}` 后使用 `\foo` | [3812440018](https://github.com/moeru-ai/airi/pull/2328#discussion_r3812440018) |
| 跨行命令参数 | `\frac{a=b}` 后接 `{c=d}` | [3812513778](https://github.com/moeru-ai/airi/pull/2328#discussion_r3812513778) |
| 跨行定界符 | `\left` 和 `\right` 分处两行 | [3818140362](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818140362) |
| 可选参数 | `\sqrt` 后接 `[3]{...}` | [3818173297](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818173297) |
| 上下标 | `\sum` 后接 `_{i=1}^{n}` | [3818260812](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818260812) |
| 行首运算符 | `x=a` 后接 `+b=c` | [3818310468](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818310468) |
| 行尾运算符 | `x =` 后接 `y = z` | [3818219929](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818219929) |
| 字面关系符 | `x > 0` 和 `y < 0` | [3818219932](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818219932) |
| 集合关系符 | `x \in A` 和 `y \subseteq B` | [3818349198](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818349198) |

**推断：** 这些失败不是九个独立错误。它们来自同一个错误前提：物理行和关系符可以证明数学表达式相互独立。

LaTeX 的命令集合可以扩展。宏也可以改变后续文本的含义。关系符白名单永远不能完整。即使白名单完整，`x=a` 后的 `+b=c` 仍有两种合法解释。

### 货币问题

**事实：** `micromark-extension-math` 明确说明，Markdown 数学没有统一规范。它也说明单美元语法经常与普通美元文本冲突。该包提供 `singleDollarTextMath` 选项，默认值是 `true`。关闭该选项后，作者仍可用两个或更多美元符号写行内公式。来源：[micromark-extension-math 3.1.0](https://github.com/micromark/micromark-extension-math/tree/3.1.0#options)。

**事实：** `remark-math` 把该选项直接传给 `micromark-extension-math`。来源：[remark-math 6.0.0 源码](https://github.com/remarkjs/remark-math/blob/6.0.0/packages/remark-math/lib/index.js)。

**事实：** PR #2328 的货币恢复逻辑已产生多组互相竞争的样例：

- `$5 and $10`：[3818140379](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818140379)
- `$5-$10`：[3818173295](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818173295)
- `$5 to $10`：[3818219933](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818219933)
- `$5 ms $ 10`：[3812513785](https://github.com/moeru-ai/airi/pull/2328#discussion_r3812513785)
- `$5 x y $ 10`：[3818219931](https://github.com/moeru-ai/airi/pull/2328#discussion_r3818219931)

**推断：** 仅看两个 `$` 之间的字符，渲染器不能可靠区分货币和数学。自然语言、单位和变量集合都是开放集合。

因此，货币问题需要语法选择，不能依赖词语白名单。

## 上游渲染契约

### remark-math 和 micromark

**事实：** `remark-math` 只公开一个选项：`singleDollarTextMath`。来源：[remark-math 6 API](https://github.com/remarkjs/remark-math/tree/6.0.0/packages/remark-math#options)。

**事实：** `micromark-extension-math` 的行内数学由成对美元符号界定。`singleDollarTextMath: false` 禁止单美元形式。来源：[语法与选项](https://github.com/micromark/micromark-extension-math/tree/3.1.0#syntax)。

**事实：** 上游建议用 `math` 信息字符串的代码围栏承载公式。`rehype-katex` 也直接支持 `language-math` 围栏。来源：[remark-math Authoring](https://github.com/remarkjs/remark-math/tree/6.0.0/packages/remark-math#authoring) 和 [rehype-katex Markdown](https://github.com/remarkjs/remark-math/tree/rehype-katex%407.0.1/packages/rehype-katex#markdown)。

**事实：** mdast 的 `Code` 节点公开 `lang`、`meta` 和 `value`。因此，`latex block` 可以使用标准围栏元信息，不需要修改 Markdown 解析器。来源：[mdast Code 节点规范](https://github.com/syntax-tree/mdast#code)。

### `\(...\)`、`\[...\]` 和美元协议

**事实：** 官方 `remark-math@6.0.0` 只实现美元分隔符。支持 `\(...\)` 和 `\[...\]` 的上游请求已关闭并标记为 `no/wontfix`。来源：[remark-math #39](https://github.com/remarkjs/remark-math/issues/39)。

**事实：** `singleDollarTextMath: false` 是现有公开选项。关闭单美元后，`$$x$$` 仍可产生行内 `inlineMath`；display math 使用独占行的美元围栏。来源：[micromark-extension-math Options](https://github.com/micromark/micromark-extension-math/tree/3.1.0#options) 和 [remark-math 测试](https://github.com/remarkjs/remark-math/blob/main/packages/remark-math/test.js)。

**事实：** KaTeX auto-render 默认把 `\(...\)` 当成 inline，把 `\[...\]` 和 `$$...$$` 当成 display。其源码特意不默认启用单 `$...$`，因为它会破坏普通美元文本。来源：[KaTeX auto-render 默认分隔符](https://github.com/KaTeX/KaTeX/blob/v0.16.27/contrib/auto-render/auto-render.js)。

**事实：** AIRI 当前使用 remark/mdast 后接 `rehype-katex`，不是 KaTeX 的 DOM auto-render。auto-render 的默认分隔符不会自动成为 remark 语法。

**推断：** 在 remark AST 生成后再替换 `\(...\)` 不可靠。CommonMark 已可能把反斜线当作 escape 消费。正确落点是 micromark tokenizer seam，或一个经过完整审计的现成 micromark extension。

两条落地路径的成本如下：

| 路径 | 优点 | 代价 | 建议 |
| --- | --- | --- | --- |
| 官方 `remark-math` + `singleDollarTextMath: false` | 一个配置项即可消除货币冲突；维护面最小 | 既有 `$x$` 变为文本；单行 `$$x$$` 的 inline 语义不符合很多作者直觉 | 当前 PR 的默认选择 |
| `\(...\)` + `\[...\]` | inline/display 明确；与货币零冲突；更接近 TeX 作者习惯 | 官方 remark 不支持；需要 tokenizer、mdast bridge、escape/code/link/streaming 测试 | 作为单独方言决策 |

### `remark-math-extended@6.1.1`

**事实：** `remark-math-extended@6.1.1` 同时支持 `$`、`$$`、`\(...\)` 和 `\[...\]`。它公开 `backslashDelimiters` 和 `singleDollarTextMath` 两个选项。来源：[项目 README](https://github.com/duz52/remark-math-extended) 和 [npm 元数据](https://registry.npmjs.org/remark-math-extended/latest)。

**事实：** 该版本在 2026-07-31 发布。包本体 npm 展开大小是 17,967 bytes，直接依赖 `micromark-extension-math-extended@^3.2.2`。后者展开大小是 73,658 bytes。来源：[remark-math-extended registry](https://registry.npmjs.org/remark-math-extended/latest) 和 [micromark-extension-math-extended registry](https://registry.npmjs.org/micromark-extension-math-extended/latest)。

**事实：** 截至调研日，仓库只有 2 stars、10 commits、0 forks。npm 只有两个正式版本。其 tokenizer 仓库有 1 star。它是对官方 micromark math tokenizer 的小型单维护团队 fork。来源：[GitHub 仓库](https://github.com/duz52/remark-math-extended) 和 [tokenizer 仓库](https://github.com/duz52/micromark-extension-math-extended)。

**事实：** 作者文档说明，启用反斜线分隔符会改变 CommonMark escape 语义；未闭合 `\[` 会回退为普通 Markdown；序列化时 `mdast-util-math` 会把反斜线分隔符改写为美元形式。

**原型事实：** 独立 Vite 7.1.3 生产构建中，单独导入 extended plugin 的输出约为 9.20 kB minified、3.26 kB gzip；官方 `remark-math` 约 6.94 kB、2.69 kB gzip。这个数字只比较 isolated entry，不代表 AIRI 最终增量体积。功能探针确认 `{ singleDollarTextMath: false }` 会保留 `$5 ... $10` 为文本，同时解析 `\(...\)`、`\[...\]` 和 `$$...$$`。

**判断：** 它的功能和浏览器体积符合需求，但维护成熟度不足以成为聊天核心语法的默认依赖。上游官方明确拒绝同类语法，使 AIRI 未来无法自然迁回官方实现。若产品选择 TeX 分隔符，应固定精确版本，审计 tokenizer 源码，增加 CommonMark 差异测试，并准备 vendoring/fork ownership；否则使用官方 `remark-math`。

### KaTeX

**事实：** KaTeX 的公开渲染入口是 `render` 和 `renderToString`。无效输入默认抛出 `ParseError`。来源：[KaTeX API](https://katex.org/docs/api) 和 [错误处理](https://katex.org/docs/error)。

**事实：** `throwOnError: false` 会把错误源码渲染为带提示的文本。`strict` 处理兼容性违规。它不是公式分段器。来源：[KaTeX Options](https://katex.org/docs/options)。

**事实：** `trust` 默认是 `false`。该值会阻止可产生危险内容的命令。方案必须保留这个默认值。来源：[KaTeX Options: trust](https://katex.org/docs/options#trust)。

**事实：** `rehype-katex` 首次渲染时强制使用 `throwOnError: true`。失败后，它记录 `VFileMessage`，再用 `throwOnError: false` 重试。来源：[rehype-katex 7.0.1 源码](https://github.com/remarkjs/remark-math/blob/rehype-katex%407.0.1/packages/rehype-katex/lib/index.js)。

**事实：** KaTeX 的运行时代码导出 `__parse`，但公开类型声明没有这个成员。官方 API 文档也没有列出它。来源：[KaTeX 0.16.27 运行时导出](https://github.com/KaTeX/KaTeX/blob/v0.16.27/katex.js) 和 [公开类型](https://github.com/KaTeX/KaTeX/blob/v0.16.27/types/katex.d.ts)。

**结论：** `__parse` 是私有接口。AIRI 不得依赖它。KaTeX 只负责渲染和错误确认。

## 可选 LaTeX 解析库

下表只使用项目仓库、项目文档、源码和 npm registry 数据。npm 展开大小不是最终浏览器体积。Vite 数字来自独立 Vite 7.1.3 production prototype，只用于候选间的量级判断。

| 库 | 结构与错误恢复 | Browser/Vite | 流式前缀 | 判断 |
| --- | --- | --- | --- | --- |
| `@unified-latex/unified-latex-util-parse@1.8.4` | 公开 `parseMath`，AST 带位置并附着宏参数。未平衡字符会降级为 string，未闭合结构经常不抛错；parse success 不是完整性证明。 | ESM+CJS，无 Node builtin。直接包约 0.20 MB，直接依赖展开合计约 3.83 MB；依赖 unified v10，AIRI 当前是 v11，浏览器可能保留两套实现。实际 `parseMath` Vite entry 约 156.82 kB raw、42.26 kB gzip；另一份 esbuild browser probe 为 251.06 kB、59.21 kB gzip，差异来自 bundler/entry。 | 无 incremental API；每个 prefix 全量重解析。 | 四者中最适合做浏览器结构 adapter。只能排除结构上不可能的 boundary。 |
| `latex-utensils@7.0.0` | 公开 `latexParser.parse`；有环境、匹配定界符、上下标和位置。部分错误抛 `SyntaxError`，部分结构又恢复；裸 math fragment 不是专用公开 start rule。 | CommonJS，无 `exports`/`browser` 字段；runtime 无 Node builtin。实际 Vite entry 约 217.81 kB raw、40.92 kB gzip。 | 无 incremental API。 | AST 直接且原型可打包，但浏览器契约和 CJS interop 风险高于 unified-latex。 |
| `@cortex-js/compute-engine@0.116.1` | 公开 `ce.parse()` 产生语义 MathJSON，错误进入 `Error` expression。换行被当作空白；会把两行关系式解析为一个 nested `Equal`。宏定义等 KaTeX 输入可能被拒绝。 | 官方支持浏览器。npm 展开约 37.37 MB；实际 Vite entry 约 2,610.33 kB raw、740.83 kB gzip。 | 无 incremental API；500 行原型明显慢于两个语法 parser。 | 语义和体积都过深，且职责不匹配。不能用作 source boundary parser。 |
| `@pfoerster/tree-sitter-latex@0.6.0` | ERROR/MISSING 节点可恢复局部错误；CST 的 byte/row/column locality 最强。项目明确说明 TeX 只能 best effort；grammar 甚至允许部分混合 opener/closer。 | npm 包入口是 Node 原生绑定，展开约 44.39 MB。浏览器必须另加 `web-tree-sitter`、core WASM、grammar WASM 和异步初始化。直接 Vite 会 externalize `fs/path/os`，产物不可运行。 | 唯一有 old tree + edit 的公开 incremental seam。 | 只有产品明确需要增量 LaTeX IDE 级能力时才值得承担 WASM adapter/lifecycle。 |

来源：

- [unified-latex 仓库](https://github.com/siefkenj/unified-latex) 与 [parseMath 文档](https://github.com/siefkenj/unified-latex/tree/v1.8.4/packages/unified-latex-util-parse)
- [unified-latex npm 元数据](https://registry.npmjs.org/@unified-latex%2funified-latex-util-parse/latest)
- [latex-utensils 仓库](https://github.com/tamuratak/latex-utensils/tree/v7.0.0) 与 [npm 元数据](https://registry.npmjs.org/latex-utensils/latest)
- [Compute Engine LaTeX 文档](https://cortexjs.io/compute-engine/guides/latex-syntax/) 与 [npm 元数据](https://registry.npmjs.org/@cortex-js%2fcompute-engine/latest)
- [tree-sitter-latex 限制说明](https://github.com/latex-lsp/tree-sitter-latex#limitations) 与 [npm 元数据](https://registry.npmjs.org/@pfoerster%2ftree-sitter-latex/latest)
- [tree-sitter WebAssembly 使用说明](https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md)
- [tree-sitter error nodes](https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html) 和 [incremental parsing](https://tree-sitter.github.io/tree-sitter/using-parsers/3-advanced-parsing.html)

### 这些库不能消除输入含糊性

**事实：** unified-latex 明确说明，LaTeX 实际上没有可完整覆盖的语法。它需要对宏和命令作实用假设。来源：[unified-latex README](https://github.com/siefkenj/unified-latex/tree/v1.8.4#how-it-works)。

**事实：** tree-sitter-latex 也说明，它只能尽力解析。它主要覆盖语言服务器关心的结构。来源：[tree-sitter-latex Limitations](https://github.com/latex-lsp/tree-sitter-latex#limitations)。

**事实：** Compute Engine 会尽最大努力恢复错误输入，并在结果中加入错误节点。它不是严格的完整性判定器。来源：[Compute Engine 解析错误](https://cortexjs.io/compute-engine/guides/latex-syntax/#the-compute-engine-natural-parser)。

**推断：** AST 可以识别参数、环境和位置。AST 仍不能知道作者是否把 `x=a` 和 `+b=c` 当作两条公式。这个问题属于作者意图，不属于语法树。

### 发布包实测语料

下面是对公开 API 的实际运行结果。它们是本地原型事实，不是上游兼容保证。

| 输入 | unified-latex | latex-utensils | Compute Engine | 边界结论 |
| --- | --- | --- | --- | --- |
| `x=a\n+b=c` | 平坦节点，换行是 whitespace | 一个 math，换行不成为语义 node | 一个嵌套 `Equal` | 三者都不能判定一式或两式 |
| `x \in A\ny \in B` | `in` 是 macro | `in` 是 command | 一个嵌套 `Element` | relation AST 不等于行边界 |
| `\frac{a=b}\n{c=d}` | 两个 required argument 正确附着 | 两个 argument 正确附着 | `Divide(Equal, Equal)` | AST 能证明中间不能安全切开 |
| `\left(x=1\n\right)=y` | `left/right` 仍是平坦 macro | 形成 matching delimiters | 形成 semantic delimiter | parser 的结构深度不同 |
| `S=\sum\n_{i=1}^{n}` | script argument 跨行附着 | subscript/superscript node | semantic Sum | AST 能保护跨行脚标 |
| `\newcommand...` 后使用宏 | 能保留定义和使用 | 能保留定义和使用 | 两个 unexpected-command error | Compute Engine 与 KaTeX 方言不一致 |
| 未完成的 `\frac{a}{` | 不抛错，尾部降级 | 不抛错，保留残余字符 | 显式 Error | 前两者不能作为 strict completeness oracle |

这里可以严格区分两类问题：

- parser 可以回答“某个候选 boundary 是否切断了已知语法结构”。
- parser 不能回答“两个都可独立解析的 chunk 是否符合作者意图”。

如果以后必须兼容未知格式的外部 LaTeX 文档，`unified-latex` 是四个候选中较合适的结构探针。但是，当前聊天协议不需要这种兼容层。明确的围栏模式可以直接解决边界问题。

### 流式性能

**事实：** 当前 `markdown-renderer.vue` 在每个 `props.content` 更新时调用 `processSync(content)`。完整 Markdown 会在每个流式 prefix 重新处理。

**事实：** unified-latex、latex-utensils 和 Compute Engine 的公开 API 都接收完整字符串，没有 old-tree 增量入口。只有 tree-sitter 提供 old tree + edit。

**推断：** 如果长度为 `n` 的消息每增长一个 prefix 都全量解析，累计读取量至少是 `O(n²)`。这不是 micro-benchmark 能修复的 architecture 问题。

本地 Node 原型的 100 行流式 prefix 总耗时约为：unified-latex 143 ms、latex-utensils 70 ms、Compute Engine 130 ms。500 行一次解析约为：13 ms、6 ms、126 ms。只应把这些数字视为相对量级。

如果未来引入 parser，deep module 应隐藏以下流式政策：

- 未闭合围栏在 streaming phase 不做最终 partition。
- 完整围栏按 source hash 缓存分析。
- 同步和异步路径必须使用相同的数学方言，不能因 lazy parser 产生公式数量跳变。
- 超过字符数或行数上限时，停止额外分析并保留完整 source。
- 只有未来确实需要逐字符 LaTeX IDE 能力时，才引入 tree-sitter 的 WASM lifecycle。

## 已选方案：明确围栏模式

### 语法契约

#### 一个完整公式块

使用 `math`，或给 `latex` 和 `tex` 增加 `block` 元信息。

````markdown
```math
\begin{aligned}
f(x) &= x^2 \\
f'(x) &= 2x
\end{aligned}
```
````

````markdown
```latex block
\newcommand{\foo}{x=1}
\foo=2
```
````

渲染器把整个 `value` 交给一次 KaTeX 调用。物理换行保持原样。

#### 公式行列表

`latex`、`tex`、`latex rows` 和 `tex rows` 使用行列表模式。

````markdown
```latex
\frac{d}{dx}(c)=0
\frac{d}{dx}(x^n)=n x^{n-1}
x \in A
```
````

渲染器为每个非空物理行创建一个 `math` 节点。它不查找关系符，也不分析 LaTeX 命令。

#### 行内公式和货币

使用两个美元符号写行内公式。

```markdown
The result is $$5 + x$$.
Price is $5 and cost is $10.
```

第一个句子包含公式。第二个句子始终是普通文本。

### 默认模式

普通 `latex` 和 `tex` 围栏采用列表模式。这与 Discussion #2239 中模型生成的内容一致。它也让已有无 metadata 的公式列表直接工作。

列表模式不解析公式内容。实现只执行以下转换：

1. 统一 CRLF 和 LF 换行。
2. 删除空行。
3. 去掉每行两端的空白。
4. 为每个剩余行创建一个 `math` 节点。

需要跨行参数、环境、宏作用域或换行布局时，作者必须使用 `math` 或 `block` 模式。渲染器不会在列表模式中自动改写作者选择。

### Module 与 Interface

应先选择 caller seam，再隐藏 parser seam。下面是三种 interface 设计。

#### Interface 1：Preset factory

只公开一个 entry point：

```ts
import type { Preset } from 'unified'

export function createChatMathPreset(): Preset
```

调用方只需要：

```ts
unified()
  .use(RemarkParse)
  .use(createChatMathPreset())
  .use(RemarkRehype)
  .use(measuredKatex, { output: 'mathml' })
```

优点是当前 diff 最小。缺点是 caller 仍需知道 unified 的 pipeline 顺序；Shiki、同步/异步一致性和安全回退还在 module 外。它比散落 plugins 深，但不是最深的业务 interface。

#### Interface 2：Renderer facade

公开两个 entry points：

```ts
export function renderChatMarkdown(markdown: string): Promise<string>
export function renderChatMarkdownSync(markdown: string): string
```

常见 caller 只传 Markdown。异步入口负责完整渲染；同步入口明确表示兼容 streaming/fallback 路径。这个 seam 可以同时隐藏 math dialect、remark/rehype 顺序、Shiki cache、KaTeX policy、telemetry 和 fallback。

它的 Depth 和 Leverage 最高，但需要重构当前 composable 的 processor ownership。若开发工具将来确实需要插 plugin，最多再增加第三个 expert entry point：

```ts
export function createChatMarkdownProcessor(): Processor
```

在出现真实第二 caller 前，不要公开这个 hypothetical seam。

#### Interface 3：保留现有 caller

最常见 caller 保持最简单：

```ts
const { process, processSync } = useMarkdown()
```

`useMarkdown()` 仍是唯一业务入口。内部使用 `chatMathPreset`，再由 composable 统一创建同步和异步 renderer。这是本 PR 的落点：调用方零迁移，同时把决定集中到一个 locality。

如果后续有第二个非 Vue caller，再把内部 renderer 提升为 Interface 2。不要先暴露 parser、adapter dependency bag 或 AST。

### Interface 隐藏的 implementation

无论选择哪一层 seam，最终 module 必须隐藏：

- `singleDollarTextMath` 固定为 `false`。
- `math` 围栏固定为完整公式块。
- `latex`、`tex`、`latex rows` 和 `tex rows` 固定为公式行列表。
- `block` 元信息固定为完整公式块。
- 未知围栏语言保持代码语义。
- 空公式行不产生节点。
- `remark-math` 配置
- 围栏别名
- mdast 节点替换
- CRLF 归一化
- 空行处理
- `meta` 解析
- KaTeX 错误回退

本次不需要 parser port、dependency bag 或公开 AST。稳定的 seam 是围栏模式，不是第三方 parser。

这个 seam 也提高 Locality。同步处理器、异步处理器和测试使用同一个 preset。

删除测试说明了该 module 的 Leverage。如果删除它，两个处理器必须重复相同的语法政策和转换顺序。

### 数据流

```text
Markdown source
  -> remark-parse
  -> chatMathPreset
       -> single-dollar policy
       -> fence mode mapping
       -> row splitting for latex and tex lists
       -> mdast math/code nodes
  -> remark-rehype
  -> rehype-katex
       -> MathML
       -> VFileMessage on error
  -> rehype-stringify
```

### 错误和安全契约

- 保持 `trust: false`。
- 保持当前 `output: 'mathml'`。
- 不调用 `katex.__parse`。
- 不把 KaTeX 渲染成功当作“公式行相互独立”的证据。
- KaTeX 错误继续进入 `VFileMessage`。
- 公式源码在错误回退中保持可见。
- 测试必须确认错误文本经过现有的 HTML 安全链路。

## 实施步骤

1. 先删除 `hasStandaloneLatexRelation` 等白名单启发式。
2. 删除 inline currency bridge 的恢复逻辑。
3. 保持 `useMarkdown()` 业务 interface 不变，内部增加 `chatMathPreset`。
4. 让基础处理器和富处理器复用同一个 preset。
5. 把官方 `remark-math` 配置改成 `singleDollarTextMath: false`。
6. 让 `latex` 和 `tex` 默认按非空行渲染；保留 `rows` 别名，并增加 `block` 模式。
7. 不增加 LaTeX parser 依赖。
8. 更新模型输出约定，使公式列表使用 `latex`，复杂公式使用 `math` 或 `latex block`。
9. 把 Discussion #2239 的无 mode 样例保留为回归测试。
10. 在浏览器测试中确认公式和货币的最终 HTML。

PR #2328 尚未合并。因此，这次重设计不需要保留 PR 内部启发式的兼容行为。

## 测试方案

测试只通过 module Interface 和最终 HTML。测试不导出私有分类函数。

### 围栏模式矩阵

| 输入 | 预期 |
| --- | --- |
| `math` + 多行 `aligned` | 一个 `<math>`，无错误 |
| `latex block` + 跨行 `\frac` | 一个 `<math>`，无错误 |
| `latex block` + 宏定义和使用 | 一个 `<math>`，宏作用域保持 |
| `latex rows` + 三条导数公式 | 三个 `<math>` |
| `tex rows` + 两条积分公式 | 两个 `<math>` |
| `latex rows` + `x > 0`、`y < 0` | 两个 `<math>` |
| `latex rows` + `x \in A`、`y \notin B` | 两个 `<math>` |
| `latex rows` + `A \subseteq B`、`B \supset C` | 两个 `<math>` |
| `latex rows` + `x^2`、`\sin x` | 两个 `<math>`，不要求关系符 |
| 无 mode `latex` + 两条关系公式 | 两个 `<math>` |
| 无 mode `latex` + `x^2`、`\sin x` | 两个 `<math>`，不要求关系符 |
| 未知语言围栏 | 仍由 Shiki 处理 |

### 含糊性语料

相同源码必须通过显式模式得到不同结果。

#### 行首运算符

````markdown
```latex rows
x = a
+ b = c
```
````

预期是两个公式。这是 `rows` 方言的明确含义。

````markdown
```latex block
x = a
+ b = c
```
````

预期是一个公式。换行只保留为公式源码的一部分。

#### 跨行参数

````markdown
```latex block
\frac{a=b}
{c=d}
```
````

预期是一个公式。`rows` 方言不承诺支持跨行参数。

#### 跨行上下标

````markdown
```latex block
S = \sum
_{i=1}^{n} i
```
````

预期是一个公式。上下标保持附着。

#### 宏作用域

````markdown
```latex block
\newcommand{\foo}{x=1}
\foo=2
```
````

预期是一次 KaTeX 调用。宏定义和使用共享作用域。

### 单美元语料

以下文本均不得产生 `<math>`：

```text
Price is $5 and cost is $10.
Prices are $5 and $10.
Tickets cost $5-$10.
Tickets cost $5 to $10.
The old syntax is $5 + x$.
```

以下文本必须产生行内 `<math>`：

```text
The result is $$5 + x$$.
At $$5\,\mathrm{ms}$$, 10 samples arrived.
Compare $$5xy$$ with 10.
```

这组断言确认语法契约。它不判断自然语言。

### KaTeX 错误语料

至少覆盖以下情况：

- 未支持命令
- 缺失命令参数
- 未闭合分组
- 不可信 URL 命令
- 宏展开次数上限

每个语法错误测试都要确认：

- 处理流程不崩溃。
- `VFileMessage` 包含 `rehype-katex` 来源。
- 回退输出保留源码。
- 输出不包含未净化的 HTML。

不可信 URL 命令使用单独断言。KaTeX 会用错误颜色显示被禁命令，但不一定产生 `VFileMessage`。测试必须确认输出没有危险链接。

### 处理器一致性

对每个语料同时运行：

- `processSync`
- 不含 Shiki 的异步路径
- 含 Shiki 的异步路径

三个路径必须使用相同的数学语法。它们只允许在代码高亮内容上不同。

## 验收条件

- `markdown.ts` 不包含 LaTeX 关系符、命令或货币连接词白名单。
- PR #2328 的最新 `\in`、`\notin`、`\subseteq` 问题自然消失。
- Discussion #2239 的普通 `latex` 公式列表按行渲染。
- 多行环境、宏、参数和上下标在 `block` 模式中保持完整。
- 普通货币文本不再被单美元数学语法捕获。
- 常见 caller 仍只依赖 `useMarkdown()`；围栏转换选项不进入 interface。
- 所有处理器共享同一个 preset。
- KaTeX 保持 `trust: false`。
- 目标 Vitest、浏览器回归、stage-ui typecheck、仓库 lint 全部通过。

## 不采用的方向

### 继续扩充正则白名单

该方向已经被 review thread 反复否定。新的 `\in` 评论只是下一个开放集合成员。

### 用 KaTeX `__parse` 做分段

该接口不在公开类型或官方 API 中。升级 KaTeX 时，AIRI 无法获得兼容保证。

### 先渲染每行，再用成功或失败决定分段

KaTeX 可以成功渲染语义不完整的片段。例如，行尾运算符仍可能产生输出。渲染成功不能证明作者意图。

### 引入完整 LaTeX AST 决定公式边界

AST 能消除 command/relation allowlist，并保护跨行结构。它不能消除作者意图的含糊性。本次用明确围栏模式解决边界问题，不引入 parser。

### 把 `remark-math-extended` 直接设为核心语法

该 fork 的功能符合 TeX 分隔符目标，但维护成熟度和 CommonMark 差异风险过高。若产品明确选择这个方言，应作为独立依赖决策，固定版本并建立 tokenizer ownership，不应随公式围栏修复顺带引入。

## 最终依赖建议

1. 当前公式围栏修复继续使用官方 `remark-math@6`、`rehype-katex@7` 和 `katex@0.16`；设置 `singleDollarTextMath: false`。
2. 普通 `latex` 和 `tex` 内容按非空行渲染；`rows` 是显式别名；`math` 和 `block` 保留完整公式。
3. 不新增 unified-latex、Compute Engine、latex-utensils 或 tree-sitter-latex。
4. 不把 `remark-math-extended` 设为核心依赖。若后续明确选择 `\(...\)`/`\[...\]`，开独立 change，先完成 tokenizer 审计、CommonMark 差异测试和维护接管方案。
