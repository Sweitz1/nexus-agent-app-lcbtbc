package com.nexus.agent;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Hosts the Nexus Agent web UI (assets/index.html) in a WebView and exposes the
 * native bridge ({@link NativeBridge}) as window.NexusNative.
 *
 * Tuned for the RayNeo X3 Pro AR glasses: black (transparent) background, immersive
 * full screen, temple-touchpad key events forwarded to the UI as arrow/enter/back.
 */
public class MainActivity extends Activity {

    static final int REQ_SPEECH = 41;
    static final int REQ_PICK = 43;
    static final int REQ_EXPORT = 44;
    static final int REQ_CAMERA = 45;

    /**
     * The UI is served from a virtual https origin (assets + the file workspace) instead of
     * file://, so it is a secure context: camera (getUserMedia), Web Workers and WebAssembly
     * (pdf.js, Tesseract OCR) all work.
     */
    static final String HOST = "appassets.androidplatform.net";
    static final String ORIGIN = "https://" + HOST;

    WebView webView;
    NativeBridge bridge;
    static volatile boolean visible = false;
    private boolean pageReady = false;
    private final ArrayList<String> pendingEvents = new ArrayList<>();

    private GlassesDisplay.TempleInput temple;

    /** On glasses the temple touchpad is the only touch surface: its strokes become navigation keys. */
    @Override
    public boolean dispatchTouchEvent(android.view.MotionEvent e) {
        if (temple != null && temple.onTouch(e)) return true;
        return super.dispatchTouchEvent(e);
    }

    /** Touch-navigation pads (no pointer) report through generic motion; always treat them as temple strokes. */
    @Override
    public boolean dispatchGenericMotionEvent(android.view.MotionEvent e) {
        if (e.isFromSource(android.view.InputDevice.SOURCE_TOUCH_NAVIGATION) || e.isFromSource(android.view.InputDevice.SOURCE_TOUCHPAD)) {
            if (temple == null) temple = new GlassesDisplay.TempleInput(this);
            if (temple.onTouch(e)) return true;
        }
        return super.dispatchGenericMotionEvent(e);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        goImmersive();

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF000000);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        setContentView(new GlassesDisplay.MirrorFrame(this, webView, GlassesDisplay.mirrorActive(this)));
        if (GlassesDisplay.templeActive(this)) temple = new GlassesDisplay.TempleInput(this);

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(false);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ws.setTextZoom(100);

