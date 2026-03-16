[English](README.md) / [日本語](README.ja.md)

---

# Cubism Web Samples for TypeScript

This is a sample implementation of an application implemented with TypeScript.


## Development environment

| Package | Version |
| --- | --- |
| TypeScript | 5.7.2 |
| Vite | 6.0.3 |

For other packages, check the `package.json` for each project.
For other development environments and operation environments, see [README.md](/README.md) in the top directory.


## Task list

### `npm: start`

Starts a local server for development and creates a project monitor build.
Any changes you make to the project will automatically rebuild and cause the browser to reload.
You can debug in Visual Studio Code from [Debug Project].

To terminate in Visual Studio Code, type `>Tasks: Terminate Task` and select the task from the command palette.

### `npm: build`

Outputs a TypeScript build deliverable to the `dist` directory.
The output is a JavaScript file that has been bundled into one using Vite.
When you execute this command, it will also copy the necessary files for operation.

You can change the settings by editing `tsconfig.json` and `vite.config.mts`.

### `npm: build:prod`

Creates above build after optimizing it.
It is used to output deliverables for production environments as it reduces the build size.

### `npm: test`

Performs a TypeScript type check test.

You can change the settings by editing `tsconfig.json`.

### `npm: lint`

Performs static analysis of TypeScript files in the `src` directory.

You can change the settings by editing `.eslintrc.yml`.

### `npm: lint:fix`

Performs static analysis and automatic modification of TypeScript files in the `src` directory.

You can change the settings by editing `.eslintrc.yml`.

### `npm: serve`

Starts a simple local server.
You can check the index.html by accessing `/Samples/TypeScript/Demo` in the server from your browser.
The project needs to be built in advance.

Deliverables can be verified in an environment close to the production environment.

### `npm: clean`

Deletes the build deliverable directory (`dist`).
