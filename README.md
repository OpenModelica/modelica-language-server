# VS Code Modelica Language Server

Heavily documented sample code for https://code.visualstudio.com/api/language-extensions/language-server-extension-guide

## Functionality

This Language Server works for Modelica files. It has the following language features:
  - None

It also includes an End-to-End test.

## Structure

```
.
├── client // Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Language Server
    └── src
        └── server.ts // Language Server entry point
```

## Running the Language Server

  - Run `npm install` in this folder. This installs all necessary npm modules in both the
    client and server folder
  - Open VS Code on this folder.
  - Press Ctrl+Shift+B to start compiling the client and server in
    [watch mode](https://code.visualstudio.com/docs/editor/tasks#:~:text=The%20first%20entry%20executes,the%20HelloWorld.js%20file.).
  - Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
  - Select `Launch Client` from the drop down (if it is not already).
  - Press ▷ to run the launch config (F5).
  - In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.)
    instance of VSCode, open a document in 'modelica' language mode.
    - Check the console output of `Language Server Modelica` to see the parsed tree of the opened file.

## Build and Install Extension

```
npx vsce package
```

## License

See [License.md](./LICENSE.md).
