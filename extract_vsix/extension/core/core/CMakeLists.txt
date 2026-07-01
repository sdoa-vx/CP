# SDOA Engine Core static library (model + pipeline + runtime + capabilities).
add_library(sdoa_core STATIC
    model/model_parser.cpp
    model/model_validator.cpp
    pipeline/pipeline_parser.cpp
    pipeline/pipeline_validator.cpp
    runtime/registry.cpp
    runtime/scheduler.cpp
    runtime/engine.cpp
    runtime/resolve.cpp
    runtime/merge.cpp
    runtime/schema.cpp
    capabilities/capabilities.cpp
    capabilities/string/string.cpp
    capabilities/math/math.cpp
    capabilities/json/json.cpp
    capabilities/filesystem/filesystem.cpp
    capabilities/system/system.cpp
)

target_include_directories(sdoa_core PUBLIC
    ${CMAKE_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/core
    ${CMAKE_SOURCE_DIR}/third_party
)

find_package(Threads REQUIRED)
target_link_libraries(sdoa_core PUBLIC Threads::Threads)
