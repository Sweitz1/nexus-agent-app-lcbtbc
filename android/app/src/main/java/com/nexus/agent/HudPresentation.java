package com.nexus.agent;

import android.app.Presentation;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/**
 * Heads-up display on external "display glasses" (Lenovo Legion Glasses / Glasses T1, XREAL,
 * Viture, Rokid, RayNeo Air...). Shows assets/hud.html on the glasses while the phone screen
 * stays free; the main UI pushes content with hudPost().
 */
class HudPresentation extends Presentation {

    private final MainActivity act;
    private WebView web;
    private boolean ready = false;
    private String pending = null;

    HudPresentation(MainActivity act, Display display) {
        super(act, display);
        this.act = act;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(getContext());
        web.setBackgroundColor(0xFF000000);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return MainActivity.HOST.equals(r.getUrl().getHost()) ? act.serveLocalPublic(r.getUrl().getPath(), r.getRequestHeaders()) : null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
            @Override public void onPageFinished(WebView v, String url) {
                ready = true;
                if (pending != null) { post(pending); pending = null; }
            }
        });
        setContentView(web);
        web.loadUrl(MainActivity.ORIGIN + "/hud.html");
    }

    void post(String json) {
        if (web == null || !ready) { pending = json; return; }
        web.evaluateJavascript("window.hudUpdate&&window.hudUpdate(" + json + ")", null);
    }

    String info() {
        try {
            Display d = getDisplay();
            android.util.DisplayMetrics m = new android.util.DisplayMetrics();
            d.getRealMetrics(m);
            JSONObject o = new JSONObject();
            o.put("name", d.getName());
            o.put("width", m.widthPixels);
            o.put("height", m.heightPixels);
            o.put("refreshHz", Math.round(d.getRefreshRate()));
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }
}
