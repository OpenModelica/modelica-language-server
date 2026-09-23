# Modelica Language Server

[![Build][badge-build]][workflow-test]
[![Coverage Status][badge-coverage]][coverage-project]

A very early version of a Modelica Language Server based on
[OpenModelica/tree-sitter-modelica][tree-sitter-modelica].

For syntax highlighting install enxtension
[AnHeuermann.metamodelica][ext-metamodelica]
in addition.

## Functionality

This Language Server works for Modelica files. It has the following language
features:

- Provide Outline of Modelica files.

  ![Outline](images/outline_demo.png)

- Goto declarations.

  ![Goto Declaration](images/goto_declaration_demo.png)

- Hover provider for declared symbols.

  ![Hover](images/hover_demo.png)

- Format Document and Format Selection, using two-space Modelica indentation by
  default. Editor indentation options override this default. Formatting adjusts
  whitespace, spaces around operators and after commas, and wraps long argument
  lists at a target width of 100 columns (a soft limit). Section headings align
  with their class headers, as in the Modelica Standard Library.

  Selection formatting covers the selected lines and uses the surrounding code
  to determine indentation. Strings (including XML/HTML documentation) are preserved
  by default. Comments and declaration order are preserved. Inputs and outputs are not reordered,
  since that can change positional function calls. Files rejected by the bundled
  Modelica grammar are left untouched. Other LSP clients can supply `printWidth`
  as an additional formatting option.

  With `modelica.formatting.formatDocumentation` off (the default), embedded
  XML/HTML is preserved exactly, including whitespace, escaped quotes and line
  endings. Only the surrounding Modelica annotation syntax is formatted.

  To opt in to documentation formatting, add this to your VS Code settings:

  ```json
  {
    "modelica.formatting.formatDocumentation": true
  }
  ```

  The setting applies to Format Document and Format Selection without restarting
  the server. Complete literal `Documentation(info="...", revisions="...")`
  values are delegated to the HTML language service for `<html>` documents
  (including an optional HTML doctype), or an XML formatter for other XML markup.
  Ordinary strings, concatenated documentation and partially selected string
  literals are left unchanged. XML that cannot be parsed is preserved. This is
  formatting, not syntax checking; diagnostics are tracked in [#87][html-diagnostics]
  and [#88][xml-diagnostics].

  Other LSP clients can set `initializationOptions.formatting.formatDocumentation`,
  send `settings.modelica.formatting.formatDocumentation` in a configuration
  change, or pass `formatDocumentation` in a formatting request's `options`.
  An explicit per-request boolean overrides the server setting, so a client can
  disable markup formatting for an individual request even when it is enabled.

  ![VS Code demonstration: open the Command Palette, choose Format Document, and see two-space Modelica indentation](images/formatting_demo.gif)

  To try it in VS Code:

  1. If the window is in Restricted Mode, open **Manage Workspace Trust** and
     trust the folder if you trust its contents.
  2. Open a `.mo` file and check that its language mode is **Modelica**.
  3. Press **F1**, type **Format Document**, and press **Enter**. If prompted,
     choose **Modelica Language Server** as the formatter.
  4. To format only part of a file, select the lines and run **Format Selection**.

  [View or download the formatting GIF](images/formatting_demo.gif).

[html-diagnostics]: https://github.com/OpenModelica/modelica-language-server/issues/87
[xml-diagnostics]: https://github.com/OpenModelica/modelica-language-server/issues/88

## Configuration

### Loading external Modelica libraries

To make the language server aware of libraries outside your workspace (such as
the Modelica Standard Library), add their root directories to
`modelica.libraries` in your VS Code settings.

**Workspace settings** (`.vscode/settings.json`):

```json
{
  "modelica.libraries": [
    "/path/to/Modelica 4.0.0+maint.om"
  ]
}
```

**User settings** (via *File → Preferences → Settings*, search for
`modelica.libraries`): click *Add Item* and enter the path to each library
root directory — the folder that contains a `package.mo` file.

Typical paths:

| Platform | Default OpenModelica library location    |
|----------|------------------------------------------|
| Linux    | `~/.openmodelica/libraries/`             |
| Windows  | `%APPDATA%\OpenModelica\libraries\`      |
| macOS    | `~/.openmodelica/libraries/`             |

The server loads all configured libraries at startup, and also picks up
libraries added later without a restart: adding a workspace folder, or
pushing an updated `modelica.libraries` list via
`workspace/didChangeConfiguration`, loads the new library into the running
session. Removing a workspace folder does not unload its library yet; a
restart is still required for that.

## Installation

### Via Marketplace

- [Visual Studio Marketplace][marketplace]
- [Open VSX Registry][open-vsx]

### Via VSIX File

Download the latest
[modelica-language-server-0.2.2.vsix][vsix-download]
from the
[releases][releases]
page.

Check the [VS Code documentation][vscode-install-vsix]
on how to install a .vsix file.
Use the `Install from VSIX` command or run

```bash
code --install-extension modelica-language-server-0.2.2.vsix
```

## Contributing ❤️

Contributions are very welcome!

We made the first tiny step but need help to add more features and refine the
language server.

If you are searching for a good point to start
check the
[good first issue][good-first-issue].
To see where the development is heading to check the
[Projects section][projects].
If you need more information start a discussion over at
[OpenModelica/OpenModelica][openmodelica].

Found a bug or having issues? Open a
[new issue][new-issue].

## Structure

```txt
.
├── client // Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Modelica Language Server
    └── src
        └── server.ts // Language Server entry point
```

## Building the Language Server

- Run `npm install` and `npm run postinstall` in this folder.This installs all
  necessary npm modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to start compiling the client and server in [watch
  mode][vscode-watch-mode].
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client` from the drop down (if it is not already).
- Press ▷ to run the launch config (F5).
- In the [Extension Development Host][ext-dev-host]
  instance of VSCode, open a document in 'modelica' language mode.
  - Check the console output of `Language Server Modelica` to see the parsed
    tree of the opened file.

## Build and Install Extension

```bash
npx vsce package
```

## License

modelica-language-server is licensed under the OSMC Public License v1.8, see
[OSMC-License.txt](./OSMC-License.txt).

### 3rd Party Licenses

This extension is based on
[https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample][lsp-sample],
licensed under MIT license.

Some parts of the source code are taken from
[bash-lsp/bash-language-server][bash-language-server],
licensed under the MIT license and adapted to the Modelica language server.

[OpenModelica/tree-sitter-modelica][tree-sitter-modelica]
v0.2.0 is included in this extension and is licensed under the [OSMC-PL
v1.8](./server/OSMC-License.txt).

## Acknowledgments

This package was initially developed by
[Hochschule Bielefeld - University of Applied Sciences and Arts](hsbi.de).

[badge-build]: https://github.com/OpenModelica/modelica-language-server/actions/workflows/test.yml/badge.svg
[badge-coverage]: https://coveralls.io/repos/github/OpenModelica/modelica-language-server/badge.svg?branch=main
[bash-language-server]: https://github.com/bash-lsp/bash-language-server
[coverage-project]: https://coveralls.io/github/OpenModelica/modelica-language-server?branch=main
[ext-dev-host]: https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.
[ext-metamodelica]: https://marketplace.visualstudio.com/items?itemName=AnHeuermann.metamodelica
[good-first-issue]: https://github.com/OpenModelica/modelica-language-server/labels/good%20first%20issue
[lsp-sample]: https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample
[marketplace]: https://marketplace.visualstudio.com/items?itemName=OpenModelica.modelica-language-server
[new-issue]: https://github.com/OpenModelica/modelica-language-server/issues/new/choose
[open-vsx]: https://open-vsx.org/extension/OpenModelica/modelica-language-server
[openmodelica]: https://github.com/OpenModelica/OpenModelica
[projects]: https://github.com/OpenModelica/modelica-language-server/projects?query=is%3Aopen
[releases]: https://github.com/OpenModelica/modelica-language-server/releases
[tree-sitter-modelica]: https://github.com/OpenModelica/tree-sitter-modelica
[vscode-install-vsix]: https://code.visualstudio.com/docs/editor/extension-marketplace#_install-from-a-vsix
[vscode-watch-mode]: https://code.visualstudio.com/docs/editor/tasks#:~:text=The%20first%20entry%20executes,the%20HelloWorld.js%20file.
[vsix-download]: https://github.com/OpenModelica/modelica-language-server/releases/download/v0.2.2/modelica-language-server-0.2.2.vsix
[workflow-test]: https://github.com/OpenModelica/modelica-language-server/actions/workflows/test.yml
