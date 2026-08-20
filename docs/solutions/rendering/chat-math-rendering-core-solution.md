---
module: stage-ui
tags:
  - markdown
  - math
  - latex
  - katex
  - remark-math
problem_type: rendering-architecture
---

# AIRI 聊天公式渲染问题与核心方案

## 文档目的

本文说明 AIRI 当前的公式渲染问题，并给出一个确定的输入契约。

本文关注聊天模型输出。本文不定义通用 Markdown 或完整 LaTeX 语法。

详细调研见 [LaTeX 围栏渲染重设计](./latex-fence-rendering-redesign.md)。

## 结论

当前实现不能继续增加正则表达式。

物理换行不能证明两段 LaTeX 是两条独立公式。关系符也不能证明公式边界。

核心方案使用明确的 AIRI 聊天数学语法：

- 单个 `$` 始终是普通文本。
- 行内公式使用 `$$...$$`。
- 独立的展示公式使用独占行的 `$$` 块。
- `latex` 和 `tex` 围栏表示公式列表。
- 公式列表中的每个非空物理行是一条公式。
- `math` 围栏表示一个完整公式。
- `latex block` 和 `tex block` 也表示一个完整公式。
- 渲染器不检查关系符、命令、自然语言或货币词语。

该方案继续使用官方 `remark-math` 和 `rehype-katex`。该方案不增加 LaTeX parser。

## 当前渲染流程

聊天内容使用以下流程：

```text
model output
  -> remark-parse
  -> remark-math
  -> AIRI chat-math normalization
  -> remark-rehype
  -> rehype-katex
  -> MathML
  -> DOMPurify
  -> v-html
```

主要代码位于以下文件：

- `packages/stage-ui/src/composables/markdown.ts`
- `packages/stage-ui/src/composables/markdown.test.ts`
- `packages/stage-ui/src/components/markdown/markdown-renderer.vue`
- `packages/stage-ui/src/stores/chat/session-store.ts`

## 当前问题

### `latex` 围栏最初显示为源码

