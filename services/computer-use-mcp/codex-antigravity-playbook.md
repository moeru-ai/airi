# Codex + Antigravity Execution Playbook

这不是宣传文档，也不是下一阶段口号。

这是 `services/computer-use-mcp` 这条线的**持续推进执行手册**，目标只有两个：

1. 让 Antigravity / Gemini 继续负责高吞吐编码与测试草拟。
2. 让 Codex 负责收尾、审查、切分提交、推送和 PR 卫生。

如果这份文档和任何“Phase 已全面完成”的总结冲突，**以这份文档为准**。

---

## 1. 角色分工

### Gemini / Antigravity 负责

- 阅读相关代码并提出 bounded 方案
- 实现单一 workstream 的代码
- 补真实测试
- 跑最小必要验证
- 把结果和风险明确交回 Codex

### Codex 负责

- 现实核查：看真实 worktree，不信口头总结
- 语义审查：判断方向是否歪，不只是看测试是否绿
- 清理 mixed tree
- 切 commit
- 决定哪些改动该收、哪些该丢
- 推送、PR、后续 review 处理

硬规则：

- **Gemini 写**
- **Codex 审、切、提、推**

Gemini **不负责**判断“这条线已经完成，可以继续下一 Phase”。

---

## 2. 当前已落地基线

当前分支：`codex/claude-inspired-toolsearch-design`

当前这条线已经有这些本地 commit：

- `68f68c39`
  `feat(computer-use-mcp): Cut 1 — structured verification evidence and handoff fulfillment`
- `90f77b54`
  `feat(computer-use-mcp): Cut 2 — terminal hygiene: pagination detection and CWD heuristics`
- `459ecee9`
  `refactor(computer-use-mcp): Cut 3 — strategy cleanup and anti-spam stabilization`
- `753d701f`
  `chore(computer-use-mcp): finalize verification hardening handoff`
- `58ae1de1`
  `docs(computer-use-mcp): add antigravity continuation roadmap`

这些 commit 的现实含义：

- 结构化 verification evidence 已落地
- handoff contract / fulfillment 已有第一版
- terminal hygiene 已落地
- duplicate-click hard gate 已被降回 advisory
- review finding 里那个没意义的 `verification-evidence.test.ts` 已经删除

但注意：

- **这不等于“系统全面完成”**
- **这更不等于“可以随便开 Phase 8”**

---

## 3. 当前真实工作树状态

写这份文档时，工作树**不是干净的**。

当前有 3 个 tracked 文件还处于未提交状态：

- `src/server/integrated-tool-evidence.test.ts`
- `src/server/register-tools.ts`
- `src/server/verification-evidence-capture.ts`

这 3 个文件目前对应的是一个**狭义 workstream**：

### Browser evidence refinement（advisory-only）

已经能看到的方向：

- `browser_dom_set_input_value`
- `browser_dom_check_checkbox`
- `browser_dom_select_option`

正在补：

- 更像样的 browser interaction evidence capture
- 至少一条真实 integration test

这条 workstream **可以继续**，但必须遵守：

- advisory-only
- 不新增 hard gate
- 不装作 DOM proof 已经存在
- 不把“页面前台 + 标题”吹成强证据

如果下一次继续开发，**默认就是继续这 3 个文件**，不是再开新主题。

---

## 4. 下一步优先级

后面应该按这个顺序来，不要乱跳。

### Priority 1: 收掉当前这 3 个未提交文件

目标：

- 完成 browser evidence refinement 这一个窄 workstream
- 跑完验证
- 由 Codex 审查后决定：
  - 收成一个小 commit
  - 或直接丢弃

这是最近的、也是唯一默认允许继续写的工作。

### Priority 2: Push / PR / review

如果当前 workstream 被 Codex 认可：

1. 整体 revalidate
2. 推分支
3. 开 PR 或准备 review
4. 进入 review-fix 循环

### Priority 3: 只在当前分支被 review 后，才讨论下一条线

真正允许往后看的方向，只有这几个：

- browser evidence refinement 继续收紧
- evidence confidence normalization
- browser async advisory nudges

不是现在，不是在 dirty tree 上。

---

## 5. 当前明确允许的 workstream

### Workstream A: Browser evidence refinement

范围只限：

- `src/server/register-tools.ts`
- `src/server/verification-evidence-capture.ts`
- `src/server/integrated-tool-evidence.test.ts`

目标：

- 为更多 browser interaction 写结构化 evidence
- 补真实 integration test
- 保持 non-blocking

验收标准：

- `pnpm -F @proj-airi/computer-use-mcp typecheck`
- 针对 evidence / handoff / coding / terminal 相关测试继续全绿
- 不新增 hard fail path

### Workstream B: Review-fix only

只有在 PR / review 期间才允许。

范围：

- 只修 reviewer 指出的具体问题
- 不借 review 顺手扩功能

### Workstream C: Documentation sync

允许更新：

- `services/computer-use-mcp/antigravity-handoff.md`
- `services/computer-use-mcp/antigravity-roadmap.md`
- `services/computer-use-mcp/codex-antigravity-playbook.md`

