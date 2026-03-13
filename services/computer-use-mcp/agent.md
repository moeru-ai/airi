# computer-use-mcp Agent Handoff

## Current Skeleton PR

`#1307` 的目标已经收窄成 **Core skeleton / orchestration**。

这条 PR 只该保留：

- `computer-use-mcp` 的骨架主线：workflow engine、state/strategy/run-state、support matrix、reroute contract
- terminal/orchestration 的最低可用主线：`exec`、`PTY self-acquire`、terminal grant / `pty_session` 语义
- `stage-ui` 的主消费链：MCP bridge、approval session、reroute 解析/消费、tool loop 对 computer-use 的主消费
- `stage-tamagotchi` 的最低 glue：MCP routing、desktop/computer-use approval、`App.vue` 里的 computer-use 主路径

这条 PR 不再承担 IDE、browser devtools、provider/proxy、self-tools demo hook 的主叙事。

## Follow-up PR Chunks

1. **PR 1 — Core Skeleton / Orchestration**
   Branch: `codex/pr1307-core-skeleton`
   先合 `#1307`。只留：MCP routing / bridge / approval session、workflow / reroute contract、terminal lane 主线、AIRI chat 对 computer-use 的主消费链、必要的 desktop approval glue。

2. **PR 2 — Terminal Lane Implementation**
   Branch: `codex/pr1307-terminal-lane`
   如果 PR 1 仍然太大，就把 terminal 再单拎一条。只放：`exec`、`pty`、`self-acquire`、terminal workflow/state/gates/evidence。不混 VS Code、browser devtools、provider proxy。

3. **PR 3 — Per-Adapter Implementations**
   Branch: `codex/pr1307-adapters`
   adapter 按面慢慢合，不再继续塞进骨架 PR。至少包括：
   - self-devtools / browser-devtools adapter
   - airi-self / self-navigation adapter
   - IDE / VS Code adapter
   - 其他 app-specific adapter

4. **PR 4 — Provider / Proxy Leftovers**
   Branch: `codex/pr1307-provider-proxy`
   GitHub Models provider、`github-models-openai-proxy.ts`、provider-side tests、以及任何和 provider 特性强绑定的 glue。

## Deferred Review Items

- [PR 1] 把 `#1307` 真正收成 skeleton，不再继续混入 browser/proxy/demo/IDE lane
- [PR 2] terminal lane 的 file set 再收紧，决定哪些必须跟骨架走、哪些独立成 terminal PR
- [PR 3] IDE/VS Code controller、debug bridge、airi-self/self-navigation、browser/self-devtools 按 adapter 分拆
- [PR 4] GitHub Models provider / proxy 从主叙事里拆出去
- [Later] `remote/**`、`runner/**`、`browser-dom/**`、`linux-x11.ts`、`accessibility/ax-tree.ts`、`display/enumerate.ts` 等系统/adapter debt 单独清

## Explicit Decisions

- `#1307` 不再继续承载 provider/proxy、browser demo hook、IDE/VS Code lane 主叙事。
- `airi-self.ts` 本轮维持显式 allowlist，不改成 router 扫描 `/settings`。
- 不把 GitHub review 里的所有评论原样抄进这里；这里只记录 chunk、边界和明确延后项。
- `#1307` 只讲 terminal/orchestration skeleton；其余能力按 4 块逐条 PR。
