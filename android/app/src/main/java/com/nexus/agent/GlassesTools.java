package com.nexus.agent;

import android.app.ActivityManager;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.KeyEvent;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Native features of the glasses (and any Android device): status, volume, media keys,
 * head pose / head gestures from the IMU, and system settings shortcuts.
 */
class GlassesTools {

    interface Result { void done(boolean ok, String json); }

    private final MainActivity act;
    private final SensorManager sm;

    GlassesTools(MainActivity act) {
        this.act = act;
        this.sm = (SensorManager) act.getSystemService(Context.SENSOR_SERVICE);
    }

    String status() throws Exception {
        JSONObject o = new JSONObject();
        Intent b = act.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (b != null) {
            int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            JSONObject bat = new JSONObject();
            bat.put("percent", scale > 0 ? Math.round(level * 100f / scale) : -1);
            int st = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            bat.put("charging", st == BatteryManager.BATTERY_STATUS_CHARGING || st == BatteryManager.BATTERY_STATUS_FULL);
            int plug = b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
            bat.put("plugged", plug == BatteryManager.BATTERY_PLUGGED_USB ? "usb" : plug == BatteryManager.BATTERY_PLUGGED_AC ? "ac" : plug == BatteryManager.BATTERY_PLUGGED_WIRELESS ? "wireless" : "none");
            bat.put("temperatureC", b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0);
            o.put("battery", bat);
        }
        AudioManager am = (AudioManager) act.getSystemService(Context.AUDIO_SERVICE);
        JSONObject vol = new JSONObject();
        vol.put("mediaPercent", Math.round(am.getStreamVolume(AudioManager.STREAM_MUSIC) * 100f / Math.max(1, am.getStreamMaxVolume(AudioManager.STREAM_MUSIC))));
        vol.put("ringer", am.getRingerMode() == AudioManager.RINGER_MODE_NORMAL ? "normal" : am.getRingerMode() == AudioManager.RINGER_MODE_VIBRATE ? "vibrate" : "silent");
        vol.put("musicActive", am.isMusicActive());
        o.put("audio", vol);
        ConnectivityManager cm = (ConnectivityManager) act.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
        JSONObject net = new JSONObject();
        net.put("online", nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET));
        net.put("type", nc == null ? "none" : nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi" : nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ? "cellular"
                : nc.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) ? "bluetooth-tether" : nc.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ? "ethernet" : "other");
        net.put("ip", NativeBridge.localIp());
        o.put("network", net);
        try {
            BluetoothManager bm = (BluetoothManager) act.getSystemService(Context.BLUETOOTH_SERVICE);
            o.put("bluetoothOn", bm != null && bm.getAdapter() != null && bm.getAdapter().isEnabled());
        } catch (SecurityException e) {
            o.put("bluetoothOn", "unknown (permission)");
        }
        StatFs fs = new StatFs(act.getFilesDir().getAbsolutePath());
        JSONObject stor = new JSONObject();
        stor.put("freeGB", Math.round(fs.getAvailableBytes() / 1e7) / 100.0);
        stor.put("totalGB", Math.round(fs.getTotalBytes() / 1e7) / 100.0);
        o.put("storage", stor);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        ((ActivityManager) act.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(mi);
        o.put("memoryFreeMB", mi.availMem / 1048576);
        JSONObject disp = new JSONObject();
        float wb = act.getWindowBrightness();
        disp.put("appBrightness", wb < 0 ? "system" : String.valueOf(Math.round(wb * 100)));
        try { disp.put("systemBrightness255", Settings.System.getInt(act.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS)); } catch (Exception ignored) { }
        o.put("display", disp);
        o.put("uptimeMin", SystemClock.elapsedRealtime() / 60000);
        o.put("device", Build.MANUFACTURER + " " + Build.MODEL + " (Android " + Build.VERSION.RELEASE + ", SDK " + Build.VERSION.SDK_INT + ")");
        JSONArray sensors = new JSONArray();
        for (Sensor s : sm.getSensorList(Sensor.TYPE_ALL)) sensors.put(s.getName());
        o.put("sensors", sensors);
        return o.toString();
    }

    String setVolume(int percent) {
        AudioManager am = (AudioManager) act.getSystemService(Context.AUDIO_SERVICE);
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        am.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(Math.max(0, Math.min(100, percent)) * max / 100f), AudioManager.FLAG_SHOW_UI);
        return "Media volume " + Math.max(0, Math.min(100, percent)) + "%";
    }

    /** Controls whatever media app is playing (Spotify, YouTube Music, podcasts...). */
    String mediaKey(String action) {
        int code;
        switch (action) {
            case "play": code = KeyEvent.KEYCODE_MEDIA_PLAY; break;
            case "pause": code = KeyEvent.KEYCODE_MEDIA_PAUSE; break;
            case "next": code = KeyEvent.KEYCODE_MEDIA_NEXT; break;
            case "previous": code = KeyEvent.KEYCODE_MEDIA_PREVIOUS; break;
            case "stop": code = KeyEvent.KEYCODE_MEDIA_STOP; break;
            default: code = KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
        }
        AudioManager am = (AudioManager) act.getSystemService(Context.AUDIO_SERVICE);
        am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
        am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, code));
        return "sent " + action;
    }

    String openSettings(String panel) {
        String a;
        Intent i;
        switch (panel == null ? "" : panel) {
            case "wifi": a = Settings.ACTION_WIFI_SETTINGS; break;
            case "bluetooth": a = Settings.ACTION_BLUETOOTH_SETTINGS; break;
            case "cast": a = Settings.ACTION_CAST_SETTINGS; break;
            case "display": a = Settings.ACTION_DISPLAY_SETTINGS; break;
            case "sound": a = Settings.ACTION_SOUND_SETTINGS; break;
            case "battery": a = Intent.ACTION_POWER_USAGE_SUMMARY; break;
            case "location": a = Settings.ACTION_LOCATION_SOURCE_SETTINGS; break;
            case "notifications": a = Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS; break;
            case "apps": a = Settings.ACTION_APPLICATION_SETTINGS; break;
            case "storage": a = Settings.ACTION_INTERNAL_STORAGE_SETTINGS; break;
            case "date": a = Settings.ACTION_DATE_SETTINGS; break;
            case "language": a = Settings.ACTION_LOCALE_SETTINGS; break;
            case "accessibility": a = Settings.ACTION_ACCESSIBILITY_SETTINGS; break;
            case "developer": a = Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS; break;
            case "app": a = Settings.ACTION_APPLICATION_DETAILS_SETTINGS; break;
            default: a = Settings.ACTION_SETTINGS;
        }
        i = new Intent(a);
        if ("app".equals(panel)) i.setData(Uri.parse("package:" + act.getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            act.startActivity(i);
            return "opened " + (panel == null || panel.isEmpty() ? "settings" : panel);
        } catch (Exception e) {
            try { act.startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return "opened main settings (" + panel + " not available)"; }
            catch (Exception e2) { return "settings not available on this device"; }
        }
    }

    /** Head orientation in degrees from the rotation-vector sensor. */
    void headPose(Result r) {
        Sensor s = sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);
        if (s == null) s = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (s == null) { r.done(false, "{\"error\":\"No rotation sensor\"}"); return; }
        final boolean[] done = {false};
        Handler h = new Handler(Looper.getMainLooper());
        SensorEventListener l = new SensorEventListener() {
            int n = 0;
            @Override public void onSensorChanged(SensorEvent e) {
                if (done[0] || ++n < 3) return;   // let the fusion settle
                done[0] = true;
                sm.unregisterListener(this);
                float[] m = new float[9], o = new float[3];
                SensorManager.getRotationMatrixFromVector(m, e.values);
                SensorManager.getOrientation(m, o);
                try {
                    JSONObject j = new JSONObject();
                    j.put("yawDeg", Math.round(Math.toDegrees(o[0])));
                    j.put("pitchDeg", Math.round(Math.toDegrees(o[1])));
                    j.put("rollDeg", Math.round(Math.toDegrees(o[2])));
                    r.done(true, j.toString());
                } catch (Exception x) { r.done(false, NativeBridge.errorJson(x)); }
            }
            @Override public void onAccuracyChanged(Sensor sensor, int a) { }
        };
        sm.registerListener(l, s, SensorManager.SENSOR_DELAY_GAME);
        h.postDelayed(() -> { if (!done[0]) { done[0] = true; sm.unregisterListener(l); r.done(false, "{\"error\":\"sensor timeout\"}"); } }, 3000);
    }

    /**
     * Waits for a nod or head shake using the gyroscope. Reports the dominant rotation axis
     * (x/y/z) of a quick back-and-forth movement; JS maps axes to nod/shake (calibratable,
     * because the sensor orientation inside each pair of glasses differs).
     */
    void headGesture(long timeoutMs, Result r) {
        Sensor g = sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        if (g == null) { r.done(false, "{\"error\":\"No gyroscope\"}"); return; }
        final float thr = 1.3f;                     // rad/s
        final int[] lastSign = new int[3];
        final long[] lastPeak = new long[3];
        final int[] alternations = new int[3];
        final double[] energy = new double[3];
        final boolean[] done = {false};
        Handler h = new Handler(Looper.getMainLooper());
        SensorEventListener l = new SensorEventListener() {
            @Override public void onSensorChanged(SensorEvent e) {
                if (done[0]) return;
                long now = SystemClock.elapsedRealtime();
                for (int i = 0; i < 3; i++) {
                    float v = e.values[i];
                    energy[i] = energy[i] * 0.9 + v * v;
                    if (Math.abs(v) < thr) continue;
                    int sign = v > 0 ? 1 : -1;
                    if (lastSign[i] != 0 && sign != lastSign[i] && now - lastPeak[i] < 900) alternations[i]++;
                    else if (now - lastPeak[i] >= 900) alternations[i] = 0;
                    lastSign[i] = sign;
                    lastPeak[i] = now;
                }
                int best = energy[0] >= energy[1] && energy[0] >= energy[2] ? 0 : energy[1] >= energy[2] ? 1 : 2;
                double others = 0;
                for (int i = 0; i < 3; i++) if (i != best) others = Math.max(others, energy[i]);
                if (alternations[best] >= 1 && energy[best] > 1.8 * others) {
                    done[0] = true;
                    sm.unregisterListener(this);
                    r.done(true, "{\"axis\":\"" + "xyz".charAt(best) + "\",\"alternations\":" + alternations[best] + "}");
                }
            }
            @Override public void onAccuracyChanged(Sensor sensor, int a) { }
        };
        sm.registerListener(l, g, SensorManager.SENSOR_DELAY_GAME);
        h.postDelayed(() -> { if (!done[0]) { done[0] = true; sm.unregisterListener(l); r.done(true, "{\"axis\":\"none\"}"); } }, Math.max(1000, Math.min(timeoutMs, 30000)));
    }
}