前提：

- 文档要反映**真实工作树**
- 不得继续写“路线图已圆满完成”这种废话

---

## 6. 明确禁止的方向

这些东西 Gemini 不能自己开。

### 禁止 1：Phase 8 式浏览器稳定性大工程

先别碰：

- DOM hash hard gate
- browser staleness blocking
- 自动 retry loop
- page-ready hard fail

原因很简单：

- 当前证据模型还不够强
- 分支还没 review / push
- 继续加只会把树搞脏

### 禁止 2：重复点击再升级成 hard gate

已经踩过坑了，不准倒车。

`click_likely_duplicate` 现在只能是 advisory，除非证据模型有实质升级并且 Codex 明确批准。

### 禁止 3：把 heuristic 当 proof

不准把这些东西包装成“强验证”：

- window title 模糊匹配
- foreground app 名称
- 纯 runState 文本摘要
- self-report

### 禁止 4：测试为了测试而测试

不准再写这种垃圾：

- “类型能 new 出来”的 shape test
- 不覆盖真实 handler / integration path 的样板测试

### 禁止 5：Phase 口号工程

别再写这种话：

- “Phase 7 已圆满落地”
- “路线图已全面建成”
- “现在可以继续 Phase 8”

这类句子如果对应不到：

- 干净 worktree
- 真实验证
- 明确 commit 边界

那就是废话。

---

## 7. Gemini 每次开工前必须做什么

每次开工前，Gemini 必须先读：

- `services/computer-use-mcp/antigravity-handoff.md`
- `services/computer-use-mcp/antigravity-roadmap.md`
- `services/computer-use-mcp/codex-antigravity-playbook.md`

然后必须明确给出：

1. 当前只做哪个 workstream
2. 预计改哪些文件
3. 是否 advisory-only
4. 会跑哪些验证命令

如果它没先做到这 4 条，就不要让它直接写。

---

## 8. Gemini 每次交接给 Codex 时必须提供什么

必须按这个格式交接：

```md
## Workstream
- Browser evidence refinement

## Files changed
- src/server/register-tools.ts
- src/server/verification-evidence-capture.ts
- src/server/integrated-tool-evidence.test.ts

## Validation run
- pnpm -F @proj-airi/computer-use-mcp typecheck
- pnpm -F @proj-airi/computer-use-mcp exec vitest run ...

## Behavior impact
- advisory-only

## Risks / open questions
- browser evidence still depends on foreground/runtime summary, not DOM proof

## Needs Codex
- review semantics
- decide commit boundary
```

少一项，就不算准备好交接。

---

## 9. Codex 的收尾职责

收到 Gemini 交接后，Codex 必须做：

1. 看真实 diff，不看总结口号
2. 重新跑验证
3. 判断是不是语义上站得住
4. 判断应该：
   - 收 commit
   - 拆 commit
   - 还是直接丢
5. 负责 push / PR / review 回复

Codex 默认要怀疑这些风险：

- Gemini 把 advisory 偷偷写成 hard gate
- Gemini 写了方向错但测试全绿的代码
- Gemini 把 mixed tree 说成“已经全面完成”
- Gemini 写了证明错东西的测试

---

## 10. Definition of Done

一条 workstream 只有同时满足这些，才叫 done：

1. `typecheck` 绿
2. 相关 targeted tests 绿
3. 改动范围是单一且可解释的
4. review findings 已处理
5. worktree 干净，或者至少 commit 边界已明确
6. Codex 同意语义

如果只有前两条成立，那只是“实现了”，**不是 done**。

---

## 11. 当前推荐的直接下一步

如果下次你要让 Gemini 继续干活，直接给它这句：

```text
先阅读 services/computer-use-mcp/antigravity-handoff.md、services/computer-use-mcp/antigravity-roadmap.md、services/computer-use-mcp/codex-antigravity-playbook.md。当前只允许继续 Browser evidence refinement 这一个 advisory-only workstream，只能改 src/server/register-tools.ts、src/server/verification-evidence-capture.ts、src/server/integrated-tool-evidence.test.ts。不要开启 Phase 8，不要新增 hard gate，不要扩 heuristics，不要决定 commit 边界。做完后按交接模板把文件、验证命令、风险和需要 Codex 做的事写清楚。
```

如果下次你要把善后交给 Codex，直接给 Codex 这句：

```text
请按 services/computer-use-mcp/codex-antigravity-playbook.md 执行收尾：先核查当前 3 个未提交文件的 browser evidence refinement 是否语义成立，再决定收成一个小 commit还是直接丢弃；随后负责 push / PR / review hygiene。
```

---

## 12. 不要混进来的文件

这些默认不要碰：

- `patches/@mediapipe__tasks-vision.patch`
- `patches/crossws@0.4.4.patch`
- `services/computer-use-mcp/Google antigravity活动.md`
- `services/computer-use-mcp/claude-code-heuristics.md`
- `uncommitted-cross-lane-verification.patch`

如果 Gemini 想把这些混进当前 workstream，直接叫停。
