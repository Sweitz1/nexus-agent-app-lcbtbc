package com.halo.agent;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Point;
import android.graphics.Rect;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewTreeObserver;
import android.widget.FrameLayout;

/**
 * RayNeo X3 Pro support: device detection, showing the app in both eyes, and temple-touchpad
 * gestures.
 *
 * Device detection, the both-eyes mirror and the touchpad gesture logic are adapted from
 * x3bluetooth (https://github.com/Dun-John/x3bluetooth), MIT License,
 * Copyright (c) 2026 X3 Bluetooth contributors. See THIRD_PARTY_NOTICES.md. The PixelCopy
 * fallback is Halo's own.
 *
 * The X3 Pro exposes its two 640x480 panels as one 1280x480 screen: content is pinned to the
 * left half and a mirror fills the right half. Its right temple touchpad ("cyttsp5_mt") reports
 * as a touchscreen; the left one ("cyttsp6_mt") belongs to the system (volume, brightness).
 */
final class X3 {
    static final String RIGHT_TOUCHPAD = "cyttsp5_mt";
    static final String LEFT_TOUCHPAD = "cyttsp6_mt";
    private static Boolean isX3;

    private X3() { }

    /** Looks for the touchpad itself, since the model string is a code name that could change. */
    static boolean isX3() {
        if (isX3 == null) {
            isX3 = false;
            for (int id : InputDevice.getDeviceIds()) {
                InputDevice d = InputDevice.getDevice(id);
                if (d != null && RIGHT_TOUCHPAD.equals(d.getName())) { isX3 = true; break; }
            }
        }
        return isX3;
    }

    /** "auto" = on for the X3 Pro only, "on", "off". */
    static boolean stereoWanted(String mode) { return "on".equals(mode) || ("auto".equals(mode) && isX3()); }

    /**
     * Shows the activity's content in both eyes. Call from onPostCreate.
     * method "draw" re-records the source view (light); "copy" copies frames with PixelCopy
     * (for views that don't redraw into another canvas).
     */
    static void attachStereo(Activity activity, String method) {
        FrameLayout content = activity.findViewById(android.R.id.content);
        if (content == null || content.getChildCount() == 0) return;
        View source = content.getChildAt(0);
        Point size = new Point();
        activity.getWindowManager().getDefaultDisplay().getRealSize(size);
        int eyeWidth = Math.max(size.x, size.y) / 2;

        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(eyeWidth, FrameLayout.LayoutParams.MATCH_PARENT);
        sp.gravity = Gravity.LEFT;
        source.setLayoutParams(sp);

        View mirror = "copy".equals(method) ? new CopyMirror(activity, eyeWidth) : new DrawMirror(activity, source);
        FrameLayout.LayoutParams mp = new FrameLayout.LayoutParams(eyeWidth, FrameLayout.LayoutParams.MATCH_PARENT);
        mp.gravity = Gravity.RIGHT;
        mirror.setLayoutParams(mp);
        mirror.setElevation(1000f); // records after the source in each frame
        content.addView(mirror);
    }

    /** Right-eye copy, re-recorded in the same frame as the source and only when it changed. */
    static final class DrawMirror extends View {
        private final View source;
        private final ViewTreeObserver.OnPreDrawListener pre;

