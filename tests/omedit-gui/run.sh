#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 4 ]]; then
  echo "Usage: $0 OPENMODELICA_BUILD OPENMODELICA_INSTALL SERVER_EXECUTABLE RESULTS_DIR" >&2
  exit 2
fi
build_dir=$(realpath "$1")
install_dir=$(realpath "$2")
server_executable=$(realpath "$3")
mkdir -p "$4"
results_dir=$(realpath "$4")
[[ -x "$server_executable" ]]
[[ -f "$(dirname "$server_executable")/tree-sitter-modelica.wasm" ]]
[[ -f "$(dirname "$server_executable")/web-tree-sitter.wasm" ]]
[[ -x "$install_dir/bin/omc" ]]

# Do not let a missing CMake registration turn this job green.
ctest --test-dir "$build_dir/OMEdit/Testsuite" --show-only=json-v1 \
  -R '^LanguageServer(Navigation)?$' > "$results_dir/registered-tests.json"
python3 - "$results_dir/registered-tests.json" <<'PY'
import json
import sys
with open(sys.argv[1]) as stream:
    actual = {test['name'] for test in json.load(stream)['tests']}
expected = {'LanguageServer', 'LanguageServerNavigation'}
if actual != expected:
    raise SystemExit(f'Expected {expected}, found {actual}')
PY

export OPENMODELICAHOME="$install_dir"
export OMEDIT_TEST_LSP_EXECUTABLE="$server_executable"
# QDir::temp() puts failure screenshots in the uploaded results directory.
export TMPDIR="$results_dir"
"$server_executable" --version > "$results_dir/server-version.txt"
ctest --test-dir "$build_dir/OMEdit/Testsuite" \
  -R '^LanguageServer(Navigation)?$' --no-tests=error --output-on-failure \
  --output-junit "$results_dir/omedit-lsp.xml"
