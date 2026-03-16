[English](README.md) / [日本語](README.ja.md)

---

# Cubism Web Samples

This is a sample implementation of an application that displays models output by Live2D Cubism Editor.

It is used in conjunction with the Cubism Web Framework and Live2D Cubism Core.


## License

Please check the [license](LICENSE.md) before using this SDK.


## Notices

Please check the [notices](NOTICE.md) before using this SDK.


## Compatibility with Cubism 5 new features and previous Cubism SDK versions

This SDK is compatible with Cubism 5.  
For SDK compatibility with new features in Cubism 5 Editor, please refer to [here](https://docs.live2d.com/en/cubism-sdk-manual/cubism-5-new-functions/).  
For compatibility with previous versions of Cubism SDK, please refer to [here](https://docs.live2d.com/en/cubism-sdk-manual/compatibility-with-cubism-5/).



## Directory structure

```
.
├─ .vscode          # Project settings directory for Visual Studio Code
├─ Core             # Directory containing Live2D Cubism Core
├─ Framework        # Directory containing source code such as rendering and animation functions
└─ Samples
   ├─ Resources     # Directory containing resources such as model files and images
   └─ TypeScript    # Directory containing TypeScript sample projects
```


## Live2D Cubism Core for Web

A library for loading the model.

This repository does not manage Cubism Core.
Download the Cubism SDK for Web from [here](https://www.live2d.com/download/cubism-sdk/download-web/) and copy the files in the Core directory.


## Development environment construction

1. Install [Node.js] and [Visual Studio Code]
1. Open **the top directory of this SDK** in Visual Studio Code and install the recommended extensions
    * In addition to pop-up notifications, you can check the others by typing `@recommended` from the Extensions tab

### Operation check of sample demo

Enter `>Tasks: Run Task` in the command palette (*View > Command Palette...*) to display the task list.

1. Select `npm: install - Samples/TypeScript/Demo` from the task list to download the dependent packages
1. Select `npm: build - Samples/TypeScript/Demo` from the task list to build the sample demo
1. Select `npm: serve - Samples/TypeScript/Demo` from the task list to start the simple server for operation check
1. Enter `http://localhost:5000` in the URL field of your browser to access it
1. Enter `>Tasks: Terminate Task` from the command palette and select `npm: serve` to terminate the simple server

For other tasks, see [README.md](Samples/TypeScript/README.md) of the sample project.

NOTE: Settings for debugging are described in `.vscode/tasks.json`.

### Project debugging

Open **the top directory of this SDK** in Visual Studio Code and enter the *F5* key to start Debugger for Chrome.

You can place breakpoints in Visual Studio Code to debug in conjunction with the Chrome browser.

NOTE: Settings for debugging are described in `.vscode/launch.json`.


## SDK manual

[Cubism SDK Manual](https://docs.live2d.com/cubism-sdk-manual/top/)


## Changelog

Samples : [CHANGELOG.md](CHANGELOG.md)

Framework : [CHANGELOG.md](Framework/CHANGELOG.md)

Core : [CHANGELOG.md](Core/CHANGELOG.md)


## Development environment

### Node.js

* 23.4.0
* 22.12.0


## Operation environment

| Platform | Browser | Version |
| --- | --- | --- |
| Android | Google Chrome | 133.0.6943.50 |
| Android | Microsoft Edge | 131.0.2903.87 |
| Android | Mozilla Firefox | 133.0.3 |
| iOS / iPadOS | Google Chrome | 131.0.6778.134 |
| iOS / iPadOS | Microsoft Edge | 131.0.2903.92 |
| iOS / iPadOS | Mozilla Firefox | 133.3 |
| iOS / iPadOS | Safari | 18.2 |
| macOS | Google Chrome | 131.0.6778.140 |
| macOS | Microsoft Edge | 131.0.2903.99 |
| macOS | Mozilla Firefox | 133.0.3 |
| macOS | Safari | 18.2 |
| Windows | Google Chrome | 131.0.6778.140 |
| Windows | Microsoft Edge | 133.0.3065.69 |
| Windows | Mozilla Firefox | 133.0.3 |

Note: You can start the server for operation check by running the `serve` script of `./Samples/TypeScript/Demo/package.json`.


## Contributing

There are many ways to contribute to the project: logging bugs, submitting pull requests on this GitHub, and reporting issues and making suggestions in Live2D Community.

### Forking And Pull Requests

We very much appreciate your pull requests, whether they bring fixes, improvements, or even new features. Note, however, that the wrapper is designed to be as lightweight and shallow as possible and should therefore only be subject to bug fixes and memory/performance improvements. To keep the main repository as clean as possible, create a personal fork and feature branches there as needed.

### Bugs

We are regularly checking issue-reports and feature requests at Live2D Community. Before filing a bug report, please do a search in Live2D Community to see if the issue-report or feature request has already been posted. If you find your issue already exists, make relevant comments and add your reaction.

### Suggestions

We're also interested in your feedback for the future of the SDK. You can submit a suggestion or feature request at Live2D Community. To make this process more effective, we're asking that you include more information to help define them more clearly.


## Forum

If you want to suggest or ask questions about how to use the Cubism SDK between users, please use the forum.

- [Live2D Creator's Forum](https://community.live2d.com/)
- [Live2D 公式クリエイターズフォーラム (Japanese)](https://creatorsforum.live2d.com/)
