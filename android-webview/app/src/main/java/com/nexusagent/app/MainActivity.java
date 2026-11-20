package com.nexusagent.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_FILE = 1001;
    private static final int REQ_VOICE = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private GlassesTools glasses;
    HudPresentation hud;
    private android.hardware.display.DisplayManager.DisplayListener displayListener;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setAllowFileAccessFromFileURLs(true);
        ws.setAllowUniversalAccessFromFileURLs(true);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        // Lets the page tell RayNeo/TCL glasses apart from phones.
        ws.setUserAgentString(ws.getUserAgentString() + " NexusAgent (" + Build.MANUFACTURER + "; " + Build.MODEL + ")");

        tts = new TextToSpeech(this, status -> ttsReady = (status == TextToSpeech.SUCCESS));
        glasses = new GlassesTools(this);
        watchDisplays();

        webView.addJavascriptInterface(new NativeBridge(), "NexusNative");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            // Makes <input type="file"> work (character card import).
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        webView.loadUrl("file:///android_asset/index.html");
    }

    /** Methods callable from the page as window.NexusNative.*. */
    private class NativeBridge {
        @JavascriptInterface
        public String deviceInfo() {
            try {
                DisplayMetrics dm = getResources().getDisplayMetrics();
                JSONObject o = new JSONObject();
                o.put("manufacturer", Build.MANUFACTURER);
                o.put("brand", Build.BRAND);
                o.put("model", Build.MODEL);
                o.put("device", Build.DEVICE);
                o.put("android", Build.VERSION.RELEASE);
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("widthPx", dm.widthPixels);
                o.put("heightPx", dm.heightPixels);
                o.put("density", dm.density);
                o.put("tts", ttsReady);
                o.put("voiceInput", getPackageManager().queryIntentActivities(
                        new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH), 0).size() > 0);
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public boolean speak(String text) {
            if (!ttsReady || text == null) return false;
            tts.setLanguage(Locale.getDefault());
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "nexus");
            return true;
        }

        @JavascriptInterface
        public void stopSpeaking() {
            if (tts != null) tts.stop();
        }

        @JavascriptInterface
        public boolean startVoice() {
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak now");
            if (getPackageManager().queryIntentActivities(i, 0).isEmpty()) return false;
            runOnUiThread(() -> startActivityForResult(i, REQ_VOICE));
            return true;
        }

        @JavascriptInterface
        public void keepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        // ── Glasses / device tools (ported from the prod app) ──
        @JavascriptInterface
        public String deviceStatus() { try { return glasses.status(); } catch (Exception e) { return errorJson(e); } }

        @JavascriptInterface
        public String setVolume(int percent) { return glasses.setVolume(percent); }

        @JavascriptInterface
        public String mediaKey(String action) { return glasses.mediaKey(action == null ? "" : action); }

        /** 0..1 for this app's window, or -1 to follow the system setting. */
        @JavascriptInterface
        public String setBrightness(float v) { setWindowBrightness(v); return v < 0 ? "brightness: system" : "brightness " + Math.round(v * 100) + "%"; }

        @JavascriptInterface
        public String openSettings(String panel) { return glasses.openSettings(panel); }

        @JavascriptInterface
        public void headPose(String id) { runOnUiThread(() -> glasses.headPose((ok, j) -> callback(id, ok, j))); }

        @JavascriptInterface
        public void headGesture(String id, int timeoutMs) { runOnUiThread(() -> glasses.headGesture(timeoutMs, (ok, j) -> callback(id, ok, j))); }

        @JavascriptInterface
        public boolean notificationAccess() {
            String flat = android.provider.Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
            return flat != null && flat.contains(getPackageName());
        }

        @JavascriptInterface
        public String notificationsList(int limit) { return NexusNotificationListener.list(Math.max(1, Math.min(limit, 150))); }

        @JavascriptInterface
        public boolean notificationDismiss(String key) { return NexusNotificationListener.dismiss(key); }

        // ── HUD on external USB-C display glasses ──
        @JavascriptInterface
        public String hudInfo() {
            android.view.Display d = externalDisplay();
            if (d == null) return "{\"connected\":false}";
            DisplayMetrics m = new DisplayMetrics();
            d.getRealMetrics(m);
            return "{\"connected\":true,\"name\":" + JSONObject.quote(d.getName()) + ",\"width\":" + m.widthPixels + ",\"height\":" + m.heightPixels
                    + ",\"refreshHz\":" + Math.round(d.getRefreshRate()) + ",\"hud\":" + (hud != null) + "}";
        }

        @JavascriptInterface
        public String hudStart() { return MainActivity.this.hudStart(); }

        @JavascriptInterface
        public void hudStop() { MainActivity.this.hudStop(); }

        @JavascriptInterface
        public void hudPost(String json) { runOnUiThread(() -> { if (hud != null) hud.post(json); }); }

        /** Saves a file to Downloads (Android 10+) or the app's own Downloads folder. Returns where. */
        @JavascriptInterface
        public String saveFile(String name, String base64, String mime) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safe = name.replaceAll("[^A-Za-z0-9._ -]", "_");
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/NexusAgent");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "";
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) { os.write(bytes); }
                    return "Downloads/NexusAgent/" + safe;
                }
                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "NexusAgent");
                dir.mkdirs();
                File f = new File(dir, safe);
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                return f.getAbsolutePath();
            } catch (Exception e) {
                return "";
            }
        }
    }

    // ── Helpers used by GlassesTools and the bridge ──

    void callback(String id, boolean ok, String json) {
        final String js = "window.__nexusCb&&window.__nexusCb(" + JSONObject.quote(id) + "," + ok + "," + json + ")";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    void emit(String type, String json) {
        final String js = "window.__nexusEvent&&window.__nexusEvent(" + JSONObject.quote(type) + "," + json + ")";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    static String errorJson(Exception e) { return "{\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}"; }

    static String localIp() {
        try {
            for (java.net.NetworkInterface ni : java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (java.net.InetAddress a : java.util.Collections.list(ni.getInetAddresses())) {
                    if (a instanceof java.net.Inet4Address && !a.isLoopbackAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) { }
        return "";
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

    android.view.Display externalDisplay() {
        android.hardware.display.DisplayManager dm = (android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE);
        android.view.Display[] ds = dm.getDisplays(android.hardware.display.DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        return ds.length > 0 ? ds[0] : null;
    }

    String hudStart() {
        android.view.Display d = externalDisplay();
        if (d == null) return "{\"error\":\"No external display connected (plug your display glasses in over USB-C)\"}";
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
            } catch (Exception e) { out[0] = errorJson(e); }
            l.countDown();
        });
        try { l.await(3, java.util.concurrent.TimeUnit.SECONDS); } catch (InterruptedException ignored) { }
        return out[0] == null ? "{}" : out[0];
    }

    void hudStop() { runOnUiThread(() -> { if (hud != null) { hud.dismiss(); hud = null; } }); }

    private void watchDisplays() {
        android.hardware.display.DisplayManager dm = (android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE);
        displayListener = new android.hardware.display.DisplayManager.DisplayListener() {
            @Override public void onDisplayAdded(int id) { emit("display", "{\"connected\":true}"); }
            @Override public void onDisplayRemoved(int id) { if (externalDisplay() == null) { hudStop(); emit("display", "{\"connected\":false}"); } }
            @Override public void onDisplayChanged(int id) { }
        };
        dm.registerDisplayListener(displayListener, null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
        } else if (requestCode == REQ_VOICE) {
            String text = "";
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (r != null && !r.isEmpty()) text = r.get(0);
            }
            webView.evaluateJavascript("window.nexusVoiceResult && window.nexusVoiceResult(" + JSONObject.quote(text) + ")", null);
        }
    }

    @Override
    public void onBackPressed() {
        // Let the page handle Back first (close menus, leave a chat), then fall back to the default.
        webView.evaluateJavascript("(window.nexusBack && window.nexusBack()) ? 'handled' : ''", value -> {
            if (value != null && value.contains("handled")) return;
            if (webView.canGoBack()) webView.goBack();
            else MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        if (hud != null) hud.dismiss();
        if (displayListener != null) ((android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE)).unregisterDisplayListener(displayListener);
        super.onDestroy();
    }
}
