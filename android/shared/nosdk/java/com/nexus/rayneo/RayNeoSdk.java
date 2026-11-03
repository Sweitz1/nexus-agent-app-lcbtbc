package com.nexus.rayneo;

import android.app.Activity;
import android.content.Context;
import android.view.View;

/** Built when the RayNeo Mercury SDK AAR is absent: Nexus' own mirror and gesture code is used. */
public final class RayNeoSdk {
    private RayNeoSdk() { }
    public static boolean available() { return false; }
    public static boolean isX3() { return false; }
    public static Boolean isWearing(Context c) { return null; }
    public static View mirrorOf(Context c, View source) { return null; }
    public static GlassesDisplay.Temple temple(Activity a) { return null; }
}
