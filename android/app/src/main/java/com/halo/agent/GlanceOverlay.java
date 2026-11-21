package com.halo.agent;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The "glance" card: a transparent window drawn over whatever app is in front (video keeps
 * playing behind it). Shows assets/glance.html; the main UI drives it with post(json) and gets
 * touchpad gestures back as "glance" events ({action: tap|double}).
 */
class GlanceOverlay {

    private final MainActivity act;
    private WebView web;
    private boolean ready = false;
    private String pending = null;

    GlanceOverlay(MainActivity act) { this.act = act; }

    boolean canShow() { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(act); }

    boolean isShowing() { return web != null; }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    String show() {
        if (!canShow()) return "{\"error\":\"Allow \\\"Display over other apps\\\" for Halo to use the glance card\"}";
        if (web != null) return "{\"ok\":true}";
        WindowManager wm = (WindowManager) act.getSystemService(Context.WINDOW_SERVICE);
        web = new WebView(act);
        web.setBackgroundColor(Color.TRANSPARENT);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(true);
        web.addJavascriptInterface(new Bridge(), "HaloGlance");
        web.setWebViewClient(new WebViewClient());
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        // Temple touchpad: tap = Enter / D-pad center, double tap and swipe down = Back.
        web.setOnKeyListener((v, code, e) -> {
            if (e.getAction() != KeyEvent.ACTION_DOWN) return code == KeyEvent.KEYCODE_BACK;
            if (code == KeyEvent.KEYCODE_BACK || code == KeyEvent.KEYCODE_ESCAPE) { act.emit("glance", "{\"action\":\"double\"}"); return true; }
            return false; // Enter/D-pad center reach the page, which tells single from double taps
        });
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
                        | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        try {
            wm.addView(web, lp);
        } catch (Exception e) {
            web = null;
            return NativeBridge.errorJson(e);
        }
        web.loadUrl("file:///android_asset/glance.html");
        web.requestFocus();
        return "{\"ok\":true}";
    }

    void post(String json) {
        if (web == null) return;
        if (!ready) { pending = json; return; }
        web.evaluateJavascript("window.glanceUpdate&&window.glanceUpdate(" + json + ")", null);
    }

    void hide() {
        if (web == null) return;
        try { ((WindowManager) act.getSystemService(Context.WINDOW_SERVICE)).removeView(web); } catch (Exception ignored) { }
        web.destroy();
        web = null;
        ready = false;
        pending = null;
    }

    private class Bridge {
        @JavascriptInterface
        public void ready() {
            act.runOnUiThread(() -> {
                ready = true;
                if (pending != null) { String p = pending; pending = null; post(p); }
            });
        }

        @JavascriptInterface
        public void action(String a) {
            act.emit("glance", "{\"action\":" + org.json.JSONObject.quote(a == null ? "" : a) + "}");
        }
    }
}