[Discussion #2239](https://github.com/moeru-ai/airi/discussions/2239) 包含一个 `latex` 围栏。该围栏包含多条导数和积分公式。

Markdown parser 把该围栏解析为代码。Shiki 随后显示 LaTeX 源码。KaTeX 没有收到这些公式。

因此，用户看见红色 LaTeX 命令，而不是排版后的公式。

### 当前修复从内容猜测公式边界

当前 PR 把 `latex` 和 `tex` 围栏转换为数学节点。转换代码随后检查每个物理行。

该代码检查以下内容：

- 等号和不等号
- LaTeX 关系命令
- 行首运算符
- 行尾运算符
- 大括号
- `\left` 和 `\right`
- 环境命令
- 宏定义

每个新规则都修复一个样例。每个新规则也产生新的相反样例。

例如，最初的关系符列表没有包含以下命令：

```latex
x \in A
y \notin B
z \subseteq C
```

这些行是独立公式，但旧规则不能识别它们。

关系命令是开放集合。继续增加命令列表不能形成稳定的输入契约。

### 物理换行没有固定的数学语义

下面的内容可以表示一条跨行公式：

```latex
x = a
+ b = c
```

下面的内容可以表示两条独立公式：

```latex
x \in A
y \in B
```

LaTeX parser 通常把普通换行当作空白。AST 不能恢复作者的排版意图。

因此，渲染器不能从换行或 AST 自动选择正确边界。

### 跨行结构会破坏按行切分

LaTeX 命令可以跨越物理行。下面的内容必须作为一个公式处理：

```latex
\frac{a=b}
{c=d}
```

相同问题也影响以下结构：

- `aligned` 和 `cases` 环境
- `\left` 和 `\right`
- `\sqrt` 的可选参数
- 下标和上标
- 宏定义和宏调用

内容检查不能完整覆盖 LaTeX 的结构和宏系统。

### 单美元公式与货币冲突

`remark-math` 默认把单个 `$` 当作行内公式分隔符。

下面的普通文本会被错误解析：

```text
Price is $5 and cost is $10.
```

`remark-math` parser 会把两个货币符号配对。中间的文本会变成一个数学节点。

自然语言规则不能稳定修复该问题。下面的文本既可以是公式，也可以包含金额或单位：

```text
$5 + x$
$5-$10
$5 to $10
$5 ms $ 10
$5 x y $ 10
```

词语、语言、货币格式和数学变量都是开放集合。

### 当前模型提示词要求单美元公式

当前系统提示词要求模型使用 `$ x^3 $` 格式。

该要求与货币安全规则冲突。如果渲染器关闭单美元公式，模型提示词也必须更新。

## 核心输入契约

### 普通美元文本

单个 `$` 始终是普通文本。

```markdown
Price is $5 and cost is $10.
```

该文本不能产生数学节点。

### 行内公式

行内公式使用两个美元符号。

```markdown
The result is $$f'(x)=2x$$.
```

`remark-math` 在 `singleDollarTextMath: false` 时支持该语法。

### 展示公式

展示公式使用独占行的 `$$` 块。

```markdown
$$
f'(x)=2x
$$
```

一个展示块表示一条公式。多个独立公式必须使用多个展示块。

### 公式列表

`latex` 和 `tex` 围栏表示公式列表。

````markdown
```latex
\frac{d}{dx}(c)=0
\frac{d}{dx}(x^n)=n x^{n-1}
x \in A
```
````

渲染器把每个非空物理行转换为一个展示数学节点。

该规则是 AIRI 聊天语法。该规则不依赖公式内容。

`latex rows` 和 `tex rows` 可以作为明确别名。它们与默认列表模式相同。

### 完整公式块

`math` 围栏表示一个完整公式。

````markdown
```math
\begin{aligned}
f(x) &= x^2 \\
f'(x) &= 2x
\end{aligned}
```
````

`latex block` 和 `tex block` 具有相同语义。

````markdown
```latex block
\newcommand{\foo}{x=1}
\foo=2
```
````

渲染器把完整内容交给一次 KaTeX 调用。宏作用域和跨行结构保持完整。

## 核心实现

### 保留官方依赖

实现继续使用以下 package：

- `remark-math@6`
- `rehype-katex@7`
- `katex@0.16`

实现不增加以下 package：

- `remark-math-extended`
- `unified-latex`
- `latex-utensils`
- Compute Engine
- `tree-sitter-latex`

`remark-math-extended` 支持传统 TeX 分隔符，但它的维护和生态规模较小。

LaTeX parser 可以发现部分跨行结构。LaTeX parser 不能确定独立公式边界。

### 建立一个 chat-math module

`useMarkdown()` 继续作为业务入口。调用方不需要了解数学语法实现。

内部的 chat-math module 负责以下规则：

- 配置 `remark-math`
- 读取围栏语言和 `meta`
- 转换列表围栏
- 转换完整公式围栏
- 保持同步和异步处理器一致
- 生成确定的数学节点

该 module 不能公开 parser AST 或关系符规则。

### 删除内容启发式

实现必须删除以下内容：

- 关系符白名单
- 运算符白名单
- 括号平衡判断
- `\left` 和 `\right` 平衡判断
- 宏命令列表
- 货币连接词规则

围栏的语言和模式决定边界。LaTeX 内容不能改变该决定。

### 更新模型提示词

模型提示词必须包含以下规则：

```text
- Use $$...$$ for inline math.
- Use a separate multiline $$ block for each display equation.
- Use a latex fence for a list of independent one-line equations.
- Use a math fence for one multiline equation or LaTeX environment.
- Do not use single dollar signs as math delimiters.
```

模型提示词和渲染器必须使用相同的输入契约。

### 保持错误和安全策略

KaTeX 必须继续使用 `trust: false`。

渲染器必须继续输出 MathML。DOMPurify 必须继续清理最终 HTML。

实现不能调用 `katex.__parse`。该函数不是公开接口。

如果 KaTeX 不能渲染公式，输出必须保留可见源码。处理流程不能丢弃用户内容。

## 不解决的内容

该方案不推断含糊的作者意图。

如果一个公式跨越多行，模型必须使用 `math` 或 `block` 模式。

如果多条公式放在一个列表围栏中，每条公式必须占一个非空物理行。

该方案不实现完整 LaTeX。KaTeX 的受支持命令集合仍是最终渲染范围。

## 实施步骤

1. 增加 chat-math module，并保持 `useMarkdown()` 接口不变。
2. 配置 `remark-math`，并设置 `singleDollarTextMath: false`。
3. 把 `latex` 和 `tex` 围栏转换为公式列表。
4. 把 `math` 围栏和带 `block` meta 的围栏转换为完整公式。
5. 删除公式边界和货币启发式。
6. 更新系统提示词。
7. 增加模块测试和浏览器测试。
8. 运行 package typecheck 和仓库 lint。

## 自测范围

先增加回归测试，并确认测试因当前问题而失败。然后修改生产代码。

测试通过 `useMarkdown()` 检查最终 HTML。测试不能导出或直接检查私有分类函数。

DOMPurify 和浏览器行为使用 Vitest browser mode。Node 测试只检查 Markdown 和 KaTeX 的输出。

### 公式列表

自测必须覆盖以下内容：

- Discussion #2239 的完整导数和积分样例
- 不含关系符的公式
- `=`, `<` 和 `>`
- `\in`, `\notin` 和 `\subseteq`
- `\sin`, `\cos` 和 `\tan`
- 空行和 CRLF 输入

每个非空行必须产生一个 `<math>` 元素。

### 完整公式

自测必须覆盖以下内容：

- `aligned` 和 `cases`
- 跨行 `\frac`
- `\left` 和 `\right`
- `\sqrt` 的可选参数
- 跨行上下标和上标
- 宏定义和宏调用

每个完整公式围栏必须产生一个 `<math>` 元素。

### 货币和行内公式

以下文本不能产生数学节点：

```text
Price is $5 and cost is $10.
Prices are $5 and $10.
Tickets cost $5-$10.
Tickets cost $5 to $10.
```

以下文本必须产生行内数学节点：

```text
The result is $$5 + x$$.
At $$5\,\mathrm{ms}$$, 10 samples arrived.
Compare $$5xy$$ with 10.
```

### 一致性和安全

相同输入必须在以下路径产生相同数量的数学节点：

- `processSync`
- 基础异步处理器
- 带 Shiki 的异步处理器

自测必须确认以下安全属性：

- `trust` 保持 `false`
- 不可信 URL 不能生成危险链接
- 无效 LaTeX 不能使处理流程崩溃
- 错误回退保留原始公式源码
- DOMPurify 删除危险 HTML

## 验收标准

- Discussion #2239 的公式列表按行渲染。
- `\in`, `\notin` 和 `\subseteq` 不需要特殊规则。
- 多行环境和跨行命令在完整公式模式中保持完整。
- 普通货币文本不产生数学节点。
- 行内 `$$...$$` 公式正常渲染。
- `markdown.ts` 不包含公式关系符或货币词语白名单。
- 同步和异步处理器使用相同的数学语法。
- KaTeX 和 DOMPurify 的安全策略保持不变。
- 不增加新的运行时 package。

## 相关资料

- [Discussion #2239](https://github.com/moeru-ai/airi/discussions/2239)
- [Issue #2242](https://github.com/moeru-ai/airi/issues/2242)
- [PR #2328](https://github.com/moeru-ai/airi/pull/2328)
- [remark-math](https://github.com/remarkjs/remark-math)
- [rehype-katex](https://github.com/remarkjs/remark-math/tree/main/packages/rehype-katex)
- [KaTeX options](https://katex.org/docs/options)
- [LaTeX 围栏渲染重设计](./latex-fence-rendering-redesign.md)
