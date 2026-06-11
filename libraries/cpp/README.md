# C & C++ Libraries

Top open source C and C++ libraries.

## Build Systems
| Library | Description | Link |
|---------|-------------|------|
| [CMake](https://github.com/Kitware/CMake) | Cross-platform build system | https://cmake.org |
| [Meson](https://github.com/mesonbuild/meson) | Fast build system | https://mesonbuild.com |
| [Bazel](https://github.com/bazelbuild/bazel) | Google's build tool | https://bazel.build |
| [Conan](https://github.com/conan-io/conan) | C/C++ package manager | https://conan.io |
| [vcpkg](https://github.com/microsoft/vcpkg) | MS C++ package manager | https://vcpkg.io |

## General Purpose
| Library | Description | Install |
|---------|-------------|---------|
| [Boost](https://github.com/boostorg/boost) | Comprehensive C++ libraries | `sudo apt install libboost-all-dev` |
| [Abseil](https://github.com/abseil/abseil-cpp) | Google C++ common libraries | vcpkg / conan |
| [folly](https://github.com/facebook/folly) | Facebook open source library | vcpkg / conan |
| [EASTL](https://github.com/electronicarts/EASTL) | EA Standard Template Library | vcpkg |

## Networking
| Library | Description | Install |
|---------|-------------|---------|
| [Asio](https://github.com/chriskohlhoff/asio) | Async I/O (standalone & Boost) | `vcpkg install asio` |
| [libcurl](https://github.com/curl/curl) | URL transfer library | `sudo apt install libcurl4-openssl-dev` |
| [cpp-httplib](https://github.com/yhirose/cpp-httplib) | Header-only HTTP server/client | copy single header |
| [Poco](https://github.com/pocoproject/poco) | Network/app framework | `vcpkg install poco` |
| [grpc](https://github.com/grpc/grpc) | High-perf RPC framework | `vcpkg install grpc` |
| [ZeroMQ (libzmq)](https://github.com/zeromq/libzmq) | Messaging library | `sudo apt install libzmq3-dev` |

## JSON & Serialization
| Library | Description | Install |
|---------|-------------|---------|
| [nlohmann/json](https://github.com/nlohmann/json) | JSON for Modern C++ | `vcpkg install nlohmann-json` |
| [RapidJSON](https://github.com/Tencent/rapidjson) | Fast JSON parser | `vcpkg install rapidjson` |
| [Protobuf](https://github.com/protocolbuffers/protobuf) | Protocol Buffers | `vcpkg install protobuf` |
| [Cap'n Proto](https://github.com/capnproto/capnproto) | Fast serialization | `vcpkg install capnproto` |
| [MessagePack](https://github.com/msgpack/msgpack-c) | Binary serialization | `vcpkg install msgpack` |

## Database
| Library | Description | Install |
|---------|-------------|---------|
| [SQLite](https://github.com/sqlite/sqlite) | Embedded SQL database | `sudo apt install libsqlite3-dev` |
| [LevelDB](https://github.com/google/leveldb) | Key-value store | `vcpkg install leveldb` |
| [RocksDB](https://github.com/facebook/rocksdb) | Persistent key-value store | `vcpkg install rocksdb` |
| [libpqxx](https://github.com/jtv/libpqxx) | PostgreSQL C++ client | `vcpkg install libpqxx` |
| [SQLiteCpp](https://github.com/SRombauts/SQLiteCpp) | SQLite C++ wrapper | `vcpkg install sqlitecpp` |

## Testing
| Library | Description | Install |
|---------|-------------|---------|
| [Google Test](https://github.com/google/googletest) | Testing framework | `vcpkg install gtest` |
| [Catch2](https://github.com/catchorg/Catch2) | Header-only testing | `vcpkg install catch2` |
| [doctest](https://github.com/doctest/doctest) | Fastest test framework | copy single header |
| [Google Benchmark](https://github.com/google/benchmark) | Micro-benchmarking | `vcpkg install benchmark` |

## Graphics & Multimedia
| Library | Description | Install |
|---------|-------------|---------|
| [OpenCV](https://github.com/opencv/opencv) | Computer vision | `sudo apt install libopencv-dev` |
| [SDL2](https://github.com/libsdl-org/SDL) | Media/input layer | `sudo apt install libsdl2-dev` |
| [SFML](https://github.com/SFML/SFML) | Multimedia framework | `vcpkg install sfml` |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | Audio/video processing | `sudo apt install ffmpeg` |
| [Vulkan](https://github.com/KhronosGroup/Vulkan-Hpp) | Graphics API | `sudo apt install libvulkan-dev` |

## Math & Scientific
| Library | Description | Install |
|---------|-------------|---------|
| [Eigen](https://gitlab.com/libeigen/eigen) | Linear algebra | `sudo apt install libeigen3-dev` |
| [BLAS / LAPACK](https://github.com/Reference-LAPACK/lapack) | Numerical linear algebra | `sudo apt install liblapack-dev` |
| [FFTW](https://github.com/FFTW/fftw3) | Fourier transforms | `sudo apt install libfftw3-dev` |
| [GSL](https://savannah.gnu.org/projects/gsl/) | GNU Scientific Library | `sudo apt install libgsl-dev` |

## Security & Crypto
| Library | Description | Install |
|---------|-------------|---------|
| [OpenSSL](https://github.com/openssl/openssl) | SSL/TLS & crypto | `sudo apt install libssl-dev` |
| [libsodium](https://github.com/jedisct1/libsodium) | Modern crypto | `sudo apt install libsodium-dev` |
| [Botan](https://github.com/randombit/botan) | C++ crypto library | `vcpkg install botan` |
