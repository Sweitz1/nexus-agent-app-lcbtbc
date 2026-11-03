package com.nexus.rayneo;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import org.json.JSONObject;

/**
 * Binocular display + temple touchpad support for RayNeo X3 / X3 Pro glasses, shared by the
 * Nexus phone/standalone app and the Nexus Glasses client.
 *
 * Mirror: those glasses expose both micro-LED panels as ONE wide logical screen (left eye | right
 * eye), so a normal app is split across the two eyes. Modes:
 *   on  — {@link MirrorFrame}: content laid out at half width and drawn twice in the same frame;
 *   sdk — RayNeo's MirroringView (Mercury SDK) copies the content into the right half;
 *   off — normal single image;  auto — "on" when the device looks like such glasses.
 *
 * Temple: the temple touchpad delivers raw strokes (there is nothing to aim at), so they become
 * navigation keys: swipe forward/back = next/previous, swipe up/down = scroll, tap = select,
 * double tap = back, long press = voice, triple tap = menu, pinch = select. With the Mercury SDK
 * built in, RayNeo's own TouchDispatcher (X2/X3 specific) recognises the gestures; otherwise
 * {@link TempleInput} does.
 */
public final class GlassesDisplay {
    private GlassesDisplay() { }

    static final String PREFS = "nexus_display";

    /** A temple gesture source: raw events in, navigation keys out. */
    public interface Temple {
        boolean onTouch(MotionEvent e);
        boolean onKey(KeyEvent e);
    }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    public static boolean looksLikeArGlasses() {
        if (RayNeoSdk.isX3()) return true;
        String s = (Build.MANUFACTURER + " " + Build.BRAND + " " + Build.MODEL + " " + Build.DEVICE).toLowerCase();
        return s.contains("rayneo") || s.contains("ffalcon") || s.contains("argf") || s.contains("mercury");
    }

    /** A single logical screen at least ~2.4:1 is almost certainly side-by-side panels. */
    static boolean looksSideBySide(Context c) {
        DisplayMetrics m = c.getResources().getDisplayMetrics();
        int w = Math.max(m.widthPixels, m.heightPixels), h = Math.min(m.widthPixels, m.heightPixels);
        return h > 0 && (float) w / h >= 2.4f;
    }

    /** Resolved mirror engine: "on", "sdk" or "off". */
    static String mirrorEngine(Context c) {
        String mode = prefs(c).getString("mirror", "auto");
        if ("sdk".equals(mode)) return RayNeoSdk.available() ? "sdk" : "on";
        if ("on".equals(mode) || "off".equals(mode)) return mode;
        boolean multitouch = c.getPackageManager().hasSystemFeature("android.hardware.touchscreen.multitouch");
        return looksSideBySide(c) && (looksLikeArGlasses() || !multitouch) ? "on" : "off";
    }

    public static boolean mirrorActive(Context c) { return !"off".equals(mirrorEngine(c)); }

    public static boolean templeActive(Context c) {
        String mode = prefs(c).getString("temple", "auto");
        if ("on".equals(mode)) return true;
        if ("off".equals(mode)) return false;
        return looksLikeArGlasses();
    }

    public static String describe(Context c) {
        try {
            DisplayMetrics m = c.getResources().getDisplayMetrics();
            JSONObject o = new JSONObject();
            o.put("mirror", prefs(c).getString("mirror", "auto"));
            o.put("temple", prefs(c).getString("temple", "auto"));
            o.put("mirrorActive", mirrorActive(c));
            o.put("mirrorEngine", mirrorEngine(c));
            o.put("templeActive", templeActive(c));
            o.put("width", m.widthPixels);
            o.put("height", m.heightPixels);
            o.put("sideBySide", looksSideBySide(c));
            o.put("arGlasses", looksLikeArGlasses());
            o.put("rayneoSdk", RayNeoSdk.available());
            o.put("x3", RayNeoSdk.isX3());
            Boolean worn = RayNeoSdk.isWearing(c);
            if (worn != null) o.put("wearing", worn.booleanValue());
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    /** key: mirror (auto|on|sdk|off) or temple (auto|on|off). Recreates the activity so it applies. */
    public static void set(Activity a, String key, String mode) {
        if ("mirror".equals(key)) { if (!"on".equals(mode) && !"off".equals(mode) && !"sdk".equals(mode)) mode = "auto"; }
        else if ("temple".equals(key)) { if (!"on".equals(mode) && !"off".equals(mode)) mode = "auto"; }
        else return;
        prefs(a).edit().putString(key, mode).apply();
        a.runOnUiThread(a::recreate);
    }

    /** Wraps the activity's content view for the current mirror mode. */
    public static View wrap(Activity a, View content) {
        String engine = mirrorEngine(a);
        if ("sdk".equals(engine)) {
            View copy = RayNeoSdk.mirrorOf(a, content);
            if (copy != null) {
                LinearLayout row = new LinearLayout(a);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setBackgroundColor(0xFF000000);
                row.addView(content, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f));
                row.addView(copy, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f));
                return row;
            }
            engine = "on";
        }
        return new MirrorFrame(a, content, "on".equals(engine));
    }

