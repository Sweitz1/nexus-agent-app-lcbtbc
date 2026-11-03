package com.nexus.glasses;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;

import com.nexus.rayneo.GlassesDisplay;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** window.NexusClient — the small native surface the glasses client needs. */
public class ClientBridge {

    private final ClientActivity act;
    private final SharedPreferences prefs;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private TextToSpeech tts;
    private boolean ttsReady;
    private SpeechRecognizer rec;
    private String speechId;

    ClientBridge(ClientActivity act) {
        this.act = act;
        prefs = act.getSharedPreferences("nexus_glasses", Context.MODE_PRIVATE);
        tts = new TextToSpeech(act, st -> {
            ttsReady = st == TextToSpeech.SUCCESS;
            if (ttsReady) tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { act.emit("tts", "{\"speaking\":true}"); }
                @Override public void onDone(String id) { act.emit("tts", "{\"speaking\":false}"); }
                @Override public void onError(String id) { act.emit("tts", "{\"speaking\":false}"); }
            });
        });
    }

    private static String err(Exception e) {
        try { JSONObject o = new JSONObject(); o.put("error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()); return o.toString(); } catch (Exception x) { return "{\"error\":\"error\"}"; }
    }

    @JavascriptInterface public boolean isNative() { return true; }
    @JavascriptInterface public String storeGet(String k) { return prefs.getString(k, ""); }
    @JavascriptInterface public void storeSet(String k, String v) { prefs.edit().putString(k, v).apply(); }
    @JavascriptInterface public void exitApp() { act.exit(); }
    @JavascriptInterface public boolean hasPermission(String p) { return act.hasPermission(p); }
    @JavascriptInterface public void requestPermission(String id, String p) { act.requestPermission(id, p); }

    @JavascriptInterface
    public void vibrate(int ms) {
        try { Vibrator v = (Vibrator) act.getSystemService(Context.VIBRATOR_SERVICE); if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), VibrationEffect.DEFAULT_AMPLITUDE)); } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public String deviceInfo() {
        try {
            JSONObject o = new JSONObject();
            o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
            Intent b = act.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b != null) o.put("battery", Math.round(b.getIntExtra(BatteryManager.EXTRA_LEVEL, 0) * 100f / Math.max(1, b.getIntExtra(BatteryManager.EXTRA_SCALE, 100))));
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    @JavascriptInterface
    public String displayMode() { return GlassesDisplay.describe(act); }

    /** key: mirror | temple; mode: auto | on | off. */
    @JavascriptInterface
    public void setDisplayMode(String key, String mode) { GlassesDisplay.set(act, key, mode); }

    /** req {method, url, headers, body, timeoutMs} → {status, body}. Reaches the phone over plain LAN HTTP. */
    @JavascriptInterface
    public void http(String id, String reqJson) {
        pool.execute(() -> {
            HttpURLConnection c = null;
            try {
                JSONObject r = new JSONObject(reqJson);
                c = (HttpURLConnection) new URL(r.getString("url")).openConnection();
                int t = r.optInt("timeoutMs", 60000);
                c.setConnectTimeout(Math.min(t, 8000));
                c.setReadTimeout(t);
                c.setRequestMethod(r.optString("method", "GET"));
                JSONObject h = r.optJSONObject("headers");
                if (h != null) { Iterator<String> it = h.keys(); while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.optString(k)); } }
                if (r.has("body") && !r.isNull("body")) {
                    byte[] bytes = r.getString("body").getBytes(StandardCharsets.UTF_8);
                    c.setDoOutput(true);
                    c.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
                }
                int st = c.getResponseCode();
                InputStream in = st >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                if (in != null) try (InputStream i = in) { byte[] buf = new byte[16384]; int n; while ((n = i.read(buf)) > 0) bos.write(buf, 0, n); }
                JSONObject o = new JSONObject();
                o.put("status", st);
                o.put("body", bos.toString("UTF-8"));
                act.callback(id, true, o.toString());
            } catch (Exception e) {
                act.callback(id, false, err(e));
            } finally { if (c != null) c.disconnect(); }
        });
    }

    /** Finds Nexus phone apps advertising _nexus._tcp on the Wi-Fi. Resolves [{name, host, port}]. */
    @JavascriptInterface
    public void discover(String id, int timeoutMs) {
        act.runOnUiThread(() -> {
            NsdManager nsd = (NsdManager) act.getSystemService(Context.NSD_SERVICE);
            JSONArray found = new JSONArray();
            final boolean[] done = {false};
            NsdManager.DiscoveryListener dl = new NsdManager.DiscoveryListener() {
                public void onDiscoveryStarted(String t) { }
                public void onDiscoveryStopped(String t) { }
                public void onStartDiscoveryFailed(String t, int e) { finish(); }
                public void onStopDiscoveryFailed(String t, int e) { }
                public void onServiceLost(NsdServiceInfo i) { }
                public void onServiceFound(NsdServiceInfo info) {
                    try {
                        //noinspection deprecation
                        nsd.resolveService(info, new NsdManager.ResolveListener() {
                            public void onResolveFailed(NsdServiceInfo i, int e) { }
                            public void onServiceResolved(NsdServiceInfo i) {
                                try {
                                    JSONObject o = new JSONObject();
                                    o.put("name", i.getServiceName());
                                    o.put("host", i.getHost().getHostAddress());
                                    o.put("port", i.getPort());
                                    synchronized (found) { found.put(o); }
                                } catch (Exception ignored) { }
                            }
                        });
                    } catch (Exception ignored) { }
                }
                void finish() {
                    if (done[0]) return;
                    done[0] = true;
                    act.callback(id, true, found.toString());
                }
            };
            try { nsd.discoverServices("_nexus._tcp", NsdManager.PROTOCOL_DNS_SD, dl); } catch (Exception e) { act.callback(id, false, err(e)); return; }
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try { nsd.stopServiceDiscovery(dl); } catch (Exception ignored) { }
                if (!done[0]) { done[0] = true; act.callback(id, true, found.toString()); }
            }, Math.max(1500, Math.min(timeoutMs, 15000)));
        });
    }

    // ---------------------------------------------------------------- voice

    @JavascriptInterface
    public void speak(String text, float rate) {
        if (!ttsReady) return;
        tts.setSpeechRate(rate <= 0 ? 1f : rate);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "c" + System.nanoTime());
    }

    @JavascriptInterface public void stopSpeaking() { if (ttsReady) tts.stop(); }

    @JavascriptInterface
    public void listen(String id, String lang) {
        act.runOnUiThread(() -> {
            speechId = id;
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang == null || lang.isEmpty() ? Locale.getDefault().toLanguageTag() : lang);
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            if (act.hasPermission(Manifest.permission.RECORD_AUDIO) && SpeechRecognizer.isRecognitionAvailable(act)) {
                if (rec != null) rec.destroy();
                rec = SpeechRecognizer.createSpeechRecognizer(act);
                rec.setRecognitionListener(new RecognitionListener() {
                    public void onReadyForSpeech(Bundle p) { act.emit("speech", "{\"state\":\"listening\"}"); }
                    public void onBeginningOfSpeech() { }
                    public void onRmsChanged(float v) { }
                    public void onBufferReceived(byte[] b) { }
                    public void onEndOfSpeech() { act.emit("speech", "{\"state\":\"processing\"}"); }
                    public void onError(int e) { speechDone(false, "Didn't catch that (" + e + ")"); }
                    public void onResults(Bundle r) { ArrayList<String> l = r.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); speechDone(true, l != null && !l.isEmpty() ? l.get(0) : ""); }
                    public void onPartialResults(Bundle r) { ArrayList<String> l = r.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if (l != null && !l.isEmpty()) act.emit("speech", "{\"partial\":" + JSONObject.quote(l.get(0)) + "}"); }
                    public void onEvent(int t, Bundle b) { }
                });
                rec.startListening(i);
            } else {
                try { act.startActivityForResult(i, ClientActivity.REQ_SPEECH); }
                catch (ActivityNotFoundException e) { speechDone(false, "No speech recognition on this device"); }
            }
        });
    }

    void speechDone(boolean ok, String text) {
        String id = speechId; speechId = null;
        if (id != null) act.callback(id, ok, ok ? "{\"text\":" + JSONObject.quote(text) + "}" : "{\"error\":" + JSONObject.quote(text) + "}");
    }

    // ---------------------------------------------------------------- head gestures (nod / shake)

    @JavascriptInterface
    public void headGesture(String id, int timeoutMs) {
        act.runOnUiThread(() -> {
            SensorManager sm = (SensorManager) act.getSystemService(Context.SENSOR_SERVICE);
            Sensor g = sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
            if (g == null) { act.callback(id, true, "{\"axis\":\"none\"}"); return; }
            final int[] lastSign = new int[3]; final long[] lastPeak = new long[3]; final int[] alt = new int[3]; final double[] en = new double[3]; final boolean[] done = {false};
            SensorEventListener l = new SensorEventListener() {
                public void onSensorChanged(SensorEvent e) {
                    if (done[0]) return;
                    long now = SystemClock.elapsedRealtime();
                    for (int i = 0; i < 3; i++) {
                        float v = e.values[i]; en[i] = en[i] * 0.9 + v * v;
                        if (Math.abs(v) < 1.3f) continue;
                        int s = v > 0 ? 1 : -1;
                        if (lastSign[i] != 0 && s != lastSign[i] && now - lastPeak[i] < 900) alt[i]++; else if (now - lastPeak[i] >= 900) alt[i] = 0;
                        lastSign[i] = s; lastPeak[i] = now;
                    }
                    int b = en[0] >= en[1] && en[0] >= en[2] ? 0 : en[1] >= en[2] ? 1 : 2;
                    double o = 0; for (int i = 0; i < 3; i++) if (i != b) o = Math.max(o, en[i]);
                    if (alt[b] >= 1 && en[b] > 1.8 * o) { done[0] = true; sm.unregisterListener(this); act.callback(id, true, "{\"axis\":\"" + "xyz".charAt(b) + "\"}"); }
                }
                public void onAccuracyChanged(Sensor s, int a) { }
            };
            sm.registerListener(l, g, SensorManager.SENSOR_DELAY_GAME);
            new Handler(Looper.getMainLooper()).postDelayed(() -> { if (!done[0]) { done[0] = true; sm.unregisterListener(l); act.callback(id, true, "{\"axis\":\"none\"}"); } }, Math.max(1000, Math.min(timeoutMs, 30000)));
        });
    }

    void shutdown() {
        if (rec != null) rec.destroy();
        if (tts != null) tts.shutdown();
        pool.shutdownNow();
    }
}
