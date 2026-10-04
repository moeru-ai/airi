# ACP server

This service is an Agent Client Protocol (ACP) v1 adapter. An ACP Client starts it as a stdio process. The AIRI desktop application runs the model, the tools, the prompt, and the character.

## Use it

Start the AIRI desktop application.

Point the ACP Client at this command. Replace `<version>` with the version of the open AIRI desktop application.

```bash
npx @proj-airi/acp-server@<version>
```

A global install gives the command `airi-acp`.

The process reads JSON-RPC from stdin and writes JSON-RPC to stdout.

The desktop application listens on `127.0.0.1` port `47221`. This process connects to that port. When the desktop application is closed, `session/new` and `session/prompt` fail. The error says that the AIRI desktop is not started.

## Develop it

From this repository, run:

```bash
pnpm -F @proj-airi/acp-server dev
```

## Do not use it for

This process does not choose a model or a character. The open desktop application uses the current character card and the current model. Do not set a provider key or a model id for this process.

File read, file write, terminal, and MCP access come from the ACP Client. The desktop application adds them only to the chat session that this connection opened. A normal chat session does not receive those tools. When the ACP Client disconnects, that session stays in the list and can still send messages without those tools. The client loads the same session id to connect it again.
