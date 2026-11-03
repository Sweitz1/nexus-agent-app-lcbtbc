package com.nexus.glasses;

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
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

/**
 * Nexus Glasses: thin client UI (assets/client.html) for AR glasses. Voice, display, camera and
 * gestures live here; the Nexus phone app does the thinking. Served from a secure local origin so
 * the camera and workers are available.
 */
public class ClientActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final int REQ_SPEECH = 51;
    WebView web;
    ClientBridge bridge;
    private boolean ready = false;
    private final ArrayList<String> pending = new ArrayList<>();
    private final Map<Integer, String> permCallbacks = new HashMap<>();
    private int nextPerm = 200;

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
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        immersive();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        setContentView(new GlassesDisplay.MirrorFrame(this, web, GlassesDisplay.mirrorActive(this)));
        if (GlassesDisplay.templeActive(this)) temple = new GlassesDisplay.TempleInput(this);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.requestFocus();
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        bridge = new ClientBridge(this);
        web.addJavascriptInterface(bridge, "NexusClient");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                try {
                    String p = u.getPath() == null || u.getPath().equals("/") ? "client.html" : u.getPath().substring(1);
                    if (p.contains("..")) return null;
                    InputStream in = getAssets().open(p);
                    String mime = p.endsWith(".js") ? "application/javascript" : p.endsWith(".html") ? "text/html" : "application/octet-stream";
                    return new WebResourceResponse(mime, "utf-8", in);
                } catch (Exception e) {
                    return null;
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return !HOST.equals(r.getUrl().getHost()); }
            @Override public void onPageFinished(WebView v, String url) {
                ready = true;
                synchronized (pending) { for (String js : pending) web.evaluateJavascript(js, null); pending.clear(); }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest req) {
                runOnUiThread(() -> {
                    boolean ok = HOST.equals(req.getOrigin().getHost()) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
                    if (ok) req.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}); else req.deny();
                });
            }
        });
        web.loadUrl("https://" + HOST + "/client.html");
    }

    void emit(String type, String json) {
        String js = "window.__ev&&window.__ev(" + JSONObject.quote(type) + "," + json + ")";
        runOnUiThread(() -> { if (ready) web.evaluateJavascript(js, null); else synchronized (pending) { pending.add(js); } });
    }

    void callback(String id, boolean ok, String json) {
        String js = "window.__cb&&window.__cb(" + JSONObject.quote(id) + "," + ok + "," + json + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    boolean hasPermission(String p) { return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }

    void requestPermission(String id, String perm) {
        runOnUiThread(() -> {
            if (hasPermission(perm)) { callback(id, true, "{\"granted\":true}"); return; }
            int code = nextPerm++;
            permCallbacks.put(code, id);
            requestPermissions(new String[]{perm}, code);
        });
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        String id = permCallbacks.remove(code);
        if (id != null) callback(id, true, "{\"granted\":" + (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) + "}");
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_SPEECH) {
            String t = "";
            if (res == RESULT_OK && data != null) {
                ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (r != null && !r.isEmpty()) t = r.get(0);
            }
            bridge.speechDone(true, t);
        }
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }

    /** Touchpad: arrows/enter go to the page; back and assistant/menu keys become events. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_BACK: emit("back", "{}"); return true;
                case KeyEvent.KEYCODE_VOICE_ASSIST: case KeyEvent.KEYCODE_ASSIST: case KeyEvent.KEYCODE_SEARCH: emit("key", "{\"key\":\"voice\"}"); return true;
                case KeyEvent.KEYCODE_CAMERA: emit("key", "{\"key\":\"camera\"}"); return true;
                case KeyEvent.KEYCODE_MENU: emit("key", "{\"key\":\"menu\"}"); return true;
                default: break;
            }
        } else if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) return true;
        return super.dispatchKeyEvent(e);
    }

    void exit() { runOnUiThread(() -> moveTaskToBack(true)); }

    @Override protected void onDestroy() { bridge.shutdown(); super.onDestroy(); }
}
