cmake_minimum_required(VERSION 3.21)

project(sdoa-cli LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# CLI executable
add_executable(sdoa
    main.cpp
)

# Link against the core engine + ABI
target_link_libraries(sdoa PRIVATE sdoa_core sdoa_abi)

# Include ABI headers
target_include_directories(sdoa PRIVATE ${CMAKE_SOURCE_DIR}/abi/include)
