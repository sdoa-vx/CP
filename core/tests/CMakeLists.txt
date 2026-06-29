# Engine + contract + execution tests.
add_executable(test_core test_core.cpp)
target_link_libraries(test_core PRIVATE sdoa_core)

# Phase 4.1 capability standard-library tests.
add_executable(test_stdlib test_stdlib.cpp)
target_link_libraries(test_stdlib PRIVATE sdoa_core)

add_executable(test_phase5x test_phase5x.cpp)
target_link_libraries(test_phase5x PRIVATE sdoa_core)

enable_testing()
add_test(NAME core    COMMAND test_core)
add_test(NAME stdlib  COMMAND test_stdlib)
add_test(NAME phase5x COMMAND test_phase5x)
