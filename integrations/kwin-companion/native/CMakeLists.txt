cmake_minimum_required(VERSION 3.21)
project(airi_kwin_companion LANGUAGES CXX)

option(AIRI_BUILD_KWIN_COMPANION "Build the optional experimental KWin transport" OFF)
if(NOT AIRI_BUILD_KWIN_COMPANION)
  message(STATUS "AIRI KWin companion remains disabled")
  return()
endif()

if(NOT CMAKE_SYSTEM_NAME STREQUAL "Linux")
  message(FATAL_ERROR "The experimental KWin helper currently targets Linux only")
endif()
find_package(Qt6 6.4 REQUIRED COMPONENTS Core DBus)
add_executable(airi-kwin-companion helper.cpp)
target_compile_features(airi-kwin-companion PRIVATE cxx_std_20)
target_link_libraries(airi-kwin-companion PRIVATE Qt6::Core Qt6::DBus)
target_compile_options(airi-kwin-companion PRIVATE -Wall -Wextra -Wpedantic)

include(CTest)
if(BUILD_TESTING)
  add_executable(airi-kwin-protocol-test ../tests/native-protocol.cpp)
  target_compile_features(airi-kwin-protocol-test PRIVATE cxx_std_20)
  target_link_libraries(airi-kwin-protocol-test PRIVATE Qt6::Core)
  add_test(NAME native-protocol COMMAND airi-kwin-protocol-test)
  find_program(NODE_EXECUTABLE node)
  if(NODE_EXECUTABLE)
    add_test(NAME native-parent-stdio COMMAND ${NODE_EXECUTABLE}
      ${CMAKE_CURRENT_SOURCE_DIR}/../tests/native-stdio.ts $<TARGET_FILE:airi-kwin-protocol-test>)
  endif()
  find_package(Python3 COMPONENTS Interpreter REQUIRED)
  find_program(DBUS_RUN_SESSION dbus-run-session REQUIRED)
  add_executable(airi-kwin-test-peer ../tests/native-peer.cpp)
  target_compile_features(airi-kwin-test-peer PRIVATE cxx_std_20)
  target_link_libraries(airi-kwin-test-peer PRIVATE Qt6::Core Qt6::DBus)
  add_test(NAME private-bus-transport
    COMMAND ${DBUS_RUN_SESSION} -- ${Python3_EXECUTABLE}
      ${CMAKE_CURRENT_SOURCE_DIR}/../tests/native-transport.py
      $<TARGET_FILE:airi-kwin-companion> $<TARGET_FILE:airi-kwin-test-peer>)
  set_tests_properties(private-bus-transport PROPERTIES TIMEOUT 60)
endif()

# Packaging is explicit. This target does not install or enable a KWin script.
install(TARGETS airi-kwin-companion RUNTIME DESTINATION libexec/airi OPTIONAL)
