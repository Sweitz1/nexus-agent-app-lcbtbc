package com.nexus.agent;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;

import org.json.JSONObject;

/**
 * Binocular display + temple touchpad support for RayNeo X3 / X3 Pro style glasses, without the
 * vendor SDK.
 *
 * Mirror: those glasses expose both micro-LED panels as ONE wide logical screen (left eye | right
 * eye). A normal app is then split across the two eyes. {@link MirrorFrame} lays its content out
 * at half the width and draws it twice, once per eye, so each eye sees the whole UI (the same idea
 * as RayNeo's MirrorContainerView). Touches on either half map to the content.
 *
 * Temple: the temple touchpad delivers raw touch strokes (there is no touchscreen to aim at), so
 * {@link TempleInput} turns strokes into navigation keys: swipe forward/back = next/previous item,
 * swipe up/down = scroll, tap = select, double tap = back, long press = voice.
 *
 * Both default to "auto" (on only when the device looks like such glasses) and can be forced on or
 * off from the app's settings.
 */
final class GlassesDisplay {
    private GlassesDisplay() { }

    static final String PREFS = "nexus_display";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static boolean looksLikeArGlasses() {
        String s = (Build.MANUFACTURER + " " + Build.BRAND + " " + Build.MODEL + " " + Build.DEVICE).toLowerCase();
        return s.contains("rayneo") || s.contains("falcon") || s.contains("mercury");
    }

    /** A single logical screen at least ~2.4:1 is almost certainly side-by-side panels. */
    static boolean looksSideBySide(Context c) {
        DisplayMetrics m = c.getResources().getDisplayMetrics();
        int w = Math.max(m.widthPixels, m.heightPixels), h = Math.min(m.widthPixels, m.heightPixels);
        return h > 0 && (float) w / h >= 2.4f;
    }

    static boolean mirrorActive(Context c) {
        String mode = prefs(c).getString("mirror", "auto");
        if ("on".equals(mode)) return true;
        if ("off".equals(mode)) return false;
        return looksSideBySide(c) && (looksLikeArGlasses() || !hasTouchscreenHint(c));
    }

    static boolean templeActive(Context c) {
        String mode = prefs(c).getString("temple", "auto");
        if ("on".equals(mode)) return true;
        if ("off".equals(mode)) return false;
        return looksLikeArGlasses();
    }

    private static boolean hasTouchscreenHint(Context c) {
        return c.getPackageManager().hasSystemFeature("android.hardware.touchscreen.multitouch");
    }

    static String describe(Context c) {
        try {
            DisplayMetrics m = c.getResources().getDisplayMetrics();
            JSONObject o = new JSONObject();
            o.put("mirror", prefs(c).getString("mirror", "auto"));
            o.put("temple", prefs(c).getString("temple", "auto"));
            o.put("mirrorActive", mirrorActive(c));
            o.put("templeActive", templeActive(c));
            o.put("width", m.widthPixels);
            o.put("height", m.heightPixels);
            o.put("sideBySide", looksSideBySide(c));
            o.put("arGlasses", looksLikeArGlasses());
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    /** mode: auto | on | off. Recreates the activity so the new layout applies. */
    static void set(Activity a, String key, String mode) {
        if (!"mirror".equals(key) && !"temple".equals(key)) return;
        if (!"on".equals(mode) && !"off".equals(mode)) mode = "auto";
        prefs(a).edit().putString(key, mode).apply();
        a.runOnUiThread(a::recreate);
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

    /** Converts temple touchpad strokes into key events sent to the activity. */
    static final class TempleInput {
        private final Activity act;
        private final Handler h = new Handler(Looper.getMainLooper());
        private final float slop;
        private float downX, downY;
        private long downT;
        private boolean tracking, longFired;
        private int taps;
        private final Runnable longPress = () -> { longFired = true; key(KeyEvent.KEYCODE_VOICE_ASSIST); };
        private final Runnable singleTap = () -> { taps = 0; key(KeyEvent.KEYCODE_ENTER); };

        TempleInput(Activity a) {
            act = a;
            slop = 48 * a.getResources().getDisplayMetrics().density;
        }

        /** Returns true when the event was consumed as a temple gesture. */
        boolean onTouch(MotionEvent e) {
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
                        if (Math.abs(dx) >= Math.abs(dy)) key(dx > 0 ? KeyEvent.KEYCODE_DPAD_RIGHT : KeyEvent.KEYCODE_DPAD_LEFT);
                        else key(dy > 0 ? KeyEvent.KEYCODE_DPAD_DOWN : KeyEvent.KEYCODE_DPAD_UP);
                        return true;
                    }
                    if (e.getEventTime() - downT > 500) return true;
                    if (++taps >= 2) { taps = 0; h.removeCallbacks(singleTap); key(KeyEvent.KEYCODE_BACK); }
                    else h.postDelayed(singleTap, 260);
                    return true;
                default:
                    return true;
            }
        }

        private void key(int code) {
            long now = android.os.SystemClock.uptimeMillis();
            act.dispatchKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0));
            act.dispatchKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0));
        }
    }
}
