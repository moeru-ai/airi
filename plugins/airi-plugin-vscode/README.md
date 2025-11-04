# Airi VSCode Companion

VSCode 插件,用于感知编码环境并与 Airi 陪伴系统集成。

## 功能

- 实时获取编码上下文(文件、行号、周围代码)
- 监听文件保存和切换事件
- 追踪光标位置和选中的代码
- 获取 Git 分支信息
- 通过 Channel Server 与 Airi 通信

## 配置

在 VSCode 设置中可配置以下选项:

- `airi.companion.enabled`: 启用/禁用插件 (默认: true)
- `airi.companion.contextLines`: 获取上下文的行数 (默认: 5)
- `airi.companion.sendInterval`: 发送更新的间隔(毫秒) (默认: 3000, 设为 0 则不定时发送)

## 命令

- `Airi: Enable Companion` - 启用陪伴功能
- `Airi: Disable Companion` - 禁用陪伴功能
- `Airi: Show Status` - 显示连接状态

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式(监听文件变化)
pnpm dev

# 构建
pnpm build

# 类型检查
pnpm typecheck
```

## 调试

1. 在 VSCode 中打开插件目录
2. 按 `F5` 或选择 "Run Extension" 调试配置
3. 这会打开一个新的 VSCode 窗口(扩展开发主机)
4. 在新窗口中打开你的项目开始编码
5. 插件会自动连接到 Airi Channel Server
6. 上下文信息会自动发送到 Airi

## 使用

### 命令面板(Cmd/Ctrl + Shift + P)
- `Airi: Enable Companion` - 启用陪伴功能
- `Airi: Disable Companion` - 禁用陪伴功能
- `Airi: Show Status` - 显示连接状态

## 数据格式

发送到 Airi 的事件格式:

```typescript
{
  type: 'vscode:context',
  data: {
    type: 'coding:context' | 'coding:save' | 'coding:switch-file',
    data: {
      file: { path, languageId, fileName, workspaceFolder },
      cursor: { line, character },
      selection?: { text, start, end },
      currentLine: { lineNumber, text },
      context: { before: string[], after: string[] },
      git?: { branch, isDirty },
      timestamp: number
    }
  }
}
```
