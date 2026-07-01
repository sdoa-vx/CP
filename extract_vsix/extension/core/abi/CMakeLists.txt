add_library(sdoa_abi SHARED
    src/sdoa_c_api.cpp
)

target_compile_definitions(sdoa_abi PRIVATE SDOA_ABI_EXPORTS)
target_include_directories(sdoa_abi PUBLIC include)
# ABI glue needs both the C header and the internal C++ core
target_include_directories(sdoa_abi PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(sdoa_abi PRIVATE sdoa_core)
