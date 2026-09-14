cmake_minimum_required(VERSION 3.20)
project(libraries_cpp VERSION 1.0.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ── vcpkg toolchain (set VCPKG_ROOT env var or pass via cmake -DCMAKE_TOOLCHAIN_FILE) ──
if(DEFINED ENV{VCPKG_ROOT} AND NOT DEFINED CMAKE_TOOLCHAIN_FILE)
    set(CMAKE_TOOLCHAIN_FILE "$ENV{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake" CACHE STRING "")
endif()

# ── Find packages ────────────────────────────────────────────────
find_package(nlohmann_json CONFIG REQUIRED)
find_package(GTest CONFIG REQUIRED)
find_package(Catch2 CONFIG REQUIRED)
find_package(benchmark CONFIG REQUIRED)
find_package(Boost REQUIRED COMPONENTS system filesystem)
find_package(OpenCV REQUIRED)
find_package(Eigen3 REQUIRED)
find_package(CURL REQUIRED)
find_package(protobuf CONFIG REQUIRED)
find_package(gRPC CONFIG REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(SQLite3 REQUIRED)

# ── Example executable ───────────────────────────────────────────
add_executable(main src/main.cpp)

target_link_libraries(main PRIVATE
    nlohmann_json::nlohmann_json
    Boost::system
    Boost::filesystem
    OpenCV::OpenCV
    Eigen3::Eigen
    CURL::libcurl
    OpenSSL::SSL
    OpenSSL::Crypto
    SQLite::SQLite3
    protobuf::libprotobuf
    gRPC::grpc++
)

# ── Tests ────────────────────────────────────────────────────────
enable_testing()

add_executable(tests tests/main_test.cpp)
target_link_libraries(tests PRIVATE GTest::gtest_main)
add_test(NAME all_tests COMMAND tests)
