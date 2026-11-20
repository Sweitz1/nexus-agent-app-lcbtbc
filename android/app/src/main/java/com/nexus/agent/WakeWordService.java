package com.nexus.agent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;

import java.io.File;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Offline "Hey Nexus" wake word (Vosk). Listens with a tiny phrase grammar, so audio never
 * leaves the device. After the wake phrase it either transcribes the command offline
 * (commandMode "vosk") or hands the microphone to the system recognizer ("system").
 * Runs as a microphone foreground service so it keeps listening with the screen off.
 */
public class WakeWordService extends Service implements RecognitionListener {

    interface Sink { void event(JSONObject e); }

    static volatile Sink sink;
    static volatile WakeWordService instance;

    private static final String CH_RUN = "wake_listening", CH_ALERT = "wake_alert";
    private final Handler main = new Handler(Looper.getMainLooper());
    private Model model;
    private SpeechService speech;
    private Recognizer rec;
    private String grammar;
    private Pattern trigger;
    private String commandMode = "vosk";
    private volatile boolean capturing, suspended;
    private Runnable captureTimeout;

    static boolean running() { return instance != null; }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        instance = this;
        startForegroundCompat();
        if (intent != null && intent.hasExtra("model")) {
            String modelPath = intent.getStringExtra("model");
            commandMode = intent.getStringExtra("commandMode") == null ? "vosk" : intent.getStringExtra("commandMode");
            try {
                JSONArray phrases = new JSONArray(intent.getStringExtra("phrases"));
                StringBuilder re = new StringBuilder();
                JSONArray g = new JSONArray();
                for (int i = 0; i < phrases.length(); i++) {
                    String p = phrases.getString(i).toLowerCase(Locale.ROOT).trim();
                    if (p.isEmpty()) continue;
                    g.put(p);
                    if (re.length() > 0) re.append('|');
                    re.append(Pattern.quote(p));
                }
                g.put("[unk]");
                grammar = g.toString();
                trigger = Pattern.compile("(^|\\s)(" + re + ")(\\s|$)");
            } catch (Exception e) {
                grammar = "[\"hey nexus\", \"[unk]\"]";
                trigger = Pattern.compile("hey nexus");
            }
            new Thread(() -> {
                try {
                    if (model != null) model.close();
                    model = new Model(modelPath);
                    main.post(this::listenForWake);
                    send("ready", null);
                } catch (Exception e) {
                    send("error", "Could not load speech model: " + e.getMessage());
                    stopSelf();
                }
            }, "vosk-load").start();
        }
        return START_STICKY;
    }

    private void startForegroundCompat() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CH_RUN, "Wake word listening", NotificationManager.IMPORTANCE_LOW));
            nm.createNotificationChannel(new NotificationChannel(CH_ALERT, "Hey Nexus", NotificationManager.IMPORTANCE_HIGH));
        }
        PendingIntent open = PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = builder(CH_RUN).setContentTitle("Listening for \"Hey Nexus\"")
                .setContentText("Offline wake word · tap to open").setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentIntent(open).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 30) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        else startForeground(7, n);
    }

    private Notification.Builder builder(String ch) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, ch) : new Notification.Builder(this);
    }

    private void stopSpeech() {
        if (speech != null) { try { speech.stop(); speech.shutdown(); } catch (Exception ignored) { } speech = null; }
        if (rec != null) { try { rec.close(); } catch (Exception ignored) { } rec = null; }
    }

    private void listenForWake() {
        stopSpeech();
        capturing = false;
        if (suspended || model == null) return;
        try {
            rec = new Recognizer(model, 16000.0f, grammar);
            speech = new SpeechService(rec, 16000.0f);
            speech.startListening(this);
        } catch (Exception e) {
            send("error", "Microphone unavailable: " + e.getMessage());
        }
    }

    private void captureCommand() {
        stopSpeech();
        capturing = true;
        try {
            rec = new Recognizer(model, 16000.0f);   // full vocabulary for the command
            speech = new SpeechService(rec, 16000.0f);
            speech.startListening(this);
            captureTimeout = () -> { if (capturing) finishCommand(rec == null ? "" : text(rec.getFinalResult())); };
            main.postDelayed(captureTimeout, 9000);
        } catch (Exception e) {
            send("error", e.getMessage());
            listenForWake();
        }
    }

    private void finishCommand(String text) {
        if (!capturing) return;
        capturing = false;
        if (captureTimeout != null) main.removeCallbacks(captureTimeout);
        send("command", text);
        listenForWake();
    }

    private void woke() {
        try { new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70).startTone(ToneGenerator.TONE_PROP_ACK, 160); } catch (Exception ignored) { }
        bringToFront();
        if ("system".equals(commandMode)) {
            stopSpeech();               // free the mic for the system recognizer; JS resumes us after
            suspended = true;
            send("wake", "handoff");
        } else {
            send("wake", null);
            main.postDelayed(this::captureCommand, 150);
        }
    }

    private void bringToFront() {
        if (MainActivity.visible) return;
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(this)) {
            try { startActivity(i); return; } catch (Exception ignored) { }
        }
        // Background activity starts are blocked: offer a tap-to-open alert instead.
        PendingIntent pi = PendingIntent.getActivity(this, 2, i.putExtra("wake", true), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = builder(CH_ALERT).setContentTitle("Hey Nexus").setContentText("Listening… (tap to open)").setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentIntent(pi).setAutoCancel(true).setTimeoutAfter(15000).setCategory(Notification.CATEGORY_MESSAGE).build();
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(8, n);
    }

    private static String text(String hypothesis) {
        try {
            JSONObject o = new JSONObject(hypothesis);
            return o.has("partial") ? o.optString("partial") : o.optString("text");
        } catch (Exception e) {
            return "";
        }
    }

    private void send(String phase, String text) {
        try {
            JSONObject o = new JSONObject();
            o.put("phase", phase);
            if (text != null) o.put("text", text);
            Sink s = sink;
            if (s != null) s.event(o);
        } catch (Exception ignored) { }
    }

    // ---- RecognitionListener
    @Override public void onPartialResult(String h) {
        String t = text(h);
        if (t.isEmpty()) return;
        if (capturing) send("partial", t);
        else if (trigger.matcher(t).find()) woke();
    }
    @Override public void onResult(String h) {
        String t = text(h);
        if (capturing) { if (!t.isEmpty()) finishCommand(t); }
        else if (!t.isEmpty() && trigger.matcher(t).find()) woke();
    }
    @Override public void onFinalResult(String h) { if (capturing) finishCommand(text(h)); }
    @Override public void onError(Exception e) { send("error", e.getMessage()); main.postDelayed(this::listenForWake, 2000); }
    @Override public void onTimeout() { if (capturing) finishCommand(""); }

    // ---- control from the bridge
    static void pause(boolean p) {
        WakeWordService s = instance;
        if (s != null && s.speech != null && !s.capturing) s.main.post(() -> { if (s.speech != null) s.speech.setPause(p); });
    }

    /** Releases the microphone (e.g. while the in-app mic button is used). */
    static void suspend() {
        WakeWordService s = instance;
        if (s != null) s.main.post(() -> { s.suspended = true; s.stopSpeech(); });
    }

    static void resume() {
        WakeWordService s = instance;
        if (s != null) s.main.post(() -> { s.suspended = false; if (s.speech == null) s.listenForWake(); });
    }

    @Override
    public void onDestroy() {
        instance = null;
        stopSpeech();
        if (model != null) { try { model.close(); } catch (Exception ignored) { } model = null; }
        send("stopped", null);
        super.onDestroy();
    }

    // ---- model files

    static File modelsDir(Context c) { return new File(c.getFilesDir(), "vosk"); }

    static File modelDir(Context c, String name) { return new File(modelsDir(c), name); }

    static boolean installed(Context c, String name) {
        File d = modelDir(c, name);
        return new File(d, "am/final.mdl").exists() || new File(d, "final.mdl").exists();
    }
}
