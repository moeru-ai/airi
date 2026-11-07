# AIRI Terminal Agent Beta

This internal Windows candidate uses the existing Chat, Main approval, MCP and PowerShell execution path.
It does not grant permanent Terminal access. GUI and Browser writes remain outside this Beta.
Delegated operator testing does not establish human production authorization. Human acceptance remains Pending.

## Start

Extract the Windows ZIP into a separate folder. Run `airi.exe` from that folder.
The build is unsigned. It does not use the public AIRI update feed.
Keep the whole extracted folder, including `resources` and native libraries.

Configure a model provider through the existing settings. Supply your own endpoint and API key.
The ZIP contains no provider credentials or model gateway.

For a quiet start, run `airi.exe --start-hidden`. Use the tray menu to show AIRI.
The tray also has **Show Terminal requests** to restore open approval and outcome windows.
Closing a pending approval rejects it. Closing an approved window does not undo execution.
Use the tray **Quit** action to stop the application.

## Tools and approval

Open Settings → Modules → MCP servers. **Bundled Terminal** connects through the packaged Electron executable.
It does not require a global Node or pnpm installation. Windows PowerShell must be available.
Connection state updates while this page is open. Connected describes the transport, not a guarantee about a future command.
Use **Save and restart** after changing the connection setting.

The equivalent configuration is:

```json
{ "terminalEnabled": true, "mcpServers": {} }
```

Existing profiles without this switch keep their previous configuration.
The built-in server name `airi-terminal` is reserved while this switch is enabled.

Ask a normal task in Chat. For example, ask for the PowerShell version or a summary of a specific test file.
Include the intended working directory and output file for a file conversion.
Review the complete command, executable, arguments, directory and Session before each approval.
Commands can affect files, applications and system settings. Reject any unexpected operation.
The Host binds approval to one immutable operation. A repair requires a fresh approval.

The outcome window and Chat notice distinguish command completion, failure and an unknown result.
Exit code 0 describes the command. Inspect the resulting file or application state to establish business success.
A failure or timeout does not undo earlier effects. An unknown result does not authorize replay.

## Data, lifetime and recovery

The default profile is `%APPDATA%\AIRI Terminal Beta`.
It is separate from ordinary AIRI data. The Beta channel uses local port 6131.
`APP_USER_DATA_PATH` selects an isolated test profile before the instance lock is acquired.
The application resolves the bundled service path at launch. Moving the extracted folder does not persist an old service path.

The Terminal runner starts each command in its reported directory. This is not a persistent interactive Shell.
A command's internal directory changes do not establish a new working directory for later commands.
The desktop dry-run label describes the desktop backend. Terminal can still execute native PowerShell after approval.

On disconnect or exit, the service stops admission and requests termination of owned direct Shell processes.
It waits for actual close, separately from result readiness. Windows does not establish complete descendant cleanup at this boundary.
Do not launch detached processes in these internal trials.
Do not restart or reconnect to infer that an uncertain operation has become safe.
Inspect outstanding effects and processes before another operation. Existing shared execution protection remains in place during the application lifetime.

Keep previous ZIPs and profiles for rollback. Extract a previous version into its own folder.
Do not overwrite an active installation or delete a profile to recover an unknown result.
Logs are under the selected profile's `logs` directory. Terminal execution records are under `terminal-sessions`.
Reports can contain commands and file contents. Review them before sharing.

## Build

From a prepared repository, run:

```powershell
pnpm install --frozen-lockfile
pnpm run build:packages
pnpm -F @proj-airi/stage-tamagotchi run build:terminal-beta
```

The existing builder writes the ZIP under `apps/stage-tamagotchi/dist`.
This build targets Windows x64. Optional Godot and voice features are outside the Terminal acceptance scope.
The delivery report records the actual SHA, test results, standalone launch and independent task Oracles.
