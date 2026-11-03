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
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.util.ArrayList;

/**
 * Hosts the Nexus Agent web UI (assets/index.html) in a WebView and exposes the
 * native bridge ({@link NativeBridge}) as window.NexusNative.
 *
 * Tuned for the RayNeo X3 Pro AR glasses: black (transparent) background, immersive
 * full screen, temple-touchpad key events forwarded to the UI as arrow/enter/back.
 */
public class MainActivity extends Activity {

    static final int REQ_SPEECH = 41;
    static final int REQ_MIC_PERMISSION = 42;

    WebView webView;
    NativeBridge bridge;
    private boolean pageReady = false;
    private final ArrayList<String> pendingEvents = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        goImmersive();

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF000000);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        setContentView(webView);

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
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme())) return false;
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
                request.deny();
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        try {
            if (Intent.ACTION_SEND.equals(intent.getAction())) {
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

    boolean hasMicPermission() {
        return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    void requestMicPermission() {
        runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC_PERMISSION));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_MIC_PERMISSION) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            emit("mic_permission", "{\"granted\":" + granted + "}");
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
        }
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.shutdown();
        super.onDestroy();
    }
}