        DrawMirror(Activity a, View source) {
            super(a);
            this.source = source;
            pre = () -> { if (source.isDirty()) invalidate(); return true; };
            setWillNotDraw(false);
        }
        @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); getViewTreeObserver().addOnPreDrawListener(pre); }
        @Override protected void onDetachedFromWindow() { getViewTreeObserver().removeOnPreDrawListener(pre); super.onDetachedFromWindow(); }
        @Override protected void onDraw(Canvas c) { super.onDraw(c); source.draw(c); }
    }

    /** Right-eye copy made from the left half of the window with PixelCopy, ~30 fps. */
    static final class CopyMirror extends View {
        private final Activity act;
        private final int eyeWidth;
        private final HandlerThread thread = new HandlerThread("halo-mirror");
        private Handler bg;
        private final Handler main = new Handler(Looper.getMainLooper());
        private Bitmap front, back;
        private boolean running = false, busy = false;

        CopyMirror(Activity a, int eyeWidth) { super(a); this.act = a; this.eyeWidth = eyeWidth; setWillNotDraw(false); }

        private final Runnable tick = new Runnable() {
            @Override public void run() {
                if (!running) return;
                main.postDelayed(this, 33);
                int h = getHeight();
                if (busy || h <= 0) return;
                if (back == null || back.getWidth() != eyeWidth || back.getHeight() != h) back = Bitmap.createBitmap(eyeWidth, h, Bitmap.Config.ARGB_8888);
                busy = true;
                try {
                    PixelCopy.request(act.getWindow(), new Rect(0, 0, eyeWidth, h), back, result -> {
                        busy = false;
                        if (result == PixelCopy.SUCCESS) { Bitmap t = front; front = back; back = t; invalidate(); }
                    }, bg);
                } catch (Exception e) { busy = false; }
            }
        };

        @Override protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            thread.start(); bg = new Handler(thread.getLooper());
            running = true; main.post(tick);
        }
        @Override protected void onDetachedFromWindow() { running = false; main.removeCallbacks(tick); thread.quitSafely(); super.onDetachedFromWindow(); }
        @Override protected void onDraw(Canvas c) { super.onDraw(c); Bitmap f = front; if (f != null) c.drawBitmap(f, 0, 0, null); }
    }

    /**
     * Turns right-temple touchpad events into gestures. Every touchpad event is consumed, since
     * its coordinates would otherwise land on whatever view is at that spot. There is no long
     * press: holding still ~700 ms opens the RayNeo launcher's quick menu, which apps can't block.
     */
    static final class Touchpad {
        interface Listener { void onNext(); void onPrevious(); void onSelect(); void onBack(); }

        private static final float SWIPE_PX = 50f;
        private static final long STEP_MS = 220L;
        private static final float LONG_AXIS_BIAS = 0.85f;
        private static final float TAP_SLOP_PX = 30f;
        private static final long TAP_MAX_MS = 400L;
        private static final long DOUBLE_TAP_MS = 250L;

        private final Listener l;
        private final Handler h = new Handler(Looper.getMainLooper());
        private final Runnable select;
        private float downX, downY, anchorX, anchorY;
        private long downTime, lastStep;
        private boolean swiped, tapPending, secondPress;

        Touchpad(Listener l) { this.l = l; select = () -> { tapPending = false; l.onSelect(); }; }

        /** True if the event came from a temple touchpad (and was handled). */
        boolean onTouchEvent(MotionEvent e) {
            if (!isX3() || !e.isFromSource(InputDevice.SOURCE_TOUCHSCREEN)) return false;
            InputDevice d = e.getDevice();
            if (d != null && LEFT_TOUCHPAD.equals(d.getName())) return true;
            if (d == null || !RIGHT_TOUCHPAD.equals(d.getName())) return false;
            float x = e.getX(), y = e.getY();
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = anchorX = x; downY = anchorY = y; downTime = SystemClock.uptimeMillis();
                    lastStep = 0; swiped = false; secondPress = tapPending; h.removeCallbacks(select); tapPending = false;
                    break;
                case MotionEvent.ACTION_MOVE: {
                    float dx = x - anchorX, dy = y - anchorY;
                    boolean along = Math.abs(dx) * LONG_AXIS_BIAS > Math.abs(dy);
                    float delta = along ? dx : dy;
                    if (Math.abs(delta) < SWIPE_PX) break;
                    anchorX = x; anchorY = y; swiped = true;
                    long now = SystemClock.uptimeMillis();
                    if (now - lastStep < STEP_MS) break;
                    lastStep = now;
                    if (delta > 0) l.onNext(); else l.onPrevious();
                    break;
                }
                case MotionEvent.ACTION_UP: {
                    boolean tap = !swiped && SystemClock.uptimeMillis() - downTime < TAP_MAX_MS && Math.hypot(x - downX, y - downY) < TAP_SLOP_PX;
                    if (!tap) break;
                    if (secondPress) l.onBack();
                    else { tapPending = true; h.postDelayed(select, DOUBLE_TAP_MS); }
                    break;
                }
                default: break;
            }
            return true;
        }
    }
}