    /** The temple gesture source for this device, or null when temple mode is off. */
    public static Temple temple(Activity a, boolean force) {
        if (!force && !templeActive(a)) return null;
        Temple t = RayNeoSdk.temple(a);
        return t != null ? t : new TempleInput(a);
    }

    static void sendKey(Activity act, int code) {
        long now = SystemClock.uptimeMillis();
        act.dispatchKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0));
        act.dispatchKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0));
    }

    /** Wraps the content view; draws it once per eye when mirroring. */
    static final class MirrorFrame extends FrameLayout {
        private final boolean mirror;

        MirrorFrame(Context c, View content, boolean mirror) {
            super(c);
            this.mirror = mirror;
            setBackgroundColor(0xFF000000);
            addView(content, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
            if (mirror) setWillNotDraw(false);
        }

        @Override
        protected void onMeasure(int wSpec, int hSpec) {
            if (!mirror) { super.onMeasure(wSpec, hSpec); return; }
            int w = MeasureSpec.getSize(wSpec), h = MeasureSpec.getSize(hSpec);
            setMeasuredDimension(w, h);
            View c = getChildAt(0);
            if (c != null) c.measure(MeasureSpec.makeMeasureSpec(w / 2, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY));
        }

        @Override
        protected void onLayout(boolean changed, int l, int t, int r, int b) {
            if (!mirror) { super.onLayout(changed, l, t, r, b); return; }
            View c = getChildAt(0);
            if (c != null) c.layout(0, 0, (r - l) / 2, b - t);
        }

        @Override
        protected void dispatchDraw(Canvas canvas) {
            if (!mirror) { super.dispatchDraw(canvas); return; }
            View c = getChildAt(0);
            if (c == null) return;
            long t = getDrawingTime();
            drawChild(canvas, c, t);                       // left eye
            int save = canvas.save();
            canvas.translate(getWidth() / 2f, 0);
            drawChild(canvas, c, t);                       // right eye
            canvas.restoreToCount(save);
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent e) {
            if (mirror && e.getX() >= getWidth() / 2f) {    // a touch on the right copy hits the content too
                MotionEvent m = MotionEvent.obtain(e);
                m.offsetLocation(-getWidth() / 2f, 0);
                boolean r = super.dispatchTouchEvent(m);
                m.recycle();
                return r;
            }
            return super.dispatchTouchEvent(e);
        }
    }

    /** Fallback gesture recogniser (no SDK): converts touchpad strokes into key events. */
    static final class TempleInput implements Temple {
        private final Activity act;
        private final Handler h = new Handler(Looper.getMainLooper());
        private final float slop;
        private float downX, downY;
        private long downT;
        private boolean tracking, longFired;
        private int taps;
        private final Runnable longPress = () -> { longFired = true; sendKey(act(), KeyEvent.KEYCODE_VOICE_ASSIST); };
        private final Runnable singleTap = () -> { taps = 0; sendKey(act(), KeyEvent.KEYCODE_ENTER); };

        TempleInput(Activity a) {
            act = a;
            slop = 48 * a.getResources().getDisplayMetrics().density;
        }

        private Activity act() { return act; }

        @Override public boolean onKey(KeyEvent e) { return false; }

        @Override
        public boolean onTouch(MotionEvent e) {
            if (e.isFromSource(InputDevice.SOURCE_MOUSE) || e.isFromSource(InputDevice.SOURCE_STYLUS)) return false;
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    tracking = true; longFired = false;
                    downX = e.getX(); downY = e.getY(); downT = e.getEventTime();
                    h.postDelayed(longPress, 650);
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (tracking && Math.hypot(e.getX() - downX, e.getY() - downY) > slop) h.removeCallbacks(longPress);
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    tracking = false; h.removeCallbacks(longPress);
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!tracking) return true;
                    tracking = false; h.removeCallbacks(longPress);
                    if (longFired) return true;
                    float dx = e.getX() - downX, dy = e.getY() - downY;
                    if (Math.abs(dx) > slop || Math.abs(dy) > slop) {
                        taps = 0; h.removeCallbacks(singleTap);
                        if (Math.abs(dx) >= Math.abs(dy)) sendKey(act, dx > 0 ? KeyEvent.KEYCODE_DPAD_RIGHT : KeyEvent.KEYCODE_DPAD_LEFT);
                        else sendKey(act, dy > 0 ? KeyEvent.KEYCODE_DPAD_DOWN : KeyEvent.KEYCODE_DPAD_UP);
                        return true;
                    }
                    if (e.getEventTime() - downT > 500) return true;
                    if (++taps >= 2) { taps = 0; h.removeCallbacks(singleTap); sendKey(act, KeyEvent.KEYCODE_BACK); }
                    else h.postDelayed(singleTap, 260);
                    return true;
                default:
                    return true;
            }
        }
    }
}
