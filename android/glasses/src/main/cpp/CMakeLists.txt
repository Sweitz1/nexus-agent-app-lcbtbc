cmake_minimum_required(VERSION 3.22.1)
project(nexus_xr CXX)
# OpenXR loader from Maven (org.khronos.openxr:openxr_loader_for_android, prefab); the runtime itself
# is provided by the glasses' OS (RayNeo). Devices without a runtime simply report "no runtime".
find_package(OpenXR REQUIRED CONFIG)
add_library(nexus_xr SHARED nexus_xr.cpp)
target_compile_features(nexus_xr PRIVATE cxx_std_17)
target_link_libraries(nexus_xr OpenXR::headers OpenXR::openxr_loader EGL log android)
