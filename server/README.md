# @openmodelica/modelica-language-server

[![Build][badge-build]][workflow-test]
[![npm][badge-npm]][npm-package]

A [Language Server Protocol (LSP)][lsp] server for the [Modelica][modelica] modeling language,
based on [OpenModelica/tree-sitter-modelica][tree-sitter-modelica].

This package is the standalone LSP server. It communicates over stdio and works with any LSP-compatible editor. The [VS Code extension][vscode-ext] uses this server under the hood.

## Features

| Capability                | Status  |
|---------------------------|---------|
| Document outline          | ✓       |
| Go to declaration         | ✓       |
| Go to definition          | ✓       |
| Incremental document sync | ✓       |
| Hover                     | ✓       |
| Completion                | planned |

## Installation

### Global (CLI)

```bash
npm install -g @openmodelica/modelica-language-server
```

### As a dependency (editor extension authors)

```bash
npm install @openmodelica/modelica-language-server
```

The bundled server is at `require.resolve('@openmodelica/modelica-language-server')`.

## Usage

The server communicates over stdio. Start it with:

```bash
modelica-language-server --stdio
```

Other transports supported by the underlying [`vscode-languageserver`][vscode-languageserver] are also available:

| Flag              | Transport           |
|-------------------|---------------------|
| `--stdio`         | stdin / stdout      |
| `--socket=<port>` | TCP socket          |
| `--pipe=<name>`   | Named pipe          |
| `--node-ipc`      | Node.js IPC channel |

### Example: Zed extension

In your Zed extension's `language_server` configuration, point the binary at the globally installed server:

```json
{
  "language_servers": ["modelica-language-server"],
  "modelica-language-server": {
    "binary": {
      "path": "modelica-language-server",
      "arguments": ["--stdio"]
    }
  }
}
```

## Building from source

```bash
git clone https://github.com/OpenModelica/modelica-language-server
cd modelica-language-server/server
npm install
npm run build
```

Output is placed in `out/`:

```txt
out/
├── server.js                   # bundled server
├── tree-sitter-modelica.wasm   # Modelica grammar
└── tree-sitter.wasm            # tree-sitter runtime
```

Run directly after building:

```bash
node out/server.js --stdio
```

## License

Licensed under the OSMC Public License v1.8 (OSMC-PL-1-8), which gives recipients the
choice of using this software under either:

- **GNU Affero General Public License v3.0** (AGPL-3.0) — see [LICENSE](./LICENSE), or
- **OSMC-PL v1.8** conditions — see [OSMC-License.txt][osmc-license]

See [OSMC-License.txt][osmc-license] for full terms.

### Third-party licenses

Parts of the source are adapted from [bash-lsp/bash-language-server][bash-language-server]
(MIT license).

The bundled `tree-sitter-modelica.wasm` grammar is from
[OpenModelica/tree-sitter-modelica][tree-sitter-modelica] (OSMC-PL v1.8).

[badge-build]: https://github.com/OpenModelica/modelica-language-server/actions/workflows/test.yml/badge.svg
[badge-npm]: https://img.shields.io/npm/v/@openmodelica/modelica-language-server
[bash-language-server]: https://github.com/bash-lsp/bash-language-server
[lsp]: https://microsoft.github.io/language-server-protocol/
[modelica]: https://modelica.org/
[npm-package]: https://www.npmjs.com/package/@openmodelica/modelica-language-server
[osmc-license]: https://github.com/OpenModelica/modelica-language-server/blob/main/OSMC-License.txt
[tree-sitter-modelica]: https://github.com/OpenModelica/tree-sitter-modelica
[vscode-ext]: https://marketplace.visualstudio.com/items?itemName=OpenModelica.modelica-language-server
[vscode-languageserver]: https://github.com/microsoft/vscode-languageserver-node
[workflow-test]: https://github.com/OpenModelica/modelica-language-server/actions/workflows/test.yml
