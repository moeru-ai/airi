# AIRI 项目 Rust 功能详解

本文档详细介绍项目中 Rust 的使用场景、架构设计和各插件功能。

---

## 目录

- [一、Rust 在项目中的定位](#一rust-在项目中的定位)
- [二、工作空间结构](#二工作空间结构)
- [三、原生插件详解](#三原生插件详解)
  - [1. 语音识别插件](#1-语音识别插件tauri-plugin-ipc-audio-transcription-ort)
  - [2. 语音活动检测插件](#2-语音活动检测插件tauri-plugin-ipc-audio-vad-ort)
  - [3. MCP 协议插件](#3-mcp-协议插件tauri-plugin-mcp)
  - [4. 输入设备监听插件](#4-输入设备监听插件tauri-plugin-rdev)
  - [5. 窗口穿透插件](#5-窗口穿透插件tauri-plugin-window-pass-through-on-hover)
  - [6. 窗口路由插件](#6-窗口路由插件tauri-plugin-window-router-link)
- [四、技术架构](#四技术架构)
- [五、开发指南](#五开发指南)

---

## 一、Rust 在项目中的定位

AIRI 项目使用 Rust 实现 **Tauri 原生插件**，为桌面应用提供 TypeScript/Web 技术栈无法直接访问的底层能力：

| 能力类型 | 为什么需要 Rust |
|----------|----------------|
| AI 模型推理 | ONNX Runtime 需要原生性能 |
| 系统级输入监听 | 需要操作系统底层 API |
| 窗口管理 | 平台特定的窗口行为控制 |
| 子进程管理 | MCP 协议需要启动外部进程 |

---

## 二、工作空间结构

```
crates/
├── tauri-plugin-ipc-audio-transcription-ort/   # 语音识别
├── tauri-plugin-ipc-audio-vad-ort/             # 语音活动检测
├── tauri-plugin-mcp/                           # MCP 协议客户端
├── tauri-plugin-rdev/                          # 输入设备监听
├── tauri-plugin-window-pass-through-on-hover/  # 窗口穿透
└── tauri-plugin-window-router-link/            # 窗口路由

apps/stage-tamagotchi/src-tauri/                # Tauri 主应用
```

### Cargo.toml 配置

```toml
[workspace]
members = [
  "crates/tauri-plugin-ipc-audio-transcription-ort",
  "crates/tauri-plugin-ipc-audio-vad-ort",
  "crates/tauri-plugin-mcp",
  "crates/tauri-plugin-rdev",
  "crates/tauri-plugin-window-pass-through-on-hover",
  "crates/tauri-plugin-window-router-link",
  "apps/stage-tamagotchi/src-tauri"
]
resolver = "2"
```

---

## 三、原生插件详解

### 1. 语音识别插件 (tauri-plugin-ipc-audio-transcription-ort)

**路径**: `crates/tauri-plugin-ipc-audio-transcription-ort/`

基于 ONNX Runtime 的 Whisper 模型，实现本地语音转文字功能。

#### 核心功能

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `load_ort_model_whisper` | `model_type: Option<String>` | `Result<(), String>` | 加载 Whisper 模型 |
| `ipc_audio_transcription` | `chunk: Vec<f32>`, `language: Option<String>` | `Result<String, String>` | 音频转录为文本 |

#### 支持的模型

```rust
enum WhichModel {
    Tiny,
    TinyEn,
    Base,
    BaseEn,
    Small,
    SmallEn,
    Medium,
    MediumEn,
    Large,
    LargeV2,
    LargeV3,
    // ...
}
```

#### 使用示例

```typescript
// 前端调用
import { invoke } from '@tauri-apps/api/core'

// 加载模型
await invoke('load_ort_model_whisper', { modelType: 'base' })

// 转录音频
const text = await invoke('ipc_audio_transcription', {
  chunk: audioData,      // Float32Array
  language: 'zh'
})
```

#### 实现要点

```rust
// 核心转录逻辑
let mut config = whisper::whisper::GenerationConfig::default();
config.language = language;  // 可指定语言

let transcription = processor
    .transcribe(chunk.as_slice(), &config)
    .map_err(|e| e.to_string())?;
```

---

### 2. 语音活动检测插件 (tauri-plugin-ipc-audio-vad-ort)

**路径**: `crates/tauri-plugin-ipc-audio-vad-ort/`

基于 Silero VAD 模型，检测音频中是否包含人声。

#### 核心功能

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `load_ort_model_silero_vad` | 无 | `Result<(), String>` | 加载 VAD 模型 |
| `ipc_audio_vad` | `input_data: VADInferenceInput` | `Result<VADInferenceResult, String>` | 检测语音活动 |

#### 数据结构

```rust
pub struct VADInferenceInput {
    pub audio: Vec<f32>,           // 音频数据
    pub sample_rate: u32,          // 采样率
    pub threshold: f32,            // 检测阈值
}

pub struct VADInferenceResult {
    pub is_speech: bool,           // 是否为语音
    pub probability: f32,          // 置信度
}
```

#### 应用场景

- **语音唤醒**: 检测用户开始说话
- **端点检测**: 判断用户说完话
- **静音过滤**: 避免处理静音段

#### 使用示例

```typescript
// 检测语音活动
const result = await invoke('ipc_audio_vad', {
  input_data: {
    audio: audioChunk,
    sample_rate: 16000,
    threshold: 0.5
  }
})

if (result.is_speech) {
  // 用户正在说话
}
```

---

### 3. MCP 协议插件 (tauri-plugin-mcp)

**路径**: `crates/tauri-plugin-mcp/`

实现 Model Context Protocol 客户端，让 AI 能够调用外部工具。

#### 核心功能

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `connect_server` | `command: String`, `args: Vec<String>` | `Result<(), String>` | 连接 MCP 服务器 |
| `disconnect_server` | 无 | `Result<(), String>` | 断开连接 |
| `list_tools` | 无 | `Result<Vec<Tool>, String>` | 列出可用工具 |
| `call_tool` | `name: String`, `args: Option<Map>` | `Result<CallToolResult, String>` | 调用工具 |

#### 架构设计

```
┌─────────────────┐      ┌─────────────────┐
│   AIRI 应用      │      │  MCP 服务器      │
│  (Tauri/Rust)   │◄────►│  (子进程)        │
│                 │ IPC  │                 │
│  rmcp 客户端    │      │  任意语言实现    │
└─────────────────┘      └─────────────────┘
```

#### 使用示例

```typescript
// 连接 MCP 服务器（如 Claude Code）
await invoke('connect_server', {
  command: 'claude-code',
  args: ['--mcp']
})

// 获取可用工具
const tools = await invoke('list_tools')

// 调用工具
const result = await invoke('call_tool', {
  name: 'read_file',
  args: { path: '/path/to/file' }
})
```

#### 依赖

```toml
[dependencies]
rmcp = "0.1"          # Rust MCP 客户端库
tokio = { version = "1", features = ["process"] }
serde_json = "1.0"
```

---

### 4. 输入设备监听插件 (tauri-plugin-rdev)

**路径**: `crates/tauri-plugin-rdev/`

全局监听键盘和鼠标事件，即使应用不在焦点也能接收输入。

#### 监听的事件

| 事件名 | 触发时机 |
|--------|----------|
| `tauri-plugins:tauri-plugin-rdev:keydown` | 键盘按下 |
| `tauri-plugins:tauri-plugin-rdev:keyup` | 键盘释放 |
| `tauri-plugins:tauri-plugin-rdev:mousedown` | 鼠标按下 |
| `tauri-plugins:tauri-plugin-rdev:mouseup` | 鼠标释放 |
| `tauri-plugins:tauri-plugin-rdev:mousemove` | 鼠标移动 |

#### 实现原理

```rust
// 使用 rdev 库监听全局输入
use rdev::{listen, Event, EventType};

fn start_listen<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    listen(move |event: Event| {
        let event_name = match event.event_type {
            EventType::KeyPress(_) => "keydown",
            EventType::KeyRelease(_) => "keyup",
            EventType::ButtonPress(_) => "mousedown",
            EventType::ButtonRelease(_) => "mouseup",
            EventType::MouseMove { .. } => "mousemove",
            _ => return,
        };
        
        // 向所有注册的窗口发送事件
        for label in &state.window_labels {
            app.emit_to(label, event_name, &event);
        }
    });
}
```

#### 使用示例

```typescript
import { listen } from '@tauri-apps/api/event'

// 监听全局键盘事件
const unlisten = await listen('tauri-plugins:tauri-plugin-rdev:keydown', (event) => {
  console.log('Key pressed:', event.payload)
})

// 取消监听
unlisten()
```

#### 应用场景

- 全局快捷键
- 手势识别
- 游戏/应用控制

---

### 5. 窗口穿透插件 (tauri-plugin-window-pass-through-on-hover)

**路径**: `crates/tauri-plugin-window-pass-through-on-hover/`

实现桌面宠物效果：窗口某些区域可交互，其他区域鼠标穿透到下层窗口。

#### 核心功能

| 命令 | 说明 |
|------|------|
| `start_tracing_cursor` | 开始追踪光标位置（~30FPS） |
| `stop_tracing_cursor` | 停止光标追踪 |
| `start_pass_through` | 启用窗口穿透模式 |
| `stop_pass_through` | 禁用窗口穿透模式 |

#### 平台实现

**macOS** (`native_macos.rs`):
```rust
// 使用 AppKit API
use cocoa::appkit::{NSWindow, NSWindowStyleMask};

fn set_pass_through_enabled(window: &NSWindow, enabled: bool) {
    if enabled {
        window.setStyleMask_(NSWindowStyleMask::NSWindowStyleMaskBorderless);
        window.setIgnoresMouseEvents_(YES);
    } else {
        window.setIgnoresMouseEvents_(NO);
    }
}
```

**Windows** (`native_windows.rs`):
```rust
// 使用 Win32 API
use winapi::um::winuser::{SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT};

fn set_pass_through_enabled(hwnd: HWND, enabled: bool) {
    let ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
    if enabled {
        unsafe { SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style | WS_EX_TRANSPARENT) };
    }
}
```

#### 使用示例

```typescript
// 启动光标追踪
await invoke('start_tracing_cursor')

// 根据光标位置判断是否穿透
listen('cursor-position', (e) => {
  const { x, y } = e.payload
  if (isOverCharacter(x, y)) {
    invoke('stop_pass_through')  // 角色区域可交互
  } else {
    invoke('start_pass_through')  // 空白区域穿透
  }
})
```

---

### 6. 窗口路由插件 (tauri-plugin-window-router-link)

**路径**: `crates/tauri-plugin-window-router-link/`

多窗口路由管理，支持在不同窗口间导航。

#### 核心功能

| 命令 | 参数 | 说明 |
|------|------|------|
| `go` | `route: String`, `window_label: String` | 在指定窗口导航到路由 |

#### 架构设计

```rust
// 窗口匹配器，注册各窗口的创建逻辑
pub struct WindowMatcher<R: Runtime> {
    creators: HashMap<String, WindowCreator<R>>,
}

impl<R: Runtime> WindowMatcher<R> {
    pub fn register<F>(mut self, label: &str, creator: F) -> Self {
        self.creators.insert(label.to_string(), Box::new(creator));
        self
    }
}
```

#### 使用示例

```typescript
// 在设置窗口中打开隐私设置页
await invoke('go', {
  route: '/settings/privacy',
  window_label: 'settings'
})
```

```rust
// 主应用中注册窗口创建器
let matcher = WindowMatcher::new()
    .register("main", |app, _| {
        MainWindowBuilder::new(app).build()
    })
    .register("settings", |app, _| {
        SettingsWindowBuilder::new(app).build()
    });
```

---

## 四、技术架构

### 整体架构

```
┌────────────────────────────────────────────────────────────┐
│                    TypeScript 前端                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Vue    │  │  Pinia   │  │  UnoCSS  │  │ Three.js │   │
│  └────┬─────┘  └──────────┘  └──────────┘  └──────────┘   │
│       │ @tauri-apps/api                                     │
└───────┼────────────────────────────────────────────────────┘
        │ invoke() / events
┌───────▼────────────────────────────────────────────────────┐
│                    Rust 原生插件层                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ 语音识别     │  │ 语音检测    │  │ MCP 协议    │        │
│  │ Whisper     │  │ Silero VAD  │  │ rmcp        │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ 输入监听     │  │ 窗口穿透    │  │ 窗口路由    │        │
│  │ rdev        │  │ Win/Mac API │  │ 多窗口管理   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└────────────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────┐
│                    操作系统 API                             │
│     ONNX Runtime  │  Win32 API  │  AppKit  │  udev        │
└────────────────────────────────────────────────────────────┘
```

### 依赖关系

```toml
[workspace.dependencies]
tauri = "2.0"                    # Tauri 框架
tokio = { version = "1", features = ["full"] }  # 异步运行时
serde = { version = "1.0", features = ["derive"] }  # 序列化
serde_json = "1.0"               # JSON 处理
specta = "2.0"                   # 类型导出
rmcp = "0.1"                     # MCP 客户端
rdev = "0.6"                     # 输入设备监听
ort = "2.0"                      # ONNX Runtime
```

---

## 五、开发指南

### 环境要求

参考 `rust-toolchain.toml`:

```toml
[toolchain]
channel = "nightly-2025-05-25"
components = ["rustc", "cargo", "rustfmt", "rust-analyzer", "clippy"]
targets = [
    "x86_64-apple-darwin",
    "aarch64-apple-darwin",
    "x86_64-unknown-linux-gnu",
    "aarch64-unknown-linux-gnu",
    "x86_64-pc-windows-msvc"
]
```

### 常用命令

```bash
# 构建 Rust 工作空间
pnpm build:crates
# 或
cargo build --workspace

# 运行 clippy 检查
cargo clippy --workspace

# 格式化代码
cargo fmt

# 运行测试
cargo test --workspace
```

### 创建新插件

1. 在 `crates/` 下创建新目录
2. 添加 `Cargo.toml`:
```toml
[package]
name = "tauri-plugin-xxx"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { workspace = true }
serde = { workspace = true }

[build-dependencies]
tauri-build = { version = "2.0" }
```

3. 实现插件入口 `src/lib.rs`:
```rust
use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

#[tauri::command]
async fn my_command() -> Result<String, String> {
    Ok("Hello from Rust!".to_string())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("xxx")
        .invoke_handler(tauri::generate_handler![my_command])
        .build()
}
```

4. 在 `Cargo.toml` 工作空间中注册
5. 在 Tauri 应用中注册插件

### 调试技巧

```rust
// 使用 log crate 输出日志
use log::info;

#[tauri::command]
async fn my_command() -> Result<(), String> {
    info!("Command called");
    Ok(())
}
```

日志会输出到 Tauri 控制台，可通过 `RUST_LOG=debug` 环境变量控制日志级别。

---

## 总结

AIRI 项目的 Rust 部分专注于为桌面应用提供 **高性能原生能力**：

| 插件 | 核心能力 | 关键依赖 |
|------|----------|----------|
| 语音识别 | 本地 Whisper 推理 | ONNX Runtime |
| 语音检测 | VAD 实时检测 | Silero VAD |
| MCP 协议 | AI 工具调用 | rmcp |
| 输入监听 | 全局键鼠事件 | rdev |
| 窗口穿透 | 桌面宠物效果 | Win32/AppKit |
| 窗口路由 | 多窗口管理 | Tauri |

这些插件共同支撑起 AIRI 作为 AI 虚拟角色的核心交互能力。
