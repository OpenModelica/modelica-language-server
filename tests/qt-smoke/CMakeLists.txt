cmake_minimum_required(VERSION 3.16)
project(ModelicaQtSmoke LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
find_package(Qt6 REQUIRED COMPONENTS Core Widgets Test)

set(OPENMODELICA_SOURCE "" CACHE PATH "OpenModelica source checkout (see README for pinned revision)")
set(MODELICA_LSP_EXECUTABLE "" CACHE FILEPATH "Standalone server built from the revision under test")
if(NOT EXISTS "${OPENMODELICA_SOURCE}/OMEdit/OMEditLIB/LSP/ModelicaLSPClient.cpp")
  message(FATAL_ERROR "Set OPENMODELICA_SOURCE to an OpenModelica checkout")
endif()
if(NOT EXISTS "${MODELICA_LSP_EXECUTABLE}")
  message(FATAL_ERROR "Build the standalone server and set MODELICA_LSP_EXECUTABLE")
endif()
get_filename_component(MODELICA_LSP_EXECUTABLE "${MODELICA_LSP_EXECUTABLE}" ABSOLUTE)
set(OMEDIT_LIB "${OPENMODELICA_SOURCE}/OMEdit/OMEditLIB")
add_executable(ModelicaQtSmoke
  SmokeTest.cpp
  "${OMEDIT_LIB}/LSP/LSPClient.cpp"
  "${OMEDIT_LIB}/LSP/LSPClient.h"
  "${OMEDIT_LIB}/LSP/ModelicaLSPClient.cpp"
  "${OMEDIT_LIB}/LSP/ModelicaLSPClient.h"
  "${OMEDIT_LIB}/LSP/LSPFileWatcher.cpp"
  "${OMEDIT_LIB}/LSP/LSPFileWatcher.h")
target_include_directories(ModelicaQtSmoke PRIVATE "${OMEDIT_LIB}")
# Widgets is needed by OMEdit's Utilities.h; this test uses QCoreApplication,
# so it requires neither a display nor an OMEdit/OMC installation.
target_link_libraries(ModelicaQtSmoke PRIVATE Qt6::Core Qt6::Widgets Qt6::Test)
enable_testing()
add_test(NAME ModelicaQtSmoke COMMAND ModelicaQtSmoke
  -o -,txt -o "${CMAKE_CURRENT_BINARY_DIR}/qt-smoke.xml,junitxml")
set_tests_properties(ModelicaQtSmoke PROPERTIES
  TIMEOUT 60
  ENVIRONMENT "MODELICA_LSP_EXECUTABLE=${MODELICA_LSP_EXECUTABLE};QTEST_FUNCTION_TIMEOUT=45000")
