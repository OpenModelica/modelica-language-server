# Changelog

## 0.3.6

- Add document and range formatting, with optional formatting of embedded HTML/XML documentation.
- Add opt-in syntax diagnostics, completion and document highlights. These features are off by default and can be enabled without restarting the server.
- Add semantic highlighting for locally resolved classes/types and matching `end` names. Colors follow the editor theme.
- Add MSL grammar sanity checks and an OMEdit Qt client compatibility job covering initialization, hover, cross-file definitions and unsaved edits. Release publication requires these checks to pass.
- Strip Linux standalone binaries to reduce their size.
- Refresh installation and client configuration documentation, and exclude test/build leftovers from published packages.

These features use tree-sitter and local symbol resolution; they do not provide compiler-level type checking or complete inherited/imported symbol resolution. See the README for each feature's scope and settings.
