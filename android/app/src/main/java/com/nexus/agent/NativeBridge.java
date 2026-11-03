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
import android.webkit.JavascriptInterface;
import android.widget.Toast;

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
    private String pickCallbackId, exportCallbackId, exportPath, cameraCallbackId;
    private File cameraFile;

    NativeBridge(MainActivity activity) {
        this.activity = activity;
        this.workspace = new Workspace(activity);
        this.media = new MediaTools(workspace);
        this.email = new EmailClient(workspace);
        this.calendar = new CalendarTools(activity);
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
            try {
                c.setConnectTimeout(20000);
                c.setReadTimeout(120000);
                c.setInstanceFollowRedirects(true);
                c.setRequestProperty("User-Agent", "NexusAgent/1.0 (Android; RayNeo)");
                JSONObject h = req.optJSONObject("headers");
                if (h != null) { Iterator<String> it = h.keys(); while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.optString(k)); } }
                int status = c.getResponseCode();
                if (status >= 400) throw new java.io.IOException("HTTP " + status);
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
