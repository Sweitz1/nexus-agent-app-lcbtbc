// Vela Glasses — 6DoF head pose from the glasses' OpenXR runtime (RayNeo X3 Pro), no Unity.
//
// Starts an OpenXR session only to read the head pose (VIEW space located in LOCAL space) and keeps
// the app's normal Android UI. Two ways, tried in order:
//   1. XR_MND_headless (+ XR_KHR_convert_timespec_time): no graphics, nothing drawn by OpenXR.
//   2. OpenGL ES on a 1x1 offscreen pbuffer, submitting empty frames (only when the app allows it;
//      on some runtimes an active session may take over the display).
// The pose is written to a small lock-free snapshot that Java polls (no JNI calls from this thread).
// Every OpenXR call is checked; any failure ends the session and is reported as a status string.

#include <jni.h>
#include <android/log.h>
#include <EGL/egl.h>
#include <atomic>
#include <cmath>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <time.h>
#include <vector>

#define XR_USE_PLATFORM_ANDROID
#define XR_USE_TIMESPEC
#define XR_USE_GRAPHICS_API_OPENGL_ES
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "NexusXR", __VA_ARGS__)

namespace {

struct Pose { float qx, qy, qz, qw, px, py, pz; int flags; long long tNs; };

std::mutex g_mu;                 // guards g_pose / g_status (short critical sections only)
Pose g_pose{0, 0, 0, 1, 0, 0, 0, 0, 0};
std::string g_status = "stopped";
std::atomic<bool> g_run{false};
std::thread g_thread;
JavaVM* g_vm = nullptr;
jobject g_ctx = nullptr;         // global ref to the application context
bool g_allowGl = false;

void setStatus(const std::string& s) { std::lock_guard<std::mutex> l(g_mu); g_status = s; LOG("%s", s.c_str()); }

#define XR_OK(call, what) do { XrResult r_ = (call); if (XR_FAILED(r_)) { setStatus(std::string("error: ") + (what) + " failed (" + std::to_string((int)r_) + ")"); goto done; } } while (0)

bool hasExt(const std::vector<XrExtensionProperties>& exts, const char* name) {
  for (auto& e : exts) if (std::strcmp(e.extensionName, name) == 0) return true;
  return false;
}

long long nowNs() { timespec ts{}; clock_gettime(CLOCK_MONOTONIC, &ts); return (long long)ts.tv_sec * 1000000000LL + ts.tv_nsec; }

void run() {
  JNIEnv* env = nullptr;
#ifdef __ANDROID__
  g_vm->AttachCurrentThread(&env, nullptr);
#else
  g_vm->AttachCurrentThread(reinterpret_cast<void**>(&env), nullptr);   // desktop jni.h (syntax checks only)
#endif
  XrInstance instance = XR_NULL_HANDLE;
  XrSession session = XR_NULL_HANDLE;
  XrSpace viewSpace = XR_NULL_HANDLE, localSpace = XR_NULL_HANDLE;
  EGLDisplay dpy = EGL_NO_DISPLAY; EGLContext ctx = EGL_NO_CONTEXT; EGLSurface surf = EGL_NO_SURFACE; EGLConfig cfg = nullptr;
  bool headless = false, haveTimeConv = false, sessionRunning = false;
  PFN_xrConvertTimespecTimeToTimeKHR convertTime = nullptr;
  XrSystemId system = XR_NULL_SYSTEM_ID;
  std::vector<XrExtensionProperties> exts;
  std::vector<const char*> enable;

  {
    // --- loader
    PFN_xrInitializeLoaderKHR initLoader = nullptr;
    XR_OK(xrGetInstanceProcAddr(XR_NULL_HANDLE, "xrInitializeLoaderKHR", (PFN_xrVoidFunction*)&initLoader), "loader lookup");
    XrLoaderInitInfoAndroidKHR li{XR_TYPE_LOADER_INIT_INFO_ANDROID_KHR};
    li.applicationVM = g_vm; li.applicationContext = g_ctx;
    XR_OK(initLoader((const XrLoaderInitInfoBaseHeaderKHR*)&li), "loader init (no OpenXR runtime on this device?)");

    uint32_t n = 0;
    XR_OK(xrEnumerateInstanceExtensionProperties(nullptr, 0, &n, nullptr), "list extensions");
    exts.assign(n, XrExtensionProperties{XR_TYPE_EXTENSION_PROPERTIES});
    XR_OK(xrEnumerateInstanceExtensionProperties(nullptr, n, &n, exts.data()), "list extensions");

    if (!hasExt(exts, XR_KHR_ANDROID_CREATE_INSTANCE_EXTENSION_NAME)) { setStatus("error: runtime lacks XR_KHR_android_create_instance"); goto done; }
    enable.push_back(XR_KHR_ANDROID_CREATE_INSTANCE_EXTENSION_NAME);
    haveTimeConv = hasExt(exts, XR_KHR_CONVERT_TIMESPEC_TIME_EXTENSION_NAME);
    headless = hasExt(exts, XR_MND_HEADLESS_EXTENSION_NAME) && haveTimeConv;
    if (headless) { enable.push_back(XR_MND_HEADLESS_EXTENSION_NAME); enable.push_back(XR_KHR_CONVERT_TIMESPEC_TIME_EXTENSION_NAME); }
    else {
      if (!g_allowGl) { setStatus("error: runtime has no headless mode; enable the experimental OpenXR session to try 6DoF"); goto done; }
      if (!hasExt(exts, XR_KHR_OPENGL_ES_ENABLE_EXTENSION_NAME)) { setStatus("error: runtime lacks XR_KHR_opengl_es_enable"); goto done; }
      enable.push_back(XR_KHR_OPENGL_ES_ENABLE_EXTENSION_NAME);
    }

    XrInstanceCreateInfoAndroidKHR ai{XR_TYPE_INSTANCE_CREATE_INFO_ANDROID_KHR};
    ai.applicationVM = g_vm; ai.applicationActivity = g_ctx;
    XrInstanceCreateInfo ci{XR_TYPE_INSTANCE_CREATE_INFO};
    ci.next = &ai;
    std::strncpy(ci.applicationInfo.applicationName, "Vela Glasses", XR_MAX_APPLICATION_NAME_SIZE - 1);
    ci.applicationInfo.applicationVersion = 1;
    std::strncpy(ci.applicationInfo.engineName, "Vela", XR_MAX_ENGINE_NAME_SIZE - 1);
    ci.applicationInfo.apiVersion = XR_API_VERSION_1_0;
    ci.enabledExtensionCount = (uint32_t)enable.size(); ci.enabledExtensionNames = enable.data();
    XR_OK(xrCreateInstance(&ci, &instance), "create instance");
    if (haveTimeConv && headless) XR_OK(xrGetInstanceProcAddr(instance, "xrConvertTimespecTimeToTimeKHR", (PFN_xrVoidFunction*)&convertTime), "time conversion");

    XrSystemGetInfo sg{XR_TYPE_SYSTEM_GET_INFO}; sg.formFactor = XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY;
    XR_OK(xrGetSystem(instance, &sg, &system), "find head-mounted system");

    XrSystemProperties sp{XR_TYPE_SYSTEM_PROPERTIES};
    XR_OK(xrGetSystemProperties(instance, system, &sp), "system properties");
    if (!sp.trackingProperties.positionTracking) setStatus("note: runtime reports no position tracking (rotation only)");

    XrSessionCreateInfo sc{XR_TYPE_SESSION_CREATE_INFO}; sc.systemId = system;
    XrGraphicsBindingOpenGLESAndroidKHR gb{XR_TYPE_GRAPHICS_BINDING_OPENGL_ES_ANDROID_KHR};
    if (!headless) {
      PFN_xrGetOpenGLESGraphicsRequirementsKHR glReq = nullptr;
      XR_OK(xrGetInstanceProcAddr(instance, "xrGetOpenGLESGraphicsRequirementsKHR", (PFN_xrVoidFunction*)&glReq), "GLES requirements lookup");
      XrGraphicsRequirementsOpenGLESKHR req{XR_TYPE_GRAPHICS_REQUIREMENTS_OPENGL_ES_KHR};
      XR_OK(glReq(instance, system, &req), "GLES requirements");
      dpy = eglGetDisplay(EGL_DEFAULT_DISPLAY);
      if (dpy == EGL_NO_DISPLAY || !eglInitialize(dpy, nullptr, nullptr)) { setStatus("error: EGL init failed"); goto done; }
      const EGLint ca[] = {EGL_RENDERABLE_TYPE, 0x0040 /* EGL_OPENGL_ES3_BIT */, EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_NONE};
      EGLint nc = 0;
      if (!eglChooseConfig(dpy, ca, &cfg, 1, &nc) || nc < 1) { setStatus("error: no EGL config"); goto done; }
      const EGLint xa[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
      ctx = eglCreateContext(dpy, cfg, EGL_NO_CONTEXT, xa);
      const EGLint pa[] = {EGL_WIDTH, 1, EGL_HEIGHT, 1, EGL_NONE};
      surf = eglCreatePbufferSurface(dpy, cfg, pa);
      if (ctx == EGL_NO_CONTEXT || surf == EGL_NO_SURFACE || !eglMakeCurrent(dpy, surf, surf, ctx)) { setStatus("error: EGL context failed"); goto done; }
      gb.display = dpy; gb.config = cfg; gb.context = ctx;
      sc.next = &gb;
    }
    XR_OK(xrCreateSession(instance, &sc, &session), "create session");

    XrReferenceSpaceCreateInfo rs{XR_TYPE_REFERENCE_SPACE_CREATE_INFO};
    rs.poseInReferenceSpace.orientation.w = 1.0f;
    rs.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_VIEW;
    XR_OK(xrCreateReferenceSpace(session, &rs, &viewSpace), "view space");
    rs.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_LOCAL;
    XR_OK(xrCreateReferenceSpace(session, &rs, &localSpace), "local space");

    XrEnvironmentBlendMode blend = XR_ENVIRONMENT_BLEND_MODE_ADDITIVE;
    if (!headless) {
      uint32_t bn = 0; xrEnumerateEnvironmentBlendModes(instance, system, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO, 0, &bn, nullptr);
      std::vector<XrEnvironmentBlendMode> modes(bn);
      if (bn) { xrEnumerateEnvironmentBlendModes(instance, system, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO, bn, &bn, modes.data()); blend = modes[0]; }
    }

    setStatus(std::string("starting (") + (headless ? "headless" : "OpenGL ES") + ")");
    long long started = nowNs();
    while (g_run.load()) {
      // events / session state
      XrEventDataBuffer ev{XR_TYPE_EVENT_DATA_BUFFER};
      while (xrPollEvent(instance, &ev) == XR_SUCCESS) {
        if (ev.type == XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED) {
          auto* s = (XrEventDataSessionStateChanged*)&ev;
          if (s->state == XR_SESSION_STATE_READY && !sessionRunning) {
            XrSessionBeginInfo bi{XR_TYPE_SESSION_BEGIN_INFO}; bi.primaryViewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
            XR_OK(xrBeginSession(session, &bi), "begin session"); sessionRunning = true;
            setStatus(std::string("tracking (") + (headless ? "headless" : "OpenGL ES") + ")");
          } else if (s->state == XR_SESSION_STATE_STOPPING && sessionRunning) { xrEndSession(session); sessionRunning = false; setStatus("paused by the runtime"); }
          else if (s->state == XR_SESSION_STATE_EXITING || s->state == XR_SESSION_STATE_LOSS_PENDING) { setStatus("session ended by the runtime"); g_run = false; }
        } else if (ev.type == XR_TYPE_EVENT_DATA_INSTANCE_LOSS_PENDING) { setStatus("runtime is shutting down"); g_run = false; }
        ev = XrEventDataBuffer{XR_TYPE_EVENT_DATA_BUFFER};
      }
      if (!sessionRunning) {
        if (nowNs() - started > 8000000000LL) { setStatus("error: the OpenXR session never became ready"); break; }
        std::this_thread::sleep_for(std::chrono::milliseconds(20)); continue;
      }
      XrTime t = 0; XrFrameState fs{XR_TYPE_FRAME_STATE};
      if (headless) {
        timespec ts{}; clock_gettime(CLOCK_MONOTONIC, &ts);
        if (!convertTime || XR_FAILED(convertTime(instance, &ts, &t))) { setStatus("error: time conversion failed"); break; }
      } else {
        XrFrameWaitInfo wi{XR_TYPE_FRAME_WAIT_INFO};
        XR_OK(xrWaitFrame(session, &wi, &fs), "wait frame");
        XrFrameBeginInfo bfi{XR_TYPE_FRAME_BEGIN_INFO};
        XR_OK(xrBeginFrame(session, &bfi), "begin frame");
        t = fs.predictedDisplayTime;
      }
      XrSpaceLocation loc{XR_TYPE_SPACE_LOCATION};
      if (XR_SUCCEEDED(xrLocateSpace(viewSpace, localSpace, t, &loc))) {
        std::lock_guard<std::mutex> l(g_mu);
        g_pose = {loc.pose.orientation.x, loc.pose.orientation.y, loc.pose.orientation.z, loc.pose.orientation.w,
                  loc.pose.position.x, loc.pose.position.y, loc.pose.position.z, (int)loc.locationFlags, nowNs()};
      }
      if (!headless) {
        XrFrameEndInfo fe{XR_TYPE_FRAME_END_INFO}; fe.displayTime = fs.predictedDisplayTime; fe.environmentBlendMode = blend; fe.layerCount = 0; fe.layers = nullptr;
        XR_OK(xrEndFrame(session, &fe), "end frame");
      } else {
        std::this_thread::sleep_for(std::chrono::milliseconds(16));
      }
    }
  }
done:
  if (sessionRunning) xrEndSession(session);
  if (viewSpace) xrDestroySpace(viewSpace);
  if (localSpace) xrDestroySpace(localSpace);
  if (session) xrDestroySession(session);
  if (instance) xrDestroyInstance(instance);
  if (dpy != EGL_NO_DISPLAY) { eglMakeCurrent(dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT); if (surf != EGL_NO_SURFACE) eglDestroySurface(dpy, surf); if (ctx != EGL_NO_CONTEXT) eglDestroyContext(dpy, ctx); eglTerminate(dpy); }
  { std::lock_guard<std::mutex> l(g_mu); if (g_status.rfind("tracking", 0) == 0 || g_status.rfind("starting", 0) == 0) g_status = "stopped"; }
  g_run = false;
  g_vm->DetachCurrentThread();
}

}  // namespace

extern "C" JNIEXPORT jint JNI_OnLoad(JavaVM* vm, void*) { g_vm = vm; return JNI_VERSION_1_6; }

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nexus_rayneo_HeadTracker_nativeStart(JNIEnv* env, jclass, jobject context, jboolean allowGl) {
  if (g_run.load()) return JNI_TRUE;
  if (g_thread.joinable()) g_thread.join();
  if (g_ctx) env->DeleteGlobalRef(g_ctx);
  g_ctx = env->NewGlobalRef(context);
  g_allowGl = allowGl;
  { std::lock_guard<std::mutex> l(g_mu); g_pose = {0, 0, 0, 1, 0, 0, 0, 0, 0}; g_status = "starting"; }
  g_run = true;
  g_thread = std::thread(run);
  return JNI_TRUE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_nexus_rayneo_HeadTracker_nativeStop(JNIEnv*, jclass) {
  g_run = false;
  if (g_thread.joinable()) g_thread.join();
}

/** {qx, qy, qz, qw, px, py, pz, flags, ageMs} */
extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_nexus_rayneo_HeadTracker_nativePose(JNIEnv* env, jclass) {
  Pose p; { std::lock_guard<std::mutex> l(g_mu); p = g_pose; }
  float v[9] = {p.qx, p.qy, p.qz, p.qw, p.px, p.py, p.pz, (float)p.flags, p.tNs ? (float)((nowNs() - p.tNs) / 1000000.0) : 1e9f};
  jfloatArray a = env->NewFloatArray(9);
  env->SetFloatArrayRegion(a, 0, 9, v);
  return a;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nexus_rayneo_HeadTracker_nativeStatus(JNIEnv* env, jclass) {
  std::string s; { std::lock_guard<std::mutex> l(g_mu); s = g_status; }
  return env->NewStringUTF(s.c_str());
}
