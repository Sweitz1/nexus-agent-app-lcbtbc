package com.nexus.agent;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * JavaScript bridge exposed as window.NexusNative.
 *
 * Async methods take a callback id and answer through window.__nexusCb(id, ok, payload).
 * Network calls are made natively so the web UI is not limited by CORS (needed for
 * direct calls to Anthropic, xAI, Venice and LAN-hosted local models).
 */
public class NativeBridge {

    private static final int MAX_BODY_BYTES = 8 * 1024 * 1024;

    private final MainActivity activity;
    private final SharedPreferences prefs;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private SpeechRecognizer recognizer;
    private String speechCallbackId;
    private WebhookServer server;

    NativeBridge(MainActivity activity) {
        this.activity = activity;
        this.prefs = activity.getSharedPreferences("nexus_secure", Context.MODE_PRIVATE);
        tts = new TextToSpeech(activity, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) tts.setLanguage(Locale.getDefault());
        });
    }

    // ------------------------------------------------------------------ basics

    @JavascriptInterface
    public boolean isNative() { return true; }

    @JavascriptInterface
    public String deviceInfo() {
        try {
            JSONObject o = new JSONObject();
            o.put("manufacturer", Build.MANUFACTURER);
            o.put("model", Build.MODEL);
            o.put("device", Build.DEVICE);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("release", Build.VERSION.RELEASE);
            o.put("ip", localIp());
            o.put("version", BuildConfigCompat.versionName(activity));
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void toast(String msg) {
        activity.runOnUiThread(() -> Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public void vibrate(int ms) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), VibrationEffect.DEFAULT_AMPLITUDE));
        } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public void keepScreenOn(boolean on) { activity.setKeepScreenOn(on); }

    @JavascriptInterface
    public void exitApp() { activity.exitApp(); }

    // ------------------------------------------------------------------ private key store

    /** API keys live in app-private SharedPreferences, never in WebView storage. */
    @JavascriptInterface
    public String storeGet(String key) { return prefs.getString(key, ""); }

    @JavascriptInterface
    public void storeSet(String key, String value) { prefs.edit().putString(key, value).apply(); }

    @JavascriptInterface
    public void storeRemove(String key) { prefs.edit().remove(key).apply(); }

    // ------------------------------------------------------------------ HTTP

    /**
     * req = {method, url, headers:{}, body:string, timeoutMs}
     * resolves {status, headers:{}, body:string}
     */
    @JavascriptInterface
    public void http(String id, String reqJson) {
        pool.execute(() -> {
            HttpURLConnection c = null;
            try {
                JSONObject req = new JSONObject(reqJson);
                String method = req.optString("method", "GET").toUpperCase(Locale.ROOT);
                URL url = new URL(req.getString("url"));
                String scheme = url.getProtocol();
                if (!"http".equals(scheme) && !"https".equals(scheme)) throw new IllegalArgumentException("Only http/https URLs are allowed");
                int timeout = req.optInt("timeoutMs", 120000);

                c = (HttpURLConnection) url.openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(Math.min(timeout, 20000));
                c.setReadTimeout(timeout);
                c.setRequestMethod(method);
                JSONObject headers = req.optJSONObject("headers");
                boolean hasUa = false;
                if (headers != null) {
                    Iterator<String> it = headers.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        if (k.equalsIgnoreCase("user-agent")) hasUa = true;
                        c.setRequestProperty(k, headers.optString(k));
                    }
                }
                if (!hasUa) c.setRequestProperty("User-Agent", "NexusAgent/1.0 (Android; RayNeo)");
                String body = req.has("body") && !req.isNull("body") ? req.optString("body") : null;
                if (body != null && !method.equals("GET") && !method.equals("HEAD")) {
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    c.setDoOutput(true);
                    c.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
                }

                int status = c.getResponseCode();
                InputStream is = status >= 400 ? c.getErrorStream() : c.getInputStream();
                String text = is == null ? "" : readAll(is);

                JSONObject out = new JSONObject();
                out.put("status", status);
                JSONObject rh = new JSONObject();
                for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                    if (e.getKey() != null && e.getValue() != null && !e.getValue().isEmpty())
                        rh.put(e.getKey().toLowerCase(Locale.ROOT), e.getValue().get(0));
                }
                out.put("headers", rh);
                out.put("body", text);
                activity.callback(id, true, out.toString());
            } catch (Exception e) {
                activity.callback(id, false, errorJson(e));
            } finally {
                if (c != null) c.disconnect();
            }
        });
    }

    private static String readAll(InputStream is) throws java.io.IOException {
        try (InputStream in = is) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n, total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_BODY_BYTES) break;
                bos.write(buf, 0, n);
            }
            return bos.toString("UTF-8");
        }
    }

    static String errorJson(Exception e) {
        try {
            JSONObject o = new JSONObject();
            o.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            return o.toString();
        } catch (Exception x) {
            return "{\"error\":\"unknown\"}";
        }
    }

    // ------------------------------------------------------------------ apps & intents

    @JavascriptInterface
    public String listApps() {
        try {
            PackageManager pm = activity.getPackageManager();
            Intent i = new Intent(Intent.ACTION_MAIN);
            i.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> list = pm.queryIntentActivities(i, 0);
            List<JSONObject> apps = new ArrayList<>();
            for (ResolveInfo ri : list) {
                JSONObject o = new JSONObject();
                o.put("label", String.valueOf(ri.loadLabel(pm)));
                o.put("package", ri.activityInfo.packageName);
                apps.add(o);
            }
            Collections.sort(apps, (a, b) -> a.optString("label").compareToIgnoreCase(b.optString("label")));
            JSONArray arr = new JSONArray();
            for (JSONObject o : apps) arr.put(o);
            return arr.toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    @JavascriptInterface
    public boolean launchApp(String pkg) {
        try {
            Intent i = activity.getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public boolean openUrl(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** spec = {action, data, package, type, extras:{k:v}} ; returns "ok" or an error message. */
    @JavascriptInterface
    public String startIntent(String specJson) {
        try {
            JSONObject s = new JSONObject(specJson);
            Intent i = new Intent(s.optString("action", Intent.ACTION_VIEW));
            String data = s.optString("data", "");
            String type = s.optString("type", "");
            if (!data.isEmpty() && !type.isEmpty()) i.setDataAndType(Uri.parse(data), type);
            else if (!data.isEmpty()) i.setData(Uri.parse(data));
            else if (!type.isEmpty()) i.setType(type);
            String pkg = s.optString("package", "");
            if (!pkg.isEmpty()) i.setPackage(pkg);
            JSONObject extras = s.optJSONObject("extras");
            if (extras != null) {
                Iterator<String> it = extras.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    Object v = extras.get(k);
                    if (v instanceof Boolean) i.putExtra(k, (Boolean) v);
                    else if (v instanceof Integer) i.putExtra(k, (Integer) v);
                    else if (v instanceof Long) i.putExtra(k, (Long) v);
                    else if (v instanceof Double) i.putExtra(k, (Double) v);
                    else i.putExtra(k, String.valueOf(v));
                }
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return "ok";
        } catch (ActivityNotFoundException e) {
            return "No app can handle this intent";
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }

    @JavascriptInterface
    public void shareText(String text) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, text);
        Intent chooser = Intent.createChooser(i, "Share");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { activity.startActivity(chooser); } catch (Exception ignored) { }
    }

    // ------------------------------------------------------------------ voice

    @JavascriptInterface
    public boolean ttsAvailable() { return ttsReady; }

    @JavascriptInterface
    public void speak(String text, float rate) {
        if (!ttsReady) return;
        tts.setSpeechRate(rate <= 0 ? 1.0f : rate);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "nexus");
    }

    @JavascriptInterface
    public void stopSpeaking() { if (ttsReady) tts.stop(); }

    @JavascriptInterface
    public boolean hasMicPermission() { return activity.hasMicPermission(); }

    @JavascriptInterface
    public void requestMicPermission() { activity.requestMicPermission(); }

    /**
     * Speech-to-text. Uses the in-app SpeechRecognizer when the device has one, otherwise
     * falls back to the system voice-input activity. Resolves {text}.
     */
    @JavascriptInterface
    public void listen(String id, String lang) {
        activity.runOnUiThread(() -> {
            speechCallbackId = id;
            String language = (lang == null || lang.isEmpty()) ? Locale.getDefault().toLanguageTag() : lang;
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak to your agent");

            if (activity.hasMicPermission() && SpeechRecognizer.isRecognitionAvailable(activity)) {
                if (recognizer != null) recognizer.destroy();
                recognizer = SpeechRecognizer.createSpeechRecognizer(activity);
                recognizer.setRecognitionListener(new RecognitionListener() {
                    public void onReadyForSpeech(Bundle p) { activity.emit("speech_state", "{\"state\":\"listening\"}"); }
                    public void onBeginningOfSpeech() { }
                    public void onRmsChanged(float v) { }
                    public void onBufferReceived(byte[] b) { }
                    public void onEndOfSpeech() { activity.emit("speech_state", "{\"state\":\"processing\"}"); }
                    public void onError(int error) { finishSpeech(false, "Speech error " + error); }
                    public void onResults(Bundle r) {
                        ArrayList<String> list = r.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        finishSpeech(true, list != null && !list.isEmpty() ? list.get(0) : "");
                    }
                    public void onPartialResults(Bundle r) {
                        ArrayList<String> list = r.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (list != null && !list.isEmpty())
                            activity.emit("speech_partial", "{\"text\":" + JSONObject.quote(list.get(0)) + "}");
                    }
                    public void onEvent(int t, Bundle b) { }
                });
                recognizer.startListening(intent);
            } else {
                try {
                    activity.startActivityForResult(intent, MainActivity.REQ_SPEECH);
                } catch (ActivityNotFoundException e) {
                    finishSpeech(false, "No speech recognition service on this device");
                }
            }
        });
    }

    @JavascriptInterface
    public void stopListening() {
        activity.runOnUiThread(() -> { if (recognizer != null) recognizer.stopListening(); });
    }

    void onSpeechActivityResult(String text) { finishSpeech(true, text); }

    private void finishSpeech(boolean ok, String textOrError) {
        String id = speechCallbackId;
        speechCallbackId = null;
        if (id == null) return;
        String payload = ok ? "{\"text\":" + JSONObject.quote(textOrError) + "}"
                : "{\"error\":" + JSONObject.quote(textOrError) + "}";
        activity.callback(id, ok, payload);
    }

    // ------------------------------------------------------------------ incoming webhooks

    /** Starts the LAN webhook / remote-console server. Returns a status JSON string. */
    @JavascriptInterface
    public String startServer(int port, String token) {
        try {
            stopServer();
            server = new WebhookServer(activity, port, token);
            server.start();
            JSONObject o = new JSONObject();
            o.put("running", true);
            o.put("port", port);
            o.put("ip", localIp());
            return o.toString();
        } catch (Exception e) {
            server = null;
            return errorJson(e);
        }
    }

    @JavascriptInterface
    public void stopServer() {
        if (server != null) {
            server.shutdown();
            server = null;
        }
    }

    @JavascriptInterface
    public boolean serverRunning() { return server != null && server.isRunning(); }

    /** Completes a pending incoming request delivered to JS as a "webhook" event. */
    @JavascriptInterface
    public void serverRespond(String reqId, int status, String contentType, String body) {
        if (server != null) server.respond(reqId, status, contentType, body);
    }

    // ------------------------------------------------------------------ helpers

    static String localIp() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) { }
        return "";
    }

    void shutdown() {
        stopServer();
        if (recognizer != null) recognizer.destroy();
        if (tts != null) tts.shutdown();
        pool.shutdownNow();
    }

    /** Small helper so we don't depend on the generated BuildConfig class. */
    static final class BuildConfigCompat {
        static String versionName(Context c) {
            try {
                return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }
}
