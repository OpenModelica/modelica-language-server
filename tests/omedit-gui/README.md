# OMEdit GUI compatibility subset

This job builds the language server from the revision under test, then builds
and runs OpenModelica's `LanguageServer` and `LanguageServerNavigation` tests
under Xvfb. It complements the faster [Qt client test](../qt-smoke/README.md).
The GUI case exercises actual Ctrl+click navigation, checks the returned file
and declaration line, and covers fallback with no client and with an empty
definition response followed by a successful request. Only the controlled
empty-response case uses a fixture server; the positive case uses this PR's
standalone language server.

The server repository owns an additional test-only patch,
[`modifier-navigation.patch`](modifier-navigation.patch), applied before the
native build. Its GUI case Ctrl+clicks `Ti` in nested component modifiers:
an instance with `redeclare model C=Other` must open `Other.Ti`, while an
unchanged instance must open `Base.Ti`. It then edits the redeclaration to
`Base` without saving and checks that another click opens `Base.Ti`. Each
click checks the LSP location and the visible editor's file, declaration line
and cursor. This uses the real server and OMEdit editor, without a mock client.

OpenModelica is pinned to the merged commit
`b78606956261d584c311afe7a70e2ba866065e6f` from
[OpenModelica#17007](https://github.com/OpenModelica/OpenModelica/pull/17007).
The workflow initializes compiler dependencies recursively, including nested
dependencies such as `fmi-library`. Update the pin here and in the workflow
together, and check that the test patch still applies. Related:
[issue #90](https://github.com/OpenModelica/modelica-language-server/issues/90).

The workflow runs on server/test/workflow changes in pull requests and main
pushes, and can be dispatched manually. It builds the two test targets, their
compiler, and `SimulationRuntimeRust` (including `OpenModelicaRuntimeC`) because
the `omc` install component requires both runtime libraries. It also builds
`om-manpages` for the generated compiler manual installed by that component.
It does not run the full OpenModelica test suite.
Nevertheless, building OMEdit and its compiler dependencies is expensive. The
job has a 90-minute limit, two build workers and a compiler cache saved even
when the build or tests fail. The individual
navigation test has a 60-second CTest limit, with no retry hiding failures.
This initial job is separate from the release publication dependencies.

See `.github/workflows/omedit-gui.yml` for the dependencies and configure/build
commands. Before building the native test targets, apply the test patch to
that OpenModelica checkout:

```sh
git -C /path/to/OpenModelica apply "$PWD/tests/omedit-gui/modifier-navigation.patch"
```

With those updated test targets built and a compatible compiler install:

```sh
npm --prefix server ci
npm --prefix server run build:standalone
xvfb-run -a bash tests/omedit-gui/run.sh \
  /path/to/OpenModelica/build /path/to/OpenModelica/install \
  "$PWD/server/out/modelica-language-server" /tmp/omedit-gui-results
```

Both test registrations are required. A missing server, WASM file, test or
failed assertion fails the job. The runner also requires a passing result for
the added regression, so an unpatched native binary cannot pass. It uses a
temporary Qt configuration and cache profile, removed on exit. The navigation test also isolates settings
and model files and stops its own server. Results include CTest JUnit XML, registration
metadata, version/revision information, failure screenshots and CTest's log.
No MCP endpoint, credentials or user session is needed.
