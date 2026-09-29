# OMEdit GUI compatibility subset

This job builds the language server from the revision under test, then builds
and runs OpenModelica's `LanguageServer` and `LanguageServerNavigation` tests
under Xvfb. It complements the faster [Qt client test](../qt-smoke/README.md).
The GUI case exercises actual Ctrl+click navigation, checks the returned file
and declaration line, and covers fallback with no client and with an empty
definition response followed by a successful request. Only the controlled
empty-response case uses a fixture server; the positive case uses this PR's
standalone language server.

OpenModelica is pinned to `f233ede45e870c992351ca7ae8aebf71d113532d` from
[OpenModelica#17007](https://github.com/OpenModelica/OpenModelica/pull/17007).
Merge that PR first and update the pin here and in the workflow if the final
commit changes. Related: [issue #90](https://github.com/OpenModelica/modelica-language-server/issues/90).

The workflow runs on server/test/workflow changes in pull requests and main
pushes, and can be dispatched manually. It builds only the two test targets and
the compiler they need; it does not run the full OpenModelica test suite.
Nevertheless, building OMEdit and its compiler dependencies is expensive. The
job has a 90-minute limit, two build workers and a compiler cache. The individual
navigation test has a 60-second CTest limit, with no retry hiding failures.
This initial job is separate from the release publication dependencies.

See `.github/workflows/omedit-gui.yml` for the dependencies and configure/build
commands. With an existing compatible OpenModelica build and compiler install:

```sh
npm --prefix server ci
npm --prefix server run build:standalone
xvfb-run -a bash tests/omedit-gui/run.sh \
  /path/to/OpenModelica/build /path/to/OpenModelica/install \
  "$PWD/server/out/modelica-language-server" /tmp/omedit-gui-results
```

Both test registrations are required. A missing server, WASM file, test or
failed assertion fails the job. The navigation test isolates settings and model
files and stops its own server. Results include CTest JUnit XML, registration
metadata, version/revision information, failure screenshots and CTest's log.
No MCP endpoint, credentials or user session is needed.
