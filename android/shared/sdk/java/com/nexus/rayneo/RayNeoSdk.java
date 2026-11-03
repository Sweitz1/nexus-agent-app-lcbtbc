package com.nexus.rayneo;

import android.app.Activity;
import android.content.Context;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;

import com.ffalcon.mercury.android.sdk.MercurySDK;
import com.ffalcon.mercury.android.sdk.api.MobileState;
import com.ffalcon.mercury.android.sdk.touch.CommonTouchCallback;
import com.ffalcon.mercury.android.sdk.touch.FlingArgs;
import com.ffalcon.mercury.android.sdk.touch.TouchDispatcher;
import com.ffalcon.mercury.android.sdk.ui.wiget.MirroringView;
import com.ffalcon.mercury.android.sdk.util.DeviceUtil;

/**
 * Built when the RayNeo Mercury Android SDK AAR is present (android/libs/rayneo/). Uses RayNeo's
 * own temple-gesture dispatcher (X2/X3 specific), device detection, wearing state and
 * MirroringView. Every call is guarded: on non-RayNeo devices it quietly falls back.
 */
public final class RayNeoSdk {
    private RayNeoSdk() { }

    /** X3's pinch key, handled by the SDK's X3 dispatcher. */
    private static final int KEYCODE_PINCH = 320;
    private static boolean inited;

    public static boolean available() { return true; }

    static synchronized void init(Context c) {
        if (inited) return;
        try { MercurySDK.INSTANCE.init((android.app.Application) c.getApplicationContext()); inited = true; } catch (Throwable ignored) { }
    }

    public static boolean isX3() {
        try { return DeviceUtil.isX3Device(); } catch (Throwable t) { return false; }
    }

    /** True/false from the RayNeo launcher, null when unknown (not RayNeo or no answer). */
    public static Boolean isWearing(Context c) {
        if (!GlassesDisplay.looksLikeArGlasses()) return null;
        try { init(c); return MobileState.INSTANCE.isWearing(); } catch (Throwable t) { return null; }
    }

    public static View mirrorOf(Context c, View source) {
        try {
            MirroringView v = new MirroringView(c);
            v.setSource(source);
            v.startMirroring();
            return v;
        } catch (Throwable t) { return null; }
    }

    /** RayNeo's gesture dispatcher mapped to navigation keys; null when unusable here. */
    public static GlassesDisplay.Temple temple(Activity a) {
        if (!GlassesDisplay.looksLikeArGlasses()) return null;
        try {
            init(a);
            if (!inited) return null;
            final TouchDispatcher d = new TouchDispatcher(TouchDispatcher.Source.Activity.INSTANCE);
            final CommonTouchCallback cb = new CommonTouchCallback() {
                private boolean key(int code) { GlassesDisplay.sendKey(a, code); return true; }
                @Override public boolean onTPClick() { return key(KeyEvent.KEYCODE_ENTER); }
                @Override public boolean onTPDoubleClick() { return key(KeyEvent.KEYCODE_BACK); }
                @Override public boolean onTPLongClick() { return key(KeyEvent.KEYCODE_VOICE_ASSIST); }
                @Override public void onTPTripleClick() { key(KeyEvent.KEYCODE_MENU); }
                @Override public boolean onTPSlideForward(FlingArgs f) { return key(KeyEvent.KEYCODE_DPAD_RIGHT); }
                @Override public boolean onTPSlideBackward(FlingArgs f) { return key(KeyEvent.KEYCODE_DPAD_LEFT); }
                @Override public boolean onTPSlideUpwards(FlingArgs f) { return key(KeyEvent.KEYCODE_DPAD_UP); }
                @Override public boolean onTPSlideDownwards(FlingArgs f) { return key(KeyEvent.KEYCODE_DPAD_DOWN); }
                @Override public void onKeyPinch() { key(KeyEvent.KEYCODE_ENTER); }
                @Override public void onKeyLongPinch() { key(KeyEvent.KEYCODE_VOICE_ASSIST); }
                @Override public void onTPDoubleFingerClick() { key(KeyEvent.KEYCODE_CAMERA); }
            };
            return new GlassesDisplay.Temple() {
                @Override public boolean onTouch(MotionEvent e) {
                    try { d.onMotionEvent(e, cb); return true; } catch (Throwable t) { return false; }
                }
                @Override public boolean onKey(KeyEvent e) {
                    if (e.getKeyCode() != KEYCODE_PINCH) return false;
                    try { d.onKeyEvent(e, cb); return true; } catch (Throwable t) { return false; }
                }
            };
        } catch (Throwable t) { return null; }
    }
}
