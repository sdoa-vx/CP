cmake_minimum_required(VERSION 3.20)
project(sdoa_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_subdirectory(core)
add_subdirectory(abi)
add_subdirectory(cli)
add_subdirectory(tests)
