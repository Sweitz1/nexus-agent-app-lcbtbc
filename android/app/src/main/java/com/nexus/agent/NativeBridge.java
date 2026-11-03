package com.nexus.agent;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import com.nexus.rayneo.GlassesDisplay;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
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
    private static final java.util.Set<String> STD_METHODS = new java.util.HashSet<>(java.util.Arrays.asList("GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"));

    private final MainActivity activity;
    private final SharedPreferences prefs;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private SpeechRecognizer recognizer;
    private String speechCallbackId;
    private WebhookServer server;
    final Workspace workspace;
    private final MediaTools media;
    private final EmailClient email;
    private final CalendarTools calendar;
    private final GlassesTools glasses;
    private final MusicTools music;
    private final ApkTools apk;
    private android.media.session.MediaSession tapSession;
    private android.media.AudioTrack silentTrack;
    private final java.util.Map<String, java.util.concurrent.CountDownLatch> ttsDone = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.Map<String, Boolean> ttsOk = new java.util.concurrent.ConcurrentHashMap<>();
    private String pickCallbackId, exportCallbackId, exportPath, cameraCallbackId;
    private File cameraFile;

    NativeBridge(MainActivity activity) {
        this.activity = activity;
        this.workspace = new Workspace(activity);
        this.media = new MediaTools(workspace);
        this.email = new EmailClient(workspace);
        this.calendar = new CalendarTools(activity);
        this.glasses = new GlassesTools(activity);
        this.music = new MusicTools(activity);
        this.apk = new ApkTools(activity, workspace);
        NexusNotificationListener.sink = n -> activity.emit("notification", n.toString());
        WakeWordService.sink = e -> activity.emit("wake", e.toString());
        NexusAccessibilityService.sink = (t, d) -> { try { d.put("type", t); } catch (Exception ignored) { } activity.emit("screen", d.toString()); };
        this.prefs = activity.getSharedPreferences("nexus_secure", Context.MODE_PRIVATE);
        tts = new TextToSpeech(activity, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                tts.setLanguage(Locale.getDefault());
                tts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                    @Override public void onStart(String id) { if (id.startsWith("say")) activity.emit("tts_state", "{\"speaking\":true}"); }
                    @Override public void onDone(String id) { finishUtterance(id, true); }
                    @Override public void onError(String id) { finishUtterance(id, false); }
                });
            }
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
            o.put("ips", new JSONArray(localIps()));
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
                if (!STD_METHODS.contains(method)) {
                    // WebDAV/CalDAV verbs and PATCH: HttpURLConnection refuses them.
                    String b = req.has("body") && !req.isNull("body") ? req.optString("body") : null;
                    activity.callback(id, true, RawHttp.request(method, req.getString("url"), req.optJSONObject("headers"), b, req.optInt("timeoutMs", 120000)).toString());
                    return;
                }
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

    private static String readAllSafe(InputStream is) {
        try { String t = readAll(is); return t.length() > 300 ? t.substring(0, 300) : t; } catch (Exception e) { return ""; }
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
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "say" + System.nanoTime());
    }

    @JavascriptInterface
    public void stopSpeaking() { if (ttsReady) tts.stop(); }

    @JavascriptInterface
    public boolean hasMicPermission() { return activity.hasMicPermission(); }

    /** perm is a full Android permission name, e.g. android.permission.CAMERA */
    @JavascriptInterface
    public boolean hasPermission(String perm) { return activity.hasPermission(perm); }

    @JavascriptInterface
    public void requestPermission(String id, String perm) { activity.requestPermission(id, perm); }

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
            advertise(port);
            try {
                Intent ka = new Intent(activity, ServerKeepAliveService.class);
                if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(ka); else activity.startService(ka);
            } catch (Exception ignored) { }
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
        unadvertise();
        try { activity.stopService(new Intent(activity, ServerKeepAliveService.class)); } catch (Exception ignored) { }
        if (server != null) {
            server.shutdown();
            server = null;
        }
    }

    // Announce the server on the LAN (mDNS/NSD) so the glasses client finds the phone automatically.
    private android.net.nsd.NsdManager.RegistrationListener nsdListener;

    private void advertise(int port) {
        try {
            android.net.nsd.NsdManager nsd = (android.net.nsd.NsdManager) activity.getSystemService(Context.NSD_SERVICE);
            android.net.nsd.NsdServiceInfo info = new android.net.nsd.NsdServiceInfo();
            info.setServiceName("Nexus " + Build.MODEL);
            info.setServiceType("_nexus._tcp");
            info.setPort(port);
            nsdListener = new android.net.nsd.NsdManager.RegistrationListener() {
                public void onServiceRegistered(android.net.nsd.NsdServiceInfo i) { }
                public void onRegistrationFailed(android.net.nsd.NsdServiceInfo i, int e) { }
                public void onServiceUnregistered(android.net.nsd.NsdServiceInfo i) { }
                public void onUnregistrationFailed(android.net.nsd.NsdServiceInfo i, int e) { }
            };
            nsd.registerService(info, android.net.nsd.NsdManager.PROTOCOL_DNS_SD, nsdListener);
        } catch (Exception ignored) { }
    }

    private void unadvertise() {
        try {
            if (nsdListener != null) ((android.net.nsd.NsdManager) activity.getSystemService(Context.NSD_SERVICE)).unregisterService(nsdListener);
        } catch (Exception ignored) { }
        nsdListener = null;
    }

    @JavascriptInterface
    public boolean serverRunning() { return server != null && server.isRunning(); }

    /** Completes a pending incoming request delivered to JS as a "webhook" event. */
    @JavascriptInterface
    public void serverRespond(String reqId, int status, String contentType, String body) {
        if (server != null) server.respond(reqId, status, contentType, body);
    }

    /** Answers a server request with a workspace file as the body (e.g. narrator audio for the glasses). */
    @JavascriptInterface
    public void serverRespondFile(String reqId, int status, String contentType, String path) {
        if (server == null) return;
        try {
            java.io.File f = workspace.resolve(path);
            if (f.isFile()) { server.respondFile(reqId, status, contentType, f); return; }
        } catch (Exception ignored) { }
        server.respond(reqId, 404, "application/json", "{\"error\":\"file not found\"}");
    }


    // ------------------------------------------------------------------ file workspace

    private interface Job { String run() throws Exception; }

    private void async(String id, Job job) {
        pool.execute(() -> {
            try { activity.callback(id, true, job.run()); }
            catch (Exception e) { activity.callback(id, false, errorJson(e)); }
        });
    }

    private static String ok(String key, String value) {
        try { JSONObject o = new JSONObject(); o.put(key, value); return o.toString(); } catch (Exception e) { return "{}"; }
    }

    @JavascriptInterface
    public String fsList(String dir, boolean recursive) {
        try { return workspace.list(dir, recursive); } catch (Exception e) { return errorJson(e); }
    }

    @JavascriptInterface
    public String fsStat(String path) {
        try { return workspace.stat(path); } catch (Exception e) { return errorJson(e); }
    }

    @JavascriptInterface
    public void fsReadText(String id, String path) { async(id, () -> ok("text", workspace.readText(path))); }

    @JavascriptInterface
    public void fsReadB64(String id, String path) { async(id, () -> ok("b64", workspace.readB64(path))); }

    @JavascriptInterface
    public void fsWriteText(String id, String path, String text) {
        async(id, () -> ok("path", workspace.write(path, text.getBytes(StandardCharsets.UTF_8))));
    }

    @JavascriptInterface
    public void fsWriteB64(String id, String path, String b64) {
        async(id, () -> ok("path", workspace.write(path, Base64.decode(b64, Base64.DEFAULT))));
    }

    @JavascriptInterface
    public String fsDelete(String path) {
        try { return workspace.delete(path) ? "{\"ok\":true}" : "{\"error\":\"not deleted\"}"; } catch (Exception e) { return errorJson(e); }
    }

    @JavascriptInterface
    public String fsMove(String from, String to) {
        try { return ok("path", workspace.move(from, to)); } catch (Exception e) { return errorJson(e); }
    }

    @JavascriptInterface
    public String fsMkdir(String path) {
        try { //noinspection ResultOfMethodCallIgnored
            workspace.resolve(path).mkdirs(); return ok("path", path); } catch (Exception e) { return errorJson(e); }
    }

    /** System file picker; picked files are copied into workspace/imports. Resolves {files:[paths]}. */
    @JavascriptInterface
    public void pickFiles(String id, String mime) {
        activity.runOnUiThread(() -> {
            pickCallbackId = id;
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(mime == null || mime.isEmpty() ? "*/*" : mime);
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                activity.startActivityForResult(i, MainActivity.REQ_PICK);
            } catch (ActivityNotFoundException e) {
                Intent g = new Intent(Intent.ACTION_GET_CONTENT);
                g.addCategory(Intent.CATEGORY_OPENABLE);
                g.setType(i.getType());
                g.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { activity.startActivityForResult(g, MainActivity.REQ_PICK); }
                catch (ActivityNotFoundException e2) { pickCallbackId = null; activity.callback(id, false, "{\"error\":\"No file picker on this device\"}"); }
            }
        });
    }

    /** "Save as" dialog that copies a workspace file to user-visible storage. */
    @JavascriptInterface
    public void exportFile(String id, String path) {
        activity.runOnUiThread(() -> {
            try {
                File f = workspace.resolve(path);
                exportCallbackId = id;
                exportPath = path;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(MainActivity.mimeFor(f.getName()));
                i.putExtra(Intent.EXTRA_TITLE, f.getName());
                activity.startActivityForResult(i, MainActivity.REQ_EXPORT);
            } catch (Exception e) {
                exportCallbackId = null;
                activity.callback(id, false, errorJson(e));
            }
        });
    }

    /** Fallback still photo through the system camera app (in-app camera is preferred). */
    @JavascriptInterface
    public void capturePhoto(String id, String path) {
        activity.runOnUiThread(() -> {
            try {
                cameraFile = workspace.unique(path == null || path.isEmpty() ? "camera/photo_" + System.currentTimeMillis() + ".jpg" : path);
                File p = cameraFile.getParentFile();
                if (p != null) //noinspection ResultOfMethodCallIgnored
                    p.mkdirs();
                Uri uri = WorkspaceProvider.uriFor(activity, cameraFile);
                Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                i.putExtra(MediaStore.EXTRA_OUTPUT, uri);
                i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                i.setClipData(android.content.ClipData.newRawUri("photo", uri));
                cameraCallbackId = id;
                activity.startActivityForResult(i, MainActivity.REQ_CAMERA);
            } catch (Exception e) {
                cameraCallbackId = null;
                activity.callback(id, false, errorJson(e));
            }
        });
    }

    void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == MainActivity.REQ_PICK && pickCallbackId != null) {
            String id = pickCallbackId;
            pickCallbackId = null;
            List<Uri> uris = new ArrayList<>();
            if (resultCode == Activity_RESULT_OK && data != null) {
                if (data.getClipData() != null)
                    for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
                else if (data.getData() != null) uris.add(data.getData());
            }
            async(id, () -> {
                JSONArray arr = new JSONArray();
                for (Uri u : uris) arr.put(importUri(u));
                JSONObject o = new JSONObject();
                o.put("files", arr);
                return o.toString();
            });
        } else if (requestCode == MainActivity.REQ_EXPORT && exportCallbackId != null) {
            String id = exportCallbackId, path = exportPath;
            exportCallbackId = null;
            if (resultCode != Activity_RESULT_OK || data == null || data.getData() == null) { activity.callback(id, false, "{\"error\":\"cancelled\"}"); return; }
            Uri dest = data.getData();
            async(id, () -> {
                try (InputStream in = new FileInputStream(workspace.resolve(path));
                     OutputStream out = activity.getContentResolver().openOutputStream(dest)) {
                    if (out == null) throw new java.io.IOException("cannot write destination");
                    Workspace.copy(in, out);
                }
                return "{\"ok\":true}";
            });
        } else if (requestCode == MainActivity.REQ_CAMERA && cameraCallbackId != null) {
            String id = cameraCallbackId;
            cameraCallbackId = null;
            if (resultCode == Activity_RESULT_OK && cameraFile != null && cameraFile.length() > 0) {
                try { activity.callback(id, true, ok("path", workspace.rel(cameraFile))); }
                catch (Exception e) { activity.callback(id, false, errorJson(e)); }
            } else {
                activity.callback(id, false, "{\"error\":\"No photo taken\"}");
            }
        }
    }

    private static final int Activity_RESULT_OK = android.app.Activity.RESULT_OK;

    /** Copies a content:// document into workspace/imports and returns its relative path. */
    String importUri(Uri u) throws Exception {
        String name = "file_" + System.currentTimeMillis();
        try (Cursor c = activity.getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && c.getString(0) != null) name = c.getString(0);
        } catch (Exception ignored) { }
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        File dest = workspace.unique("imports/" + name);
        File p = dest.getParentFile();
        if (p != null) //noinspection ResultOfMethodCallIgnored
            p.mkdirs();
        try (InputStream in = activity.getContentResolver().openInputStream(u); OutputStream out = new FileOutputStream(dest)) {
            if (in == null) throw new java.io.IOException("cannot read " + u);
            Workspace.copy(in, out);
        }
        return workspace.rel(dest);
    }

    /** Opens a workspace file in another app (image viewer, PDF reader, video player...). */
    @JavascriptInterface
    public String openFile(String path) {
        try {
            File f = workspace.resolve(path);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(WorkspaceProvider.uriFor(activity, f), MainActivity.mimeFor(f.getName()));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return "ok";
        } catch (ActivityNotFoundException e) {
            return "No app can open this file type";
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }

    @JavascriptInterface
    public String shareFile(String path) {
        try {
            File f = workspace.resolve(path);
            Uri uri = WorkspaceProvider.uriFor(activity, f);
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(MainActivity.mimeFor(f.getName()));
            i.putExtra(Intent.EXTRA_STREAM, uri);
            i.setClipData(android.content.ClipData.newRawUri(f.getName(), uri));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(i, "Share " + f.getName());
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(chooser);
            return "ok";
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }

    /** Binary-safe download into the workspace. req = {url, headers, path}; resolves {path, size, mime, status}. */
    @JavascriptInterface
    public void download(String id, String reqJson) {
        async(id, () -> {
            JSONObject req = new JSONObject(reqJson);
            URL url = new URL(req.getString("url"));
            if (!"http".equals(url.getProtocol()) && !"https".equals(url.getProtocol())) throw new IllegalArgumentException("Only http/https");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            if (req.optBoolean("dropAuthOnRedirect")) {
                // GitHub artifacts/logs/assets redirect to pre-signed storage URLs that reject the API token.
                c.setInstanceFollowRedirects(false);
                c.setRequestProperty("User-Agent", "NexusAgent/1.0 (Android; RayNeo)");
                JSONObject h0 = req.optJSONObject("headers");
                if (h0 != null) { Iterator<String> it = h0.keys(); while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h0.optString(k)); } }
                int st0 = c.getResponseCode();
                if (st0 >= 300 && st0 < 400 && c.getHeaderField("Location") != null) {
                    URL next = new URL(url, c.getHeaderField("Location"));
                    c.disconnect();
                    c = (HttpURLConnection) next.openConnection();
                    req.remove("headers");
                } else if (st0 >= 400) {
                    throw new java.io.IOException("HTTP " + st0);
                } else {
                    c.disconnect();                       // no redirect: request again normally
                    c = (HttpURLConnection) url.openConnection();
                }
            }
            try {
                c.setConnectTimeout(20000);
                c.setReadTimeout(120000);
                c.setInstanceFollowRedirects(true);
                c.setRequestProperty("User-Agent", "NexusAgent/1.0 (Android; RayNeo)");
                JSONObject h = req.optJSONObject("headers");
                if (h != null) { Iterator<String> it = h.keys(); while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.optString(k)); } }
                String method = req.optString("method", "GET").toUpperCase(Locale.ROOT);
                c.setRequestMethod(method);
                if (req.has("body") && !req.isNull("body") && !method.equals("GET")) {
                    byte[] bytes = req.getString("body").getBytes(StandardCharsets.UTF_8);
                    c.setDoOutput(true);
                    c.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
                }
                int status = c.getResponseCode();
                if (status >= 400) {
                    InputStream es = c.getErrorStream();
                    throw new java.io.IOException("HTTP " + status + (es == null ? "" : ": " + readAllSafe(es)));
                }
                String path = req.optString("path", "");
                if (path.isEmpty()) {
                    String name = url.getPath().replaceAll(".*/", "");
                    path = "downloads/" + (name.isEmpty() ? "download_" + System.currentTimeMillis() : name);
                }
                File dest = workspace.unique(path);
                File p = dest.getParentFile();
                if (p != null) //noinspection ResultOfMethodCallIgnored
                    p.mkdirs();
                long total = 0;
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(dest)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > 500L * 1024 * 1024) throw new java.io.IOException("Download larger than 500 MB; stopped");
                        out.write(buf, 0, n);
                    }
                }
                JSONObject o = new JSONObject();
                o.put("path", workspace.rel(dest));
                o.put("size", total);
                o.put("mime", c.getContentType());
                o.put("status", status);
                return o.toString();
            } finally {
                c.disconnect();
            }
        });
    }

    /**
     * multipart/form-data upload. spec = {url, headers, fields:{k:v}, files:[{field, path, name?, mime?}]}
     * resolves {status, body}. Used for Telegram files and audio transcription.
     */
    @JavascriptInterface
    public void upload(String id, String specJson) {
        async(id, () -> {
            JSONObject spec = new JSONObject(specJson);
            URL url = new URL(spec.getString("url"));
            if (!"https".equals(url.getProtocol()) && !"http".equals(url.getProtocol())) throw new IllegalArgumentException("Only http/https");
            String boundary = "----nexus" + System.nanoTime();
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            try {
                c.setConnectTimeout(20000);
                c.setReadTimeout(300000);
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setChunkedStreamingMode(65536);
                c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                c.setRequestProperty("User-Agent", "NexusAgent/1.0 (Android; RayNeo)");
                JSONObject h = spec.optJSONObject("headers");
                if (h != null) { Iterator<String> it = h.keys(); while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.optString(k)); } }
                try (OutputStream os = new java.io.BufferedOutputStream(c.getOutputStream())) {
                    JSONObject fields = spec.optJSONObject("fields");
                    if (fields != null) {
                        Iterator<String> it = fields.keys();
                        while (it.hasNext()) {
                            String k = it.next();
                            os.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + k + "\"\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                            os.write(fields.optString(k).getBytes(StandardCharsets.UTF_8));
                            os.write("\r\n".getBytes(StandardCharsets.UTF_8));
                        }
                    }
                    JSONArray files = spec.optJSONArray("files");
                    if (files != null) for (int i = 0; i < files.length(); i++) {
                        JSONObject f = files.getJSONObject(i);
                        File file = workspace.resolve(f.getString("path"));
                        String name = f.optString("name", file.getName()).replace("\"", "");
                        String mime = f.optString("mime", MainActivity.mimeFor(file.getName()));
                        os.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + f.getString("field") + "\"; filename=\"" + name + "\"\r\nContent-Type: " + mime + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                        try (InputStream in = new FileInputStream(file)) { Workspace.copy(in, os); }
                        os.write("\r\n".getBytes(StandardCharsets.UTF_8));
                    }
                    os.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
                }
                int status = c.getResponseCode();
                InputStream is = status >= 400 ? c.getErrorStream() : c.getInputStream();
                JSONObject o = new JSONObject();
                o.put("status", status);
                o.put("body", is == null ? "" : readAll(is));
                return o.toString();
            } finally {
                c.disconnect();
            }
        });
    }

    // ------------------------------------------------------------------ text to audio file

    private void finishUtterance(String id, boolean ok) {
        java.util.concurrent.CountDownLatch l = ttsDone.get(id);
        if (l != null) { ttsOk.put(id, ok); l.countDown(); }
        if (id.startsWith("say")) activity.emit("tts_state", "{\"speaking\":false}");
    }

    @JavascriptInterface
    public String ttsVoices() {
        try {
            JSONArray arr = new JSONArray();
            if (ttsReady && tts.getVoices() != null) for (android.speech.tts.Voice v : tts.getVoices()) {
                JSONObject o = new JSONObject();
                o.put("name", v.getName());
                o.put("locale", v.getLocale().toLanguageTag());
                o.put("offline", !v.isNetworkConnectionRequired());
                o.put("quality", v.getQuality());
                arr.put(o);
            }
            return arr.toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    /**
     * Offline speech synthesis to a WAV file with the device TTS engine. Long text is split
     * into chunks and the PCM data merged. spec {text, path, rate, pitch, voice, lang}
     */
    @JavascriptInterface
    public void ttsToFile(String id, String specJson) {
        async(id, () -> {
            if (!ttsReady) throw new IllegalStateException("No text-to-speech engine on this device");
            JSONObject s = new JSONObject(specJson);
            String text = s.getString("text");
            File out = workspace.unique(s.optString("path", "audio/speech_" + System.currentTimeMillis() + ".wav"));
            File parent = out.getParentFile();
            if (parent != null) //noinspection ResultOfMethodCallIgnored
                parent.mkdirs();
            synchronized (tts) {
                if (!s.optString("lang").isEmpty()) tts.setLanguage(Locale.forLanguageTag(s.optString("lang")));
                if (!s.optString("voice").isEmpty() && tts.getVoices() != null)
                    for (android.speech.tts.Voice v : tts.getVoices()) if (v.getName().equals(s.optString("voice"))) tts.setVoice(v);
                tts.setSpeechRate((float) s.optDouble("rate", 1.0));
                tts.setPitch((float) s.optDouble("pitch", 1.0));
                int max = Math.min(3500, TextToSpeech.getMaxSpeechInputLength() - 100);
                List<String> chunks = chunkText(text, max);
                List<File> parts = new ArrayList<>();
                try {
                    for (int i = 0; i < chunks.size(); i++) {
                        File part = new File(activity.getCacheDir(), "tts_" + System.nanoTime() + ".wav");
                        String uid = "file" + System.nanoTime();
                        java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
                        ttsDone.put(uid, latch);
                        int r = tts.synthesizeToFile(chunks.get(i), new Bundle(), part, uid);
                        if (r != TextToSpeech.SUCCESS) throw new IllegalStateException("TTS engine refused chunk " + (i + 1));
                        if (!latch.await(180, java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("TTS timeout");
                        ttsDone.remove(uid);
                        if (!Boolean.TRUE.equals(ttsOk.remove(uid))) throw new IllegalStateException("TTS failed on chunk " + (i + 1));
                        parts.add(part);
                        activity.emit("tts_progress", "{\"done\":" + (i + 1) + ",\"total\":" + chunks.size() + "}");
                    }
                    long ms = mergeWav(parts, out);
                    JSONObject o = new JSONObject();
                    o.put("path", workspace.rel(out));
                    o.put("size", out.length());
                    o.put("durationMs", ms);
                    o.put("chunks", chunks.size());
                    return o.toString();
                } finally {
                    for (File f : parts) //noinspection ResultOfMethodCallIgnored
                        f.delete();
                    tts.setSpeechRate(1.0f);
                    tts.setPitch(1.0f);
                }
            }
        });
    }

    static List<String> chunkText(String text, int max) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (String sentence : text.split("(?<=[.!?…。！？\\n])\\s+")) {
            if (cur.length() + sentence.length() + 1 > max && cur.length() > 0) { out.add(cur.toString()); cur.setLength(0); }
            while (sentence.length() > max) {
                int cut = sentence.lastIndexOf(' ', max);
                if (cut < max / 2) cut = max;
                if (cur.length() > 0) { out.add(cur.toString()); cur.setLength(0); }
                out.add(sentence.substring(0, cut).trim());
                sentence = sentence.substring(cut).trim();
            }
            if (cur.length() > 0) cur.append(' ');
            cur.append(sentence);
        }
        if (cur.toString().trim().length() > 0) out.add(cur.toString());
        return out;
    }

    /** Concatenates PCM WAV files that share one format; returns duration in ms. */
    static long mergeWav(List<File> parts, File out) throws java.io.IOException {
        byte[] fmt = null;
        java.io.ByteArrayOutputStream data = new java.io.ByteArrayOutputStream();
        for (File f : parts) {
            byte[] b = java.nio.file.Files.readAllBytes(f.toPath());
            int pos = 12;
            while (pos + 8 <= b.length) {
                String id = new String(b, pos, 4, StandardCharsets.US_ASCII);
                int len = (b[pos + 4] & 0xff) | (b[pos + 5] & 0xff) << 8 | (b[pos + 6] & 0xff) << 16 | (b[pos + 7] & 0xff) << 24;
                if (len < 0 || pos + 8 + len > b.length) len = b.length - pos - 8;
                if (id.equals("fmt ") && fmt == null) fmt = java.util.Arrays.copyOfRange(b, pos + 8, pos + 8 + len);
                if (id.equals("data")) data.write(b, pos + 8, len);
                pos += 8 + len + (len & 1);
            }
        }
        if (fmt == null) throw new java.io.IOException("TTS produced no audio");
        byte[] pcm = data.toByteArray();
        java.nio.ByteBuffer hb = java.nio.ByteBuffer.allocate(12 + 8 + fmt.length + 8).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        hb.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(4 + 8 + fmt.length + 8 + pcm.length).put("WAVE".getBytes(StandardCharsets.US_ASCII));
        hb.put("fmt ".getBytes(StandardCharsets.US_ASCII)).putInt(fmt.length).put(fmt);
        hb.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(pcm.length);
        try (OutputStream os = new FileOutputStream(out)) { os.write(hb.array()); os.write(pcm); }
        java.nio.ByteBuffer fb = java.nio.ByteBuffer.wrap(fmt).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        int byteRate = fmt.length >= 12 ? fb.getInt(8) : 0;
        return byteRate > 0 ? pcm.length * 1000L / byteRate : 0;
    }

    // ------------------------------------------------------------------ wake word ("Hey Nexus")

    @JavascriptInterface
    public boolean wakeModelInstalled(String name) { return WakeWordService.installed(activity, name); }

    /** Downloads and unpacks a Vosk model zip into app-private storage. Emits wake_model {pct}. */
    @JavascriptInterface
    public void wakeModelDownload(String id, String url, String name) {
        async(id, () -> {
            URL u = new URL(url);
            if (!"https".equals(u.getProtocol())) throw new IllegalArgumentException("https only");
            File zip = new File(activity.getCacheDir(), "vosk_" + System.nanoTime() + ".zip");
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            try {
                c.setConnectTimeout(20000);
                c.setReadTimeout(120000);
                c.setInstanceFollowRedirects(true);
                int st = c.getResponseCode();
                if (st >= 400) throw new java.io.IOException("HTTP " + st);
                long len = c.getContentLengthLong(), got = 0;
                int lastPct = -1;
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(zip)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        got += n;
                        int pct = len > 0 ? (int) (got * 100 / len) : -1;
                        if (pct != lastPct && pct % 5 == 0) { lastPct = pct; activity.emit("wake_model", "{\"pct\":" + pct + "}"); }
                    }
                }
            } finally { c.disconnect(); }
            File root = WakeWordService.modelsDir(activity);
            //noinspection ResultOfMethodCallIgnored
            root.mkdirs();
            String rootCanon = root.getCanonicalPath();
            try (java.util.zip.ZipFile zf = new java.util.zip.ZipFile(zip)) {
                java.util.Enumeration<? extends java.util.zip.ZipEntry> en = zf.entries();
                while (en.hasMoreElements()) {
                    java.util.zip.ZipEntry e = en.nextElement();
                    File t = new File(root, e.getName()).getCanonicalFile();
                    if (!t.getPath().startsWith(rootCanon + File.separator)) throw new java.io.IOException("unsafe zip entry");
                    if (e.isDirectory()) { //noinspection ResultOfMethodCallIgnored
                        t.mkdirs(); continue; }
                    File p = t.getParentFile();
                    if (p != null) //noinspection ResultOfMethodCallIgnored
                        p.mkdirs();
                    try (InputStream in = zf.getInputStream(e); OutputStream out = new FileOutputStream(t)) { Workspace.copy(in, out); }
                }
            } finally {
                //noinspection ResultOfMethodCallIgnored
                zip.delete();
            }
            if (!WakeWordService.installed(activity, name)) throw new java.io.IOException("Model unpacked but " + name + " not found in archive");
            return "{\"ok\":true}";
        });
    }

    /** spec {model: name, phrases: [...], commandMode: vosk|system}. Needs RECORD_AUDIO. */
    @JavascriptInterface
    public String wakeStart(String specJson) {
        try {
            if (!activity.hasMicPermission()) return "{\"error\":\"Microphone permission not granted\"}";
            JSONObject s = new JSONObject(specJson);
            String name = s.getString("model");
            if (!WakeWordService.installed(activity, name)) return "{\"error\":\"Speech model not installed\"}";
            Intent i = new Intent(activity, WakeWordService.class);
            i.putExtra("model", WakeWordService.modelDir(activity, name).getAbsolutePath());
            i.putExtra("phrases", s.getJSONArray("phrases").toString());
            i.putExtra("commandMode", s.optString("commandMode", "vosk"));
            if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(i); else activity.startService(i);
            return "{\"ok\":true}";
        } catch (Exception e) {
            return errorJson(e);
        }
    }

    @JavascriptInterface
    public void wakeStop() { activity.stopService(new Intent(activity, WakeWordService.class)); }

    @JavascriptInterface
    public boolean wakeRunning() { return WakeWordService.running(); }

    @JavascriptInterface
    public void wakePause(boolean p) { WakeWordService.pause(p); }

    @JavascriptInterface
    public void wakeSuspend() { WakeWordService.suspend(); }

    @JavascriptInterface
    public void wakeResume() { WakeWordService.resume(); }

    /** "Display over other apps" lets the wake word bring Nexus to the front from the background. */
    @JavascriptInterface
    public boolean canDrawOverlays() { return Build.VERSION.SDK_INT < 23 || android.provider.Settings.canDrawOverlays(activity); }

    @JavascriptInterface
    public void requestOverlay() {
        try {
            activity.startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + activity.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            glasses.openSettings("app");
        }
    }

    // ------------------------------------------------------------------ screen control (accessibility)

    @JavascriptInterface
    public boolean screenEnabled() { return NexusAccessibilityService.instance != null; }

    @JavascriptInterface
    public void screenOpenSettings() {
        try { activity.startActivity(new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public void screenBlocklist(String regex) { NexusAccessibilityService.setBlocklist(regex); }

    @JavascriptInterface
    public void screenIndicator(String text) {
        NexusAccessibilityService s = NexusAccessibilityService.instance;
        if (s == null) return;
        if (text == null || text.isEmpty()) s.hidePill(); else s.showPill(text);
    }

    /** Brings Nexus back to the front after a screen-control task. */
    @JavascriptInterface
    public void bringToFront() {
        activity.runOnUiThread(() -> {
            Intent i = new Intent(activity, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            try { activity.startActivity(i); } catch (Exception ignored) { }
        });
    }

    /**
     * spec {op: read|label|click|longclick|type|submit|scroll|swipe|tap|global|screenshot|foreground, ...}
     * Every acting op waits for the UI to settle.
     */
    @JavascriptInterface
    public void screen(String id, String specJson) {
        async(id, () -> {
            NexusAccessibilityService s = NexusAccessibilityService.instance;
            if (s == null) throw new IllegalStateException("Screen control is off. Enable \"Nexus Agent screen control\" in Android Settings → Accessibility.");
            JSONObject sp = new JSONObject(specJson);
            String op = sp.getString("op");
            String r;
            switch (op) {
                case "read": return s.snapshot(sp.optInt("max", 150));
                case "foreground": return ok("package", s.foreground());
                case "label": return ok("label", s.label(sp.getInt("id")));
                case "click": r = s.click(sp.getInt("id"), false); break;
                case "longclick": r = s.click(sp.getInt("id"), true); break;
                case "type": r = s.type(sp.getInt("id"), sp.getString("text"), sp.optBoolean("append")); break;
                case "submit": r = s.submit(sp.getInt("id")); break;
                case "scroll": r = s.scroll(sp.optInt("id", 0), sp.optString("direction", "down")); break;
                case "swipe": r = s.swipe(sp.getInt("x1"), sp.getInt("y1"), sp.getInt("x2"), sp.getInt("y2"), sp.optInt("ms", 300)); break;
                case "tap": r = s.tapAt(sp.getInt("x"), sp.getInt("y")); break;
                case "global": r = s.global(sp.optString("action", "back")); break;
                case "screenshot": {
                    File f = workspace.unique(sp.optString("path", "screens/screen_" + System.currentTimeMillis() + ".jpg"));
                    s.screenshot(f);
                    return ok("path", workspace.rel(f));
                }
                default: throw new IllegalArgumentException("unknown screen op " + op);
            }
            s.settle(sp.optInt("settleMs", 2500));
            return ok("result", r);
        });
    }

    // ------------------------------------------------------------------ music (any app's media session)

    @JavascriptInterface
    public String mediaSessions() {
        try { return music.list(); } catch (SecurityException e) { return "{\"error\":\"Notification access needed to see what is playing\"}"; } catch (Exception e) { return errorJson(e); }
    }

    @JavascriptInterface
    public String mediaControl(String pkg, String action, double value) {
        try { return music.control(pkg, action, (long) value); } catch (SecurityException e) { return mediaKey(action.equals("toggle") ? "play_pause" : action); } catch (Exception e) { return "Error: " + e.getMessage(); }
    }

    // ------------------------------------------------------------------ external display HUD (Lenovo & other display glasses)

    @JavascriptInterface
    public String externalDisplay() {
        android.view.Display d = activity.externalDisplay();
        if (d == null) return "{\"connected\":false}";
        android.util.DisplayMetrics m = new android.util.DisplayMetrics();
        d.getRealMetrics(m);
        return "{\"connected\":true,\"name\":" + JSONObject.quote(d.getName()) + ",\"width\":" + m.widthPixels + ",\"height\":" + m.heightPixels + ",\"refreshHz\":" + Math.round(d.getRefreshRate()) + ",\"hud\":" + (activity.hud != null) + "}";
    }

    @JavascriptInterface
    public String hudStart() { return activity.hudStart(); }

    @JavascriptInterface
    public void hudStop() { activity.hudStop(); }

    @JavascriptInterface
    public void hudPost(String json) { activity.hudPost(json); }

    // ------------------------------------------------------------------ Bluetooth audio glasses (Meta Ray-Ban & co.)

    /** Connected Bluetooth audio devices (no permission needed via AudioManager). */
    @JavascriptInterface
    public String btAudioDevices() {
        try {
            android.media.AudioManager am = (android.media.AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
            JSONArray arr = new JSONArray();
            java.util.Set<String> seen = new java.util.HashSet<>();
            for (android.media.AudioDeviceInfo d : am.getDevices(android.media.AudioManager.GET_DEVICES_ALL)) {
                int t = d.getType();
                boolean bt = t == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || t == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                        || (Build.VERSION.SDK_INT >= 31 && (t == android.media.AudioDeviceInfo.TYPE_BLE_HEADSET || t == android.media.AudioDeviceInfo.TYPE_BLE_SPEAKER));
                if (!bt) continue;
                String key = d.getProductName() + "|" + t + "|" + d.isSource();
                if (!seen.add(key)) continue;
                JSONObject o = new JSONObject();
                o.put("name", String.valueOf(d.getProductName()));
                o.put("kind", t == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ? "audio (A2DP)" : t == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO ? "call/mic (SCO)" : "LE audio");
                o.put("input", d.isSource());
                arr.put(o);
            }
            JSONObject res = new JSONObject();
            res.put("devices", arr);
            res.put("voiceRoute", Build.VERSION.SDK_INT >= 31 ? am.getCommunicationDevice() != null && am.getCommunicationDevice().getType() == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO : am.isBluetoothScoOn());
            res.put("tapToTalk", tapSession != null);
            return res.toString();
        } catch (Exception e) {
            return errorJson(e);
        }
    }

    /** Routes the microphone to a Bluetooth headset/glasses so voice input uses the glasses' mics. */
    @JavascriptInterface
    public String btVoiceRoute(boolean on) {
        android.media.AudioManager am = (android.media.AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                if (!on) { am.clearCommunicationDevice(); am.setMode(android.media.AudioManager.MODE_NORMAL); return "Voice back on the phone microphone"; }
                for (android.media.AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                    if (d.getType() == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO || d.getType() == android.media.AudioDeviceInfo.TYPE_BLE_HEADSET) {
                        am.setMode(android.media.AudioManager.MODE_IN_COMMUNICATION);
                        return am.setCommunicationDevice(d) ? "Voice routed to " + d.getProductName() : "Could not route voice to " + d.getProductName();
                    }
                }
                return "No Bluetooth headset/glasses with a microphone is connected";
            }
            if (on) { am.setMode(android.media.AudioManager.MODE_IN_COMMUNICATION); am.startBluetoothSco(); am.setBluetoothScoOn(true); return "Voice routed to the Bluetooth headset"; }
            am.setBluetoothScoOn(false); am.stopBluetoothSco(); am.setMode(android.media.AudioManager.MODE_NORMAL); return "Voice back on the phone microphone";
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }

    /**
     * "Tap the glasses to talk": owns the media-button route with a silent media session, so a
     * tap on the glasses (play/pause) opens Nexus voice input instead of pausing music.
     */
    @JavascriptInterface
    public String tapToTalk(boolean on) {
        activity.runOnUiThread(() -> {
            if (!on) {
                if (tapSession != null) { tapSession.setActive(false); tapSession.release(); tapSession = null; }
                if (silentTrack != null) { try { silentTrack.stop(); } catch (Exception ignored) { } silentTrack.release(); silentTrack = null; }
                return;
            }
            if (tapSession != null) return;
            tapSession = new android.media.session.MediaSession(activity, "NexusTapToTalk");
            tapSession.setCallback(new android.media.session.MediaSession.Callback() {
                @Override public boolean onMediaButtonEvent(Intent i) {
                    KeyEvent k = i.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                    if (k != null && k.getAction() == KeyEvent.ACTION_DOWN) {
                        String name = k.getKeyCode() == KeyEvent.KEYCODE_MEDIA_NEXT ? "media_next" : k.getKeyCode() == KeyEvent.KEYCODE_MEDIA_PREVIOUS ? "media_previous" : "voice";
                        activity.emit("hwkey", "{\"key\":\"" + name + "\",\"source\":\"bluetooth\"}");
                    }
                    return true;
                }
            });
            tapSession.setPlaybackState(new android.media.session.PlaybackState.Builder()
                    .setActions(android.media.session.PlaybackState.ACTION_PLAY_PAUSE | android.media.session.PlaybackState.ACTION_PLAY | android.media.session.PlaybackState.ACTION_PAUSE
                            | android.media.session.PlaybackState.ACTION_SKIP_TO_NEXT | android.media.session.PlaybackState.ACTION_SKIP_TO_PREVIOUS)
                    .setState(android.media.session.PlaybackState.STATE_PLAYING, 0, 1f).build());
            tapSession.setActive(true);
            // A short silent track makes this the most recent media app, so buttons route here.
            int rate = 8000;
            silentTrack = new android.media.AudioTrack.Builder()
                    .setAudioAttributes(new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_MEDIA).setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC).build())
                    .setAudioFormat(new android.media.AudioFormat.Builder().setEncoding(android.media.AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(android.media.AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(android.media.AudioTrack.MODE_STATIC).setBufferSizeInBytes(rate * 2).build();
            silentTrack.write(new short[rate], 0, rate);
            silentTrack.play();
        });
        return on ? "Tap-to-talk on: tap your glasses (play/pause) to talk to Nexus" : "Tap-to-talk off";
    }

    // ------------------------------------------------------------------ photos/videos from the gallery (e.g. Meta glasses captures)

    /** spec {count, type: photo|video|any, sinceMs, folderHint} — newest first. */
    @JavascriptInterface
    public void recentMedia(String id, String specJson) {
        async(id, () -> {
            String perm = Build.VERSION.SDK_INT >= 33 ? android.Manifest.permission.READ_MEDIA_IMAGES : android.Manifest.permission.READ_EXTERNAL_STORAGE;
            if (!activity.hasPermission(perm)) throw new SecurityException("Photo library permission not granted");
            JSONObject s = new JSONObject(specJson);
            String type = s.optString("type", "any");
            String hint = s.optString("folderHint", "").toLowerCase(Locale.ROOT);
            Uri base = android.provider.MediaStore.Files.getContentUri("external");
            String[] proj = {android.provider.MediaStore.MediaColumns._ID, android.provider.MediaStore.MediaColumns.DISPLAY_NAME, android.provider.MediaStore.MediaColumns.MIME_TYPE,
                    android.provider.MediaStore.MediaColumns.DATE_ADDED, android.provider.MediaStore.MediaColumns.BUCKET_DISPLAY_NAME, android.provider.MediaStore.MediaColumns.SIZE,
                    android.provider.MediaStore.Files.FileColumns.MEDIA_TYPE};
            String sel = android.provider.MediaStore.Files.FileColumns.MEDIA_TYPE + (type.equals("photo") ? "=1" : type.equals("video") ? "=3" : " IN (1,3)")
                    + " AND " + android.provider.MediaStore.MediaColumns.DATE_ADDED + ">=?";
            JSONArray arr = new JSONArray();
            int want = Math.max(1, Math.min(s.optInt("count", 5), 50));
            try (Cursor c = activity.getContentResolver().query(base, proj, sel, new String[]{String.valueOf(s.optLong("sinceMs", 0) / 1000)},
                    android.provider.MediaStore.MediaColumns.DATE_ADDED + " DESC")) {
                while (c != null && c.moveToNext() && arr.length() < want) {
                    String bucket = c.getString(4) == null ? "" : c.getString(4);
                    if (!hint.isEmpty() && !java.util.regex.Pattern.compile(hint).matcher(bucket.toLowerCase(Locale.ROOT) + " " + c.getString(1).toLowerCase(Locale.ROOT)).find()) continue;
                    boolean video = c.getInt(6) == 3;
                    Uri u = android.content.ContentUris.withAppendedId(video ? android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI : android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, c.getLong(0));
                    JSONObject o = new JSONObject();
                    o.put("uri", u.toString());
                    o.put("name", c.getString(1));
                    o.put("mime", c.getString(2));
                    o.put("time", c.getLong(3) * 1000);
                    o.put("album", bucket);
                    o.put("size", c.getLong(5));
                    arr.put(o);
                }
            }
            return arr.toString();
        });
    }

    /** Copies a gallery item (content:// from recentMedia) into the workspace; resolves {path}. */
    @JavascriptInterface
    public void importMedia(String id, String uri) {
        async(id, () -> {
            if (!uri.startsWith("content://media/")) throw new IllegalArgumentException("Only gallery items can be imported");
            return ok("path", importUri(Uri.parse(uri)));
        });
    }

    /** Streams a workspace file as the raw request body. spec {url, method, headers, path}; resolves {status, body}. */
    @JavascriptInterface
    public void uploadRaw(String id, String specJson) {
        async(id, () -> {
            JSONObject sp = new JSONObject(specJson);
            URL url = new URL(sp.getString("url"));
            if (!"https".equals(url.getProtocol())) throw new IllegalArgumentException("https only");
            File f = workspace.resolve(sp.getString("path"));
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            try {
                c.setConnectTimeout(20000);
                c.setReadTimeout(300000);
                c.setRequestMethod(sp.optString("method", "POST"));
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(f.length());
                c.setRequestProperty("Content-Type", MainActivity.mimeFor(f.getName()));
                JSONObject h = sp.optJSONObject("headers");
                if (h != null) { Iterator<String> it = h.keys(); while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.optString(k)); } }
                try (InputStream in = new FileInputStream(f); OutputStream os = c.getOutputStream()) { Workspace.copy(in, os); }
                int st = c.getResponseCode();
                InputStream is = st >= 400 ? c.getErrorStream() : c.getInputStream();
                JSONObject o = new JSONObject();
                o.put("status", st);
                o.put("body", is == null ? "" : readAll(is));
                return o.toString();
            } finally { c.disconnect(); }
        });
    }

    // ------------------------------------------------------------------ OAuth loopback (Google sign-in)

    private final Map<Integer, java.net.ServerSocket> oauthSockets = new java.util.concurrent.ConcurrentHashMap<>();

    /** Opens a one-shot listener on 127.0.0.1:<random port> for an OAuth redirect; returns the port. */
    @JavascriptInterface
    public int oauthStart() {
        try {
            java.net.ServerSocket ss = new java.net.ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
            oauthSockets.put(ss.getLocalPort(), ss);
            return ss.getLocalPort();
        } catch (Exception e) {
            return -1;
        }
    }

    /** Waits for the browser redirect; resolves {query} and brings Nexus back to the front. */
    @JavascriptInterface
    public void oauthWait(String id, int port, int timeoutMs) {
        async(id, () -> {
            java.net.ServerSocket ss = oauthSockets.get(port);
            if (ss == null) throw new IllegalStateException("No sign-in in progress");
            try {
                ss.setSoTimeout(Math.max(10000, Math.min(timeoutMs, 600000)));
                while (true) {
                    try (java.net.Socket sock = ss.accept()) {
                        sock.setSoTimeout(10000);
                        InputStream in = sock.getInputStream();
                        StringBuilder line = new StringBuilder();
                        int c;
                        while ((c = in.read()) != -1 && c != '\n') line.append((char) c);
                        String[] parts = line.toString().trim().split(" ");
                        String target = parts.length > 1 ? parts[1] : "/";
                        if (target.startsWith("/favicon")) { sock.getOutputStream().write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.UTF_8)); continue; }
                        String html = "<!doctype html><meta name=viewport content='width=device-width'><body style='font-family:sans-serif;background:#000;color:#e6f7ff;text-align:center;padding:3em'><h2>✅ Signed in</h2><p>You can return to Nexus Agent.</p></body>";
                        byte[] b = html.getBytes(StandardCharsets.UTF_8);
                        sock.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                        sock.getOutputStream().write(b);
                        sock.getOutputStream().flush();
                        int q = target.indexOf('?');
                        bringToFront();
                        return ok("query", q >= 0 ? target.substring(q + 1) : "");
                    }
                }
            } finally {
                oauthSockets.remove(port);
                try { ss.close(); } catch (Exception ignored) { }
            }
        });
    }

    @JavascriptInterface
    public void oauthCancel(int port) {
        java.net.ServerSocket ss = oauthSockets.remove(port);
        if (ss != null) try { ss.close(); } catch (Exception ignored) { }
    }

    // ------------------------------------------------------------------ APKs & app integrations

    @JavascriptInterface
    public void apk(String id, String specJson) {
        async(id, () -> {
            JSONObject s = new JSONObject(specJson);
            switch (s.getString("op")) {
                case "list": return apk.list(s.optBoolean("system"), s.optString("filter"));
                case "extract": return apk.extract(s.getString("package"));
                case "inspect": return apk.inspect(s.getString("ref"));
                case "integrations": return apk.integrations(s.getString("ref"));
                case "install": return ok("result", apk.install(s.getString("path")));
                case "uninstall": return ok("result", apk.uninstall(s.getString("package")));
                default: throw new IllegalArgumentException("unknown apk op");
            }
        });
    }

    // ------------------------------------------------------------------ rendered scraping (hidden WebView)

    /** Loads a page in a hidden, isolated WebView (JavaScript on, no bridge) and returns the rendered HTML. */
    @JavascriptInterface
    public void renderPage(String id, String url, int waitMs) {
        activity.runOnUiThread(() -> {
            try {
                Uri u = Uri.parse(url);
                if (!"https".equals(u.getScheme()) && !"http".equals(u.getScheme())) throw new IllegalArgumentException("http(s) only");
                android.webkit.WebView w = new android.webkit.WebView(activity);
                android.webkit.WebSettings st = w.getSettings();
                st.setJavaScriptEnabled(true);
                st.setDomStorageEnabled(true);
                st.setAllowFileAccess(false);
                st.setAllowContentAccess(false);
                st.setLoadsImagesAutomatically(false);
                st.setBlockNetworkImage(true);
                w.setAlpha(0f);
                w.setTranslationX(-20000f);
                ((android.view.ViewGroup) activity.getWindow().getDecorView()).addView(w, new android.view.ViewGroup.LayoutParams(1080, 2400));
                final boolean[] done = {false};
                final android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
                Runnable finish = () -> {
                    if (done[0]) return;
                    done[0] = true;
                    w.evaluateJavascript("JSON.stringify({html: document.documentElement.outerHTML, url: location.href, title: document.title})", v -> {
                        try {
                            String json = new org.json.JSONTokener(v).nextValue().toString();
                            activity.callback(id, true, json);
                        } catch (Exception e) {
                            activity.callback(id, false, errorJson(e));
                        }
                        ((android.view.ViewGroup) activity.getWindow().getDecorView()).removeView(w);
                        w.destroy();
                    });
                };
                w.setWebViewClient(new android.webkit.WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(android.webkit.WebView v, android.webkit.WebResourceRequest r) {
                        String sc = r.getUrl().getScheme();
                        return !("http".equals(sc) || "https".equals(sc));   // never launch apps/intents
                    }
                    @Override public void onPageFinished(android.webkit.WebView v, String f) { h.postDelayed(finish, Math.max(500, Math.min(waitMs, 20000))); }
                });
                h.postDelayed(finish, 45000);
                w.loadUrl(url);
            } catch (Exception e) {
                activity.callback(id, false, errorJson(e));
            }
        });
    }

    // ------------------------------------------------------------------ system download manager

    @JavascriptInterface
    public String systemDownload(String url, String fileName, String headersJson) {
        try {
            android.app.DownloadManager dm = (android.app.DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            android.app.DownloadManager.Request r = new android.app.DownloadManager.Request(Uri.parse(url));
            String name = (fileName == null || fileName.isEmpty() ? Uri.parse(url).getLastPathSegment() : fileName);
            if (name == null || name.isEmpty()) name = "download_" + System.currentTimeMillis();
            name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            r.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, "Nexus/" + name);
            r.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setTitle(name);
            if (headersJson != null && !headersJson.isEmpty()) {
                JSONObject h = new JSONObject(headersJson);
                Iterator<String> it = h.keys();
                while (it.hasNext()) { String k = it.next(); r.addRequestHeader(k, h.optString(k)); }
            }
            long dl = dm.enqueue(r);
            return "{\"id\":" + dl + ",\"file\":" + JSONObject.quote("Download/Nexus/" + name) + "}";
        } catch (Exception e) {
            return errorJson(e);
        }
    }

    @JavascriptInterface
    public String systemDownloadStatus(String idsJson) {
        try {
            android.app.DownloadManager dm = (android.app.DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            JSONArray ids = new JSONArray(idsJson);
            long[] arr = new long[ids.length()];
            for (int i = 0; i < arr.length; i++) arr[i] = ids.getLong(i);
            JSONArray out = new JSONArray();
            try (Cursor c = dm.query(new android.app.DownloadManager.Query().setFilterById(arr))) {
                while (c != null && c.moveToNext()) {
                    JSONObject o = new JSONObject();
                    o.put("id", c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_ID)));
                    o.put("title", c.getString(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_TITLE)));
                    int st = c.getInt(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_STATUS));
                    o.put("status", st == android.app.DownloadManager.STATUS_SUCCESSFUL ? "done" : st == android.app.DownloadManager.STATUS_FAILED ? "failed" : st == android.app.DownloadManager.STATUS_PAUSED ? "paused" : st == android.app.DownloadManager.STATUS_PENDING ? "pending" : "running");
                    o.put("bytes", c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)));
                    o.put("total", c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_TOTAL_SIZE_BYTES)));
                    o.put("reason", c.getInt(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_REASON)));
                    out.put(o);
                }
            }
            return out.toString();
        } catch (Exception e) {
            return errorJson(e);
        }
    }

    /** Copies a finished system download into the workspace. */
    @JavascriptInterface
    public void systemDownloadImport(String id, long dlId) {
        async(id, () -> {
            android.app.DownloadManager dm = (android.app.DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            Uri u = dm.getUriForDownloadedFile(dlId);
            if (u == null) throw new IllegalStateException("Download not finished");
            return ok("path", importUri(u));
        });
    }

    // ------------------------------------------------------------------ hand files to other apps / the gallery

    /** Shares workspace files directly to one app (no chooser). spec {paths, package, mime}. */
    @JavascriptInterface
    public String shareFilesTo(String specJson) {
        try {
            JSONObject s = new JSONObject(specJson);
            JSONArray paths = s.getJSONArray("paths");
            ArrayList<Uri> uris = new ArrayList<>();
            for (int i = 0; i < paths.length(); i++) uris.add(WorkspaceProvider.uriFor(activity, workspace.resolve(paths.getString(i))));
            if (uris.isEmpty()) return "No files";
            Intent i = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
            String mime = s.optString("mime", "");
            if (mime.isEmpty()) mime = uris.size() == 1 ? MainActivity.mimeFor(paths.getString(0)) : "*/*";
            i.setType(mime);
            if (uris.size() == 1) i.putExtra(Intent.EXTRA_STREAM, uris.get(0)); else i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            android.content.ClipData clip = android.content.ClipData.newRawUri("files", uris.get(0));
            for (int k = 1; k < uris.size(); k++) clip.addItem(new android.content.ClipData.Item(uris.get(k)));
            i.setClipData(clip);
            if (!s.optString("package").isEmpty()) i.setPackage(s.optString("package"));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(s.optString("package").isEmpty() ? Intent.createChooser(i, "Send to").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION) : i);
            return "ok";
        } catch (ActivityNotFoundException e) {
            return "That app does not accept these files";
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }

    /**
     * Saves a workspace file into shared storage (Pictures/Movies/Music/Download, subfolder Nexus) so
     * the gallery and backup apps (Google Photos, Verizon Cloud, Samsung Cloud…) pick it up.
     */
    @JavascriptInterface
    public void saveToMediaStore(String id, String specJson) {
        async(id, () -> {
            if (Build.VERSION.SDK_INT < 29) throw new UnsupportedOperationException("Needs Android 10 or newer");
            JSONObject s = new JSONObject(specJson);
            File f = workspace.resolve(s.getString("path"));
            String mime = MainActivity.mimeFor(f.getName());
            String kind = s.optString("kind", mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "download");
            Uri coll; String dir;
            switch (kind) {
                case "image": coll = android.provider.MediaStore.Images.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY); dir = android.os.Environment.DIRECTORY_PICTURES; break;
                case "video": coll = android.provider.MediaStore.Video.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY); dir = android.os.Environment.DIRECTORY_MOVIES; break;
                case "audio": coll = android.provider.MediaStore.Audio.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY); dir = android.os.Environment.DIRECTORY_MUSIC; break;
                default: coll = android.provider.MediaStore.Downloads.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY); dir = android.os.Environment.DIRECTORY_DOWNLOADS;
            }
            String folder = s.optString("folder", "Nexus").replaceAll("[^\\w .-]", "_");
            android.content.ContentValues v = new android.content.ContentValues();
            v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, f.getName());
            v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, dir + "/" + folder);
            v.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1);
            android.content.ContentResolver cr = activity.getContentResolver();
            Uri u = cr.insert(coll, v);
            if (u == null) throw new java.io.IOException("Could not create the file in shared storage");
            try (InputStream in = new FileInputStream(f); OutputStream out = cr.openOutputStream(u)) {
                if (out == null) throw new java.io.IOException("cannot write");
                Workspace.copy(in, out);
            }
            v.clear();
            v.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(u, v, null, null);
            JSONObject o = new JSONObject();
            o.put("uri", u.toString());
            o.put("location", dir + "/" + folder + "/" + f.getName());
            return o.toString();
        });
    }

    // ------------------------------------------------------------------ glasses / device

    @JavascriptInterface
    public String deviceStatus() { try { return glasses.status(); } catch (Exception e) { return errorJson(e); } }

    @JavascriptInterface
    public String setVolume(int percent) { return glasses.setVolume(percent); }

    @JavascriptInterface
    public String mediaKey(String action) { return glasses.mediaKey(action); }

    /** 0..1 for this app's display, -1 for the system setting. */
    @JavascriptInterface
    public String setBrightness(float v) { activity.setWindowBrightness(v); return v < 0 ? "brightness: system" : "brightness " + Math.round(v * 100) + "%"; }

    @JavascriptInterface
    public String openSettings(String panel) { return glasses.openSettings(panel); }

    @JavascriptInterface
    public void headPose(String id) { activity.runOnUiThread(() -> glasses.headPose((ok, j) -> activity.callback(id, ok, j))); }

    @JavascriptInterface
    public void headGesture(String id, int timeoutMs) { activity.runOnUiThread(() -> glasses.headGesture(timeoutMs, (ok, j) -> activity.callback(id, ok, j))); }

    @JavascriptInterface
    public boolean notificationAccess() {
        String flat = android.provider.Settings.Secure.getString(activity.getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(activity.getPackageName());
    }

    @JavascriptInterface
    public String notificationsList(int limit) { return NexusNotificationListener.list(Math.max(1, Math.min(limit, 150))); }

    @JavascriptInterface
    public boolean notificationDismiss(String key) { return NexusNotificationListener.dismiss(key); }

    // ------------------------------------------------------------------ zip & video

    /** spec {op:create|extract|list, ...}; see MediaTools. */
    @JavascriptInterface
    public void zip(String id, String specJson) { async(id, () -> media.zip(new JSONObject(specJson))); }

    /** spec {op:info|frames|trim|audio|mute, path, ...}; see MediaTools. */
    @JavascriptInterface
    public void video(String id, String specJson) { async(id, () -> media.video(new JSONObject(specJson))); }

    // ------------------------------------------------------------------ email & calendar

    /** IMAP/SMTP; spec {op: test|folders|list|read|modify|send, account:{...}, ...}. See EmailClient. */
    @JavascriptInterface
    public void email(String id, String specJson) { async(id, () -> email.run(new JSONObject(specJson))); }

    /** Opens the user's mail app with a draft (they review and tap send). Attachments are workspace paths. */
    @JavascriptInterface
    public String composeEmail(String specJson) {
        try {
            JSONObject s = new JSONObject(specJson);
            JSONArray atts = s.optJSONArray("attachments");
            Intent i;
            if (atts != null && atts.length() > 0) {
                ArrayList<Uri> uris = new ArrayList<>();
                for (int k = 0; k < atts.length(); k++) uris.add(WorkspaceProvider.uriFor(activity, workspace.resolve(atts.getString(k))));
                i = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
                i.setType("message/rfc822");
                if (uris.size() == 1) i.putExtra(Intent.EXTRA_STREAM, uris.get(0));
                else i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                android.content.ClipData clip = android.content.ClipData.newRawUri("attachment", uris.get(0));
                for (int k = 1; k < uris.size(); k++) clip.addItem(new android.content.ClipData.Item(uris.get(k)));
                i.setClipData(clip);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                i = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"));
            }
            i.putExtra(Intent.EXTRA_EMAIL, split(s.optString("to")));
            i.putExtra(Intent.EXTRA_CC, split(s.optString("cc")));
            i.putExtra(Intent.EXTRA_BCC, split(s.optString("bcc")));
            i.putExtra(Intent.EXTRA_SUBJECT, s.optString("subject"));
            i.putExtra(Intent.EXTRA_TEXT, s.optString("body"));
            Intent chooser = Intent.createChooser(i, "Send email");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(chooser);
            return "Email draft opened in the mail app";
        } catch (ActivityNotFoundException e) {
            return "No email app on this device. Add an email account in Nexus settings to send directly.";
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }

    private static String[] split(String list) {
        if (list == null || list.trim().isEmpty()) return new String[0];
        String[] p = list.split("[,;]");
        for (int i = 0; i < p.length; i++) p[i] = p[i].trim();
        return p;
    }

    /** Android device calendars; spec {op: calendars|events|create|update|delete, ...}. Needs calendar permissions. */
    @JavascriptInterface
    public void calendar(String id, String specJson) {
        async(id, () -> {
            JSONObject s = new JSONObject(specJson);
            boolean write = !s.optString("op").equals("calendars") && !s.optString("op").equals("events");
            String perm = write ? android.Manifest.permission.WRITE_CALENDAR : android.Manifest.permission.READ_CALENDAR;
            if (!activity.hasPermission(perm)) throw new SecurityException("Calendar permission not granted");
            return calendar.run(s);
        });
    }

    /** Opens the calendar app's "new event" screen pre-filled (no permission needed). */
    @JavascriptInterface
    public String calendarInsertIntent(String eventJson) {
        try {
            JSONObject e = new JSONObject(eventJson);
            Intent i = new Intent(Intent.ACTION_INSERT).setData(android.provider.CalendarContract.Events.CONTENT_URI);
            i.putExtra(android.provider.CalendarContract.Events.TITLE, e.optString("title"));
            i.putExtra(android.provider.CalendarContract.Events.DESCRIPTION, e.optString("description"));
            i.putExtra(android.provider.CalendarContract.Events.EVENT_LOCATION, e.optString("location"));
            if (e.has("startMs")) i.putExtra(android.provider.CalendarContract.EXTRA_EVENT_BEGIN_TIME, e.getLong("startMs"));
            if (e.has("endMs")) i.putExtra(android.provider.CalendarContract.EXTRA_EVENT_END_TIME, e.getLong("endMs"));
            i.putExtra(android.provider.CalendarContract.EXTRA_EVENT_ALL_DAY, e.optBoolean("allDay"));
            if (!e.optString("rrule").isEmpty()) i.putExtra(android.provider.CalendarContract.Events.RRULE, e.optString("rrule"));
            JSONArray att = e.optJSONArray("attendees");
            if (att != null && att.length() > 0) {
                StringBuilder sb = new StringBuilder();
                for (int k = 0; k < att.length(); k++) { if (k > 0) sb.append(','); sb.append(att.getString(k)); }
                i.putExtra(Intent.EXTRA_EMAIL, sb.toString());
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return "Calendar app opened with the event filled in (tap save)";
        } catch (ActivityNotFoundException e) {
            return "No calendar app on this device";
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }

    // ------------------------------------------------------------------ location

    /** Resolves {lat, lon, accuracy, time, provider}. Requires a location permission. */
    @JavascriptInterface
    public void getLocation(String id) {
        activity.runOnUiThread(() -> {
            try {
                if (!activity.hasPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                        && !activity.hasPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION))
                    throw new SecurityException("Location permission not granted");
                LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
                Location best = null;
                for (String prov : lm.getProviders(true)) {
                    @SuppressWarnings("MissingPermission") Location l = lm.getLastKnownLocation(prov);
                    if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
                }
                final Location last = best;
                if (last != null && System.currentTimeMillis() - last.getTime() < 2 * 60 * 1000) {
                    activity.callback(id, true, locJson(last));
                    return;
                }
                String prov = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ? LocationManager.NETWORK_PROVIDER
                        : lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : null;
                if (prov == null) {
                    if (last != null) activity.callback(id, true, locJson(last));
                    else throw new IllegalStateException("Location is turned off");
                    return;
                }
                final boolean[] done = {false};
                android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
                h.postDelayed(() -> {
                    if (done[0]) return;
                    done[0] = true;
                    if (last != null) activity.callback(id, true, locJson(last));
                    else activity.callback(id, false, "{\"error\":\"Location timeout\"}");
                }, 20000);
                if (Build.VERSION.SDK_INT >= 30) {
                    //noinspection MissingPermission
                    lm.getCurrentLocation(prov, null, activity.getMainExecutor(), l -> {
                        if (done[0]) return;
                        done[0] = true;
                        if (l != null) activity.callback(id, true, locJson(l));
                        else if (last != null) activity.callback(id, true, locJson(last));
                        else activity.callback(id, false, "{\"error\":\"No location fix\"}");
                    });
                } else {
                    //noinspection deprecation,MissingPermission
                    lm.requestSingleUpdate(prov, new android.location.LocationListener() {
                        public void onLocationChanged(Location l) {
                            if (done[0]) return;
                            done[0] = true;
                            activity.callback(id, true, locJson(l));
                        }
                        public void onStatusChanged(String p, int s, Bundle b) { }
                        public void onProviderEnabled(String p) { }
                        public void onProviderDisabled(String p) { }
                    }, android.os.Looper.getMainLooper());
                }
            } catch (Exception e) {
                activity.callback(id, false, errorJson(e));
            }
        });
    }

    private static String locJson(Location l) {
        try {
            JSONObject o = new JSONObject();
            o.put("lat", l.getLatitude());
            o.put("lon", l.getLongitude());
            o.put("accuracy", l.getAccuracy());
            o.put("time", l.getTime());
            o.put("provider", l.getProvider());
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    // ------------------------------------------------------------------ contacts, calls, SMS

    /** Resolves [{name, number, type}]. Requires READ_CONTACTS. */
    @JavascriptInterface
    public void contactsSearch(String id, String query) {
        async(id, () -> {
            if (!activity.hasPermission(android.Manifest.permission.READ_CONTACTS)) throw new SecurityException("Contacts permission not granted");
            JSONArray arr = new JSONArray();
            String[] proj = {ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER, ContactsContract.CommonDataKinds.Phone.TYPE};
            String sel = ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?";
            try (Cursor c = activity.getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, proj, sel,
                    new String[]{"%" + query + "%"}, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC")) {
                while (c != null && c.moveToNext() && arr.length() < 25) {
                    JSONObject o = new JSONObject();
                    o.put("name", c.getString(0));
                    o.put("number", c.getString(1));
                    o.put("type", String.valueOf(ContactsContract.CommonDataKinds.Phone.getTypeLabel(activity.getResources(), c.getInt(2), "")));
                    arr.put(o);
                }
            }
            return arr.toString();
        });
    }

    /** direct=true places the call (needs CALL_PHONE); otherwise opens the dialer pre-filled. */
    @JavascriptInterface
    public String phoneCall(String number, boolean direct) {
        try {
            Uri uri = Uri.fromParts("tel", number, null);
            boolean canCall = direct && activity.hasPermission(android.Manifest.permission.CALL_PHONE);
            Intent i = new Intent(canCall ? Intent.ACTION_CALL : Intent.ACTION_DIAL, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return canCall ? "Calling " + number : "Dialer opened with " + number + " (tap call to connect)";
        } catch (ActivityNotFoundException e) {
            return "No phone/dialer app on this device. On RayNeo glasses, place calls from the paired phone.";
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }

    /** Opens the messaging app with recipient and text filled in (the user taps send). */
    @JavascriptInterface
    public String openSms(String number, String body) {
        try {
            Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(number)));
            i.putExtra("sms_body", body);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return "Messaging app opened";
        } catch (ActivityNotFoundException e) {
            return "No messaging app on this device";
        }
    }

    // ------------------------------------------------------------------ helpers

    /** All non-loopback IPv4 addresses (Wi-Fi, hotspot, mobile data, VPNs such as Tailscale). */
    static java.util.List<String> localIps() {
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && !out.contains(a.getHostAddress())) out.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    @JavascriptInterface
    public String displayMode() { return GlassesDisplay.describe(activity); }

    /** key: mirror | temple; mode: auto | on | off. */
    @JavascriptInterface
    public void setDisplayMode(String key, String mode) { GlassesDisplay.set(activity, key, mode); }

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