        bridge = new NativeBridge(this);
        webView.addJavascriptInterface(bridge, "NexusNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) return null;
                return serveLocal(u.getPath(), request.getRequestHeaders());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                // Links clicked inside replies open in the system browser / matching app.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                synchronized (pendingEvents) {
                    for (String js : pendingEvents) webView.evaluateJavascript(js, null);
                    pendingEvents.clear();
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("NexusWeb", m.message() + " @" + m.lineNumber());
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Only the in-app camera is granted, and only after the Android CAMERA
                // permission was given. Microphone goes through native speech recognition.
                runOnUiThread(() -> {
                    // Camera (photos, scanning, video) and microphone (video recording) are granted
                    // only to our own origin and only once the matching Android permission exists.
                    ArrayList<String> grant = new ArrayList<>();
                    boolean ours = HOST.equals(request.getOrigin().getHost());
                    for (String r : request.getResources()) {
                        if (!ours) break;
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && hasPermission(Manifest.permission.CAMERA)) grant.add(r);
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && hasPermission(Manifest.permission.RECORD_AUDIO)) grant.add(r);
                    }
                    if (grant.isEmpty()) request.deny();
                    else request.grant(grant.toArray(new String[0]));
                });
            }
        });

        webView.loadUrl(ORIGIN + "/index.html");
        watchDisplays();
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onResume() { super.onResume(); visible = true; }

    @Override
    protected void onPause() { visible = false; super.onPause(); }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        if (intent.getBooleanExtra("wake", false)) { emit("wake", "{\"phase\":\"tap\"}"); return; }
        try {
            String action = intent.getAction();
            if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> streams = new ArrayList<>();
                if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                    ArrayList<Uri> l = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                    if (l != null) streams.addAll(l);
                } else {
                    Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                    if (u != null) streams.add(u);
                }
                if (!streams.isEmpty()) {
                    final String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                    new Thread(() -> {
                        try {
                            org.json.JSONArray arr = new org.json.JSONArray();
                            for (Uri u : streams) arr.put(bridge.importUri(u));
                            JSONObject o = new JSONObject();
                            o.put("files", arr);
                            if (sharedText != null) o.put("text", sharedText);
                            emit("shared_files", o.toString());
                        } catch (Exception ignored) { }
                    }).start();
                    return;
                }
            }
            if (Intent.ACTION_SEND.equals(action)) {
                String text = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (text != null) {
                    JSONObject o = new JSONObject();
                    o.put("text", text);
                    emit("share", o.toString());
                }
            } else if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
                JSONObject o = new JSONObject();
                o.put("url", intent.getData().toString());
                emit("deeplink", o.toString());
            }
        } catch (Exception ignored) { }
    }

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        String[][] m = {{"html", "text/html"}, {"js", "application/javascript"}, {"mjs", "application/javascript"},
                {"css", "text/css"}, {"json", "application/json"}, {"wasm", "application/wasm"}, {"txt", "text/plain"},
                {"md", "text/markdown"}, {"csv", "text/csv"}, {"xml", "application/xml"}, {"svg", "image/svg+xml"},
                {"png", "image/png"}, {"jpg", "image/jpeg"}, {"jpeg", "image/jpeg"}, {"webp", "image/webp"},
                {"gif", "image/gif"}, {"bmp", "image/bmp"}, {"pdf", "application/pdf"}, {"zip", "application/zip"},
                {"mp4", "video/mp4"}, {"webm", "video/webm"}, {"m4a", "audio/mp4"}, {"mp3", "audio/mpeg"},
                {"wav", "audio/wav"}, {"gz", "application/gzip"}, {"ics", "text/calendar"}, {"eml", "message/rfc822"}, {"m4b", "audio/mp4"}, {"ogg", "audio/ogg"},
                {"opus", "audio/ogg"}, {"aac", "audio/aac"}, {"flac", "audio/flac"}, {"mkv", "video/x-matroska"},
                {"mov", "video/quicktime"}, {"m3u8", "application/vnd.apple.mpegurl"}, {"epub", "application/epub+zip"},
                {"srt", "text/plain"}, {"vtt", "text/vtt"}};
        for (String[] e : m) MIME.put(e[0], e[1]);
    }

    static String mimeFor(String name) {
        int dot = name.lastIndexOf('.');
        String ext = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        String t = MIME.get(ext);
        return t != null ? t : "application/octet-stream";
    }

    WebResourceResponse serveLocalPublic(String path, Map<String, String> headers) { return serveLocal(path, headers); }

    // ---------------------------------------------------------------- external display HUD

    HudPresentation hud;
    private android.hardware.display.DisplayManager.DisplayListener displayListener;

    android.view.Display externalDisplay() {
        android.hardware.display.DisplayManager dm = (android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE);
        android.view.Display[] ds = dm.getDisplays(android.hardware.display.DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        return ds.length > 0 ? ds[0] : null;
    }

    String hudStart() {
        android.view.Display d = externalDisplay();
        if (d == null) return "{\"error\":\"No external display connected (plug in your display glasses via USB-C)\"}";
        final String[] out = {null};
        java.util.concurrent.CountDownLatch l = new java.util.concurrent.CountDownLatch(1);
        runOnUiThread(() -> {
            try {
                if (hud == null || !hud.isShowing() || hud.getDisplay().getDisplayId() != d.getDisplayId()) {
                    if (hud != null) hud.dismiss();
                    hud = new HudPresentation(this, d);
                    hud.setOnDismissListener(x -> { hud = null; emit("display", "{\"hud\":false}"); });
                    hud.show();
                }
                out[0] = hud.info();
            } catch (Exception e) { out[0] = NativeBridge.errorJson(e); }
            l.countDown();
        });
        try { l.await(3, java.util.concurrent.TimeUnit.SECONDS); } catch (InterruptedException ignored) { }
        return out[0] == null ? "{}" : out[0];
    }

    void hudStop() { runOnUiThread(() -> { if (hud != null) { hud.dismiss(); hud = null; } }); }

    void hudPost(String json) { runOnUiThread(() -> { if (hud != null) hud.post(json); }); }

    private void watchDisplays() {
        android.hardware.display.DisplayManager dm = (android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE);
        displayListener = new android.hardware.display.DisplayManager.DisplayListener() {
            @Override public void onDisplayAdded(int id) { emit("display", "{\"connected\":true}"); }
            @Override public void onDisplayRemoved(int id) { if (externalDisplay() == null) { hudStop(); emit("display", "{\"connected\":false}"); } }
            @Override public void onDisplayChanged(int id) { }
        };
        dm.registerDisplayListener(displayListener, null);
    }

    /** Serves /workspace/... from the private file workspace and everything else from assets. */
    private WebResourceResponse serveLocal(String path, Map<String, String> reqHeaders) {
        try {
            if (path == null || path.equals("/")) path = "/index.html";
            InputStream in;
            if (path.startsWith("/workspace/")) {
                File f = bridge.workspace.resolve(Uri.decode(path.substring("/workspace/".length())));
                if (!f.isFile()) return notFound();
                String range = null;
                if (reqHeaders != null) for (Map.Entry<String, String> e : reqHeaders.entrySet())
                    if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
                if (range != null && range.startsWith("bytes=")) return partial(f, range);
                in = new FileInputStream(f);
                WebResourceResponse r = new WebResourceResponse(mimeFor(path), null, in);
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", "no-cache");
                h.put("Accept-Ranges", "bytes");
                h.put("Content-Length", String.valueOf(f.length()));
                r.setResponseHeaders(h);
                return r;
            } else {
                String asset = path.substring(1);
                if (asset.contains("..")) return notFound();
                in = getAssets().open(asset);
            }
            String mime = mimeFor(path);
            String enc = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") ? "utf-8" : null;
            WebResourceResponse r = new WebResourceResponse(mime, enc, in);
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "no-cache");
            h.put("Access-Control-Allow-Origin", ORIGIN);
            r.setResponseHeaders(h);
            return r;
        } catch (Exception e) {
            return notFound();
        }
    }

    /** HTTP Range support so audio/video players can seek in workspace files. */
    private WebResourceResponse partial(File f, String range) throws java.io.IOException {
        long len = f.length();
        String spec = range.substring(6).split(",")[0].trim();
        long start, end;
        if (spec.startsWith("-")) { start = Math.max(0, len - Long.parseLong(spec.substring(1))); end = len - 1; }
        else {
            String[] p = spec.split("-");
            start = Long.parseLong(p[0]);
            end = p.length > 1 && !p[1].isEmpty() ? Math.min(Long.parseLong(p[1]), len - 1) : len - 1;
        }
        if (start >= len || start > end) {
            WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new java.io.ByteArrayInputStream(new byte[0]));
            r.setStatusCodeAndReasonPhrase(416, "Range Not Satisfiable");
            return r;
        }
        final long count = end - start + 1;
        final java.io.RandomAccessFile raf = new java.io.RandomAccessFile(f, "r");
        raf.seek(start);
        InputStream in = new InputStream() {
            long left = count;
            @Override public int read() throws java.io.IOException { if (left <= 0) return -1; left--; return raf.read(); }
            @Override public int read(byte[] b, int off, int l) throws java.io.IOException {
                if (left <= 0) return -1;
                int n = raf.read(b, off, (int) Math.min(l, left));
                if (n > 0) left -= n;
                return n;
            }
            @Override public void close() throws java.io.IOException { raf.close(); }
        };
        WebResourceResponse r = new WebResourceResponse(mimeFor(f.getName()), null, in);
        r.setStatusCodeAndReasonPhrase(206, "Partial Content");
        Map<String, String> h = new HashMap<>();
        h.put("Content-Range", "bytes " + start + "-" + end + "/" + len);
        h.put("Content-Length", String.valueOf(count));
        h.put("Accept-Ranges", "bytes");
        r.setResponseHeaders(h);
        return r;
    }

    /** Window-level display brightness (0..1, or -1 for the system setting). No permission needed. */
    void setWindowBrightness(float v) {
        runOnUiThread(() -> {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.screenBrightness = v < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : Math.max(0.01f, Math.min(1f, v));
            getWindow().setAttributes(lp);
        });
    }

    float getWindowBrightness() { return getWindow().getAttributes().screenBrightness; }

    private static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new java.io.ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    /** Sends an event to the web layer: window.__nexusEvent(type, payloadObject). */
    void emit(String type, String jsonPayload) {
        final String js = "window.__nexusEvent&&window.__nexusEvent(" + JSONObject.quote(type) + "," + jsonPayload + ")";
        runOnUiThread(() -> {
            if (pageReady) {
                webView.evaluateJavascript(js, null);
            } else {
                synchronized (pendingEvents) { pendingEvents.add(js); }
            }
        });
    }

    /** Resolves a pending JS promise: window.__nexusCb(id, ok, payloadObject). */
    void callback(String id, boolean ok, String jsonPayload) {
        final String js = "window.__nexusCb&&window.__nexusCb(" + JSONObject.quote(id) + "," + ok + "," + jsonPayload + ")";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    void setKeepScreenOn(boolean on) {
        runOnUiThread(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    private void goImmersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goImmersive();
    }

    /**
     * RayNeo temple touchpad gestures arrive as D-pad / enter / back key events. The web UI
     * does its own focus handling, so forward the keys as a JS event as well as letting the
     * WebView translate them to ArrowUp/ArrowDown/Enter.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            emit("back", "{}");
            return true;
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            String name = null;
            switch (event.getKeyCode()) {
                case KeyEvent.KEYCODE_VOICE_ASSIST:
                case KeyEvent.KEYCODE_ASSIST:
                case KeyEvent.KEYCODE_SEARCH:
                    name = "voice";
                    break;
                case KeyEvent.KEYCODE_MENU:
                    name = "menu";
                    break;
                default:
                    break;
            }
            if (name != null) {
                emit("hwkey", "{\"key\":" + JSONObject.quote(name) + "}");
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    /** Called from JS when it has no screen left to go back to. */
    void exitApp() {
        runOnUiThread(() -> moveTaskToBack(true));
    }

    boolean hasPermission(String perm) {
        return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    boolean hasMicPermission() { return hasPermission(Manifest.permission.RECORD_AUDIO); }

    private int nextPermCode = 100;
    private final Map<Integer, String> permCallbacks = new HashMap<>();

    /** Requests one runtime permission; resolves the JS callback with {granted}. */
    void requestPermission(String callbackId, String perm) {
        runOnUiThread(() -> {
            if (hasPermission(perm)) { callback(callbackId, true, "{\"granted\":true}"); return; }
            int code = nextPermCode++;
            permCallbacks.put(code, callbackId);
            requestPermissions(new String[]{perm}, code);
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        String id = permCallbacks.remove(requestCode);
        if (id != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            callback(id, true, "{\"granted\":" + granted + "}");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SPEECH) {
            String text = "";
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (r != null && !r.isEmpty()) text = r.get(0);
            }
            bridge.onSpeechActivityResult(text);
        } else if (requestCode == REQ_PICK || requestCode == REQ_EXPORT || requestCode == REQ_CAMERA) {
            bridge.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    protected void onDestroy() {
        if (hud != null) hud.dismiss();
        if (displayListener != null) ((android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE)).unregisterDisplayListener(displayListener);
        if (bridge != null) bridge.shutdown();
        super.onDestroy();
    }
}
