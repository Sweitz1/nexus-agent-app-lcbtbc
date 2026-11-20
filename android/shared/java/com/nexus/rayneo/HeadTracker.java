package com.nexus.rayneo;

import android.app.Activity;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import org.json.JSONObject;

/**
 * Head tracking for world-locked UI on AR glasses.
 *
 *  - 6DoF: head pose (rotation + position) from the glasses' OpenXR runtime through libnexus_xr
 *    (glasses app only). Tried when requested; if there is no runtime, no headless mode (unless the
 *    experimental OpenXR session is allowed) or no data within a few seconds, it falls back.
 *  - 3DoF: rotation from Android's game-rotation-vector sensor (gyro + accelerometer, no magnetic
 *    jumps). Works on any device.
 *
 * {@link #pose()} returns angles in degrees (yaw left+, pitch up+, roll) and position in metres
 * (x right, y up, z back), relative to the last {@link #recenter()}.
 */
public final class HeadTracker implements SensorEventListener {
    private static boolean nativeLoaded;
    static {
        try { System.loadLibrary("nexus_xr"); nativeLoaded = true; } catch (Throwable t) { nativeLoaded = false; }
    }
    private static native boolean nativeStart(Object activity, boolean allowGl);
    private static native void nativeStop();
    private static native float[] nativePose();
    private static native String nativeStatus();

    private final Activity act;
    private final SensorManager sm;
    private String mode = "off";            // off | 3dof | 6dof
    private String note = "";
    private final float[] q = {0, 0, 0, 1};  // latest orientation (x, y, z, w)
    private final float[] p = new float[3];
    private float[] refQ = {0, 0, 0, 1};
    private final float[] refP = new float[3];
    private boolean haveSample;
    private long sixStart;

    public HeadTracker(Activity a) {
        act = a;
        sm = (SensorManager) a.getSystemService(Context.SENSOR_SERVICE);
    }

    public static boolean sixDofAvailable() { return nativeLoaded; }

    /** want: "3dof" or "6dof"; allowGlSession: allow the OpenXR session that may take over the display. */
    public synchronized String start(String want, boolean allowGlSession) {
        stop();
        haveSample = false;
        if ("6dof".equals(want) && nativeLoaded) {
            try { nativeStart(act, allowGlSession); mode = "6dof"; sixStart = System.currentTimeMillis(); note = ""; return status(); }
            catch (Throwable t) { note = "6DoF unavailable: " + t.getMessage(); }
        } else if ("6dof".equals(want)) note = "6DoF needs the Nexus Glasses app (OpenXR); using 3DoF";
        startRotation();
        return status();
    }

    private void startRotation() {
        Sensor s = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);
        if (s == null && sm != null) s = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (s == null) { mode = "off"; note = "No rotation sensor on this device"; return; }
        sm.registerListener(this, s, SensorManager.SENSOR_DELAY_GAME);
        mode = "3dof";
    }

    public synchronized void stop() {
        if ("6dof".equals(mode)) { try { nativeStop(); } catch (Throwable ignored) { } }
        if (sm != null) sm.unregisterListener(this);
        mode = "off";
    }

    public synchronized void recenter() {
        refQ = q.clone();
        System.arraycopy(p, 0, refP, 0, 3);
    }

    @Override public synchronized void onSensorChanged(SensorEvent e) {
        float[] v = new float[4];
        SensorManager.getQuaternionFromVector(v, e.values);   // w, x, y, z
        setQ(v[1], v[2], v[3], v[0]);
    }
    @Override public void onAccuracyChanged(Sensor s, int a) { }

    private void setQ(float x, float y, float z, float w) {
        q[0] = x; q[1] = y; q[2] = z; q[3] = w;
        if (!haveSample) { haveSample = true; recenter(); }
    }

    /** Polls the 6DoF runtime; falls back to 3DoF when it stops or never delivers. */
    private void poll6() {
        float[] v;
        try { v = nativePose(); } catch (Throwable t) { fallback("6DoF stopped: " + t.getMessage()); return; }
        String st = nativeStatus();
        boolean fresh = v[8] < 500;
        if (fresh) {
            setQ(v[0], v[1], v[2], v[3]);
            p[0] = v[4]; p[1] = v[5]; p[2] = v[6];
            return;
        }
        if (st.startsWith("error") || st.startsWith("session ended") || st.startsWith("runtime is shutting")) fallback(st);
        else if (System.currentTimeMillis() - sixStart > 10000) fallback("6DoF runtime sent no pose: " + st);
    }

    private void fallback(String why) {
        try { nativeStop(); } catch (Throwable ignored) { }
        note = why + " — using 3DoF";
        haveSample = false;
        startRotation();
    }

    // Quaternion helpers (x, y, z, w)
    private static float[] mul(float[] a, float[] b) {
        return new float[]{
            a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
            a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
            a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
            a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]};
    }
    private static float[] conj(float[] a) { return new float[]{-a[0], -a[1], -a[2], a[3]}; }
    private static float[] rotate(float[] qq, float[] v) {
        float[] r = mul(mul(qq, new float[]{v[0], v[1], v[2], 0}), conj(qq));
        return new float[]{r[0], r[1], r[2]};
    }

    /** {source, yaw, pitch, roll (deg), x, y, z (m, in the recentred frame), tracked, note}. */
    public synchronized String pose() {
        if ("6dof".equals(mode)) poll6();
        try {
            JSONObject o = new JSONObject();
            o.put("source", mode);
            if (!haveSample) { o.put("tracked", false); o.put("note", note); return o.toString(); }
            float[] rel = mul(conj(refQ), q);
            // Euler from the relative rotation. For OpenXR (y up, -z forward) and the rotation-vector
            // sensor alike: yaw about y, pitch about x, roll about z.
            double x = rel[0], y = rel[1], z = rel[2], w = rel[3];
            double yaw = Math.toDegrees(Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)));
            double pitch = Math.toDegrees(Math.asin(Math.max(-1, Math.min(1, 2 * (w * x - y * z)))));
            double roll = Math.toDegrees(Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z)));
            // rel = ref⁻¹·q is the head rotation in the head's own (recentred) frame. Both sources use
            // y up and -z as the looking direction (OpenXR VIEW space; the device frame of a display
            // held upright), so +yaw = turned left and +pitch = looking up.
            o.put("yaw", round(yaw)); o.put("pitch", round(pitch)); o.put("roll", round(roll));
            if ("6dof".equals(mode)) {
                float[] d = {p[0] - refP[0], p[1] - refP[1], p[2] - refP[2]};
                float[] local = rotate(conj(refQ), d);
                o.put("x", round(local[0])); o.put("y", round(local[1])); o.put("z", round(local[2]));
            } else { o.put("x", 0); o.put("y", 0); o.put("z", 0); }
            o.put("tracked", true);
            if (!note.isEmpty()) o.put("note", note);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    private static double round(double v) { return Math.round(v * 1000.0) / 1000.0; }

    public synchronized String status() {
        try {
            JSONObject o = new JSONObject();
            o.put("mode", mode);
            o.put("sixDofBuilt", nativeLoaded);
            if ("6dof".equals(mode)) o.put("runtime", nativeStatus());
            if (!note.isEmpty()) o.put("note", note);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }
}
