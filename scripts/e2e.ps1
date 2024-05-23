$env:CODE_TESTS_PATH = "$(Get-Location)\client\out\test"
$env:CODE_TESTS_WORKSPACE = "$(Get-Location)\client\testFixture"

node "$(Get-Location)\client\out\test\runTest"
