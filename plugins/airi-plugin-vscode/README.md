# Airi VSCode Companion

VSCode extension for sensing coding environment and integrating with Airi companion system.

## Features

- Real-time coding context capture (file, line number, surrounding code)
- Listen to file save and switch events
- Track cursor position and selected code
- Retrieve Git branch information
- Communicate with Airi through Channel Server

## Configuration

The following options can be configured in VSCode settings:

- `airi.companion.enabled`: Enable/disable the extension (default: true)
- `airi.companion.contextLines`: Number of context lines to capture (default: 5)
- `airi.companion.sendInterval`: Update send interval in milliseconds (default: 3000, set to 0 to disable periodic sending)

## Commands

- `Airi: Enable Companion` - Enable companion feature
- `Airi: Disable Companion` - Disable companion feature
- `Airi: Show Status` - Show connection status

## Development

```bash
# Install dependencies
pnpm install

# Development mode (watch for file changes)
pnpm dev

# Build
pnpm build

# Type checking
pnpm typecheck
```

## Debugging

1. Open the extension directory in VSCode
2. Press `F5` or select "Run Extension" debug configuration
3. This will open a new VSCode window (Extension Development Host)
4. Open your project in the new window and start coding
5. The extension will automatically connect to Airi Channel Server
6. Context information will be automatically sent to Airi

## Usage

### Command Palette (Cmd/Ctrl + Shift + P)
- `Airi: Enable Companion` - Enable companion feature
- `Airi: Disable Companion` - Disable companion feature
- `Airi: Show Status` - Show connection status

## Data Format

Event format sent to Airi:

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
