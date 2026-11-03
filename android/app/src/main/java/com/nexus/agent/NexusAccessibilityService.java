package com.nexus.agent;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.Gravity;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Screen control for agents: reads the UI tree of the foreground app and performs taps,
 * typing, scrolling, swipes and global navigation. Only acts on explicit calls from the
 * Nexus agent runtime (NativeBridge.screen). Never reads or fills password fields, and
 * refuses to work inside blocked apps (banking, wallets, password managers...).
 */
public class NexusAccessibilityService extends AccessibilityService {

    interface Sink { void event(String type, JSONObject data); }

    static volatile NexusAccessibilityService instance;
    static volatile Sink sink;
    static volatile Pattern blocked = Pattern.compile("bank|wallet|paypal|venmo|squareup\\.cash|coinbase|binance|kraken|robinhood|chase|wellsfargo|bankofamerica|citi|capitalone|amex|bitwarden|lastpass|onepassword|1password|dashlane|keepass|authenticator|authy|\\.otp", Pattern.CASE_INSENSITIVE);

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<Integer, AccessibilityNodeInfo> nodes = new HashMap<>();
    private volatile String lastPackage = "", lastActivity = "";
    private volatile long lastChange = 0;
    private TextView pill;

    @Override protected void onServiceConnected() { instance = this; }

    @Override public boolean onUnbind(android.content.Intent i) { instance = null; hidePill(); return super.onUnbind(i); }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e.getPackageName() == null) return;
        String pkg = e.getPackageName().toString();
        if (pkg.equals(getPackageName()) || pkg.equals("com.android.systemui")) return;
        lastChange = System.currentTimeMillis();
        if (e.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            lastPackage = pkg;
            if (e.getClassName() != null) lastActivity = e.getClassName().toString();
        }
    }

    @Override public void onInterrupt() { }

    // ------------------------------------------------------------------ indicator

    /** Floating "Nexus is controlling" pill (accessibility overlay: no extra permission). Tap = stop. */
    void showPill(String text) {
        main.post(() -> {
            try {
                WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
                if (pill == null) {
                    pill = new TextView(this);
                    pill.setTextSize(15);
                    pill.setTextColor(0xFFFFFFFF);
                    pill.setBackgroundColor(0xE62A0D4A);
                    pill.setPadding(36, 18, 36, 18);
                    pill.setOnClickListener(v -> { emit("stop", new JSONObject()); hidePill(); });
                    WindowManager.LayoutParams lp = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT);
                    lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                    lp.y = 40;
                    wm.addView(pill, lp);
                }
                pill.setText(text);
            } catch (Exception ignored) { }
        });
    }

    void hidePill() {
        main.post(() -> {
            if (pill != null) {
                try { ((WindowManager) getSystemService(WINDOW_SERVICE)).removeView(pill); } catch (Exception ignored) { }
                pill = null;
            }
        });
    }

    private void emit(String type, JSONObject data) { Sink s = sink; if (s != null) s.event(type, data); }

    // ------------------------------------------------------------------ reading

    private AccessibilityNodeInfo root() {
        AccessibilityNodeInfo r = getRootInActiveWindow();
        if (r != null && r.getPackageName() != null && r.getPackageName().toString().equals(getPackageName())) {
            // Our own UI is in front: look for the app window underneath instead.
            for (android.view.accessibility.AccessibilityWindowInfo w : getWindows()) {
                AccessibilityNodeInfo wr = w.getRoot();
                if (wr != null && wr.getPackageName() != null && !wr.getPackageName().toString().equals(getPackageName())
                        && w.getType() == android.view.accessibility.AccessibilityWindowInfo.TYPE_APPLICATION) return wr;
            }
        }
        return r;
    }

    private void checkAllowed(AccessibilityNodeInfo r) {
        String pkg = r == null || r.getPackageName() == null ? "" : r.getPackageName().toString();
        if (pkg.equals(getPackageName())) throw new SecurityException("Nexus itself is in front — open the target app first (screen_open_app)");
        if (blocked.matcher(pkg).find()) throw new SecurityException("Screen control is blocked in " + pkg + " (protected app: banking, wallet or password manager)");
    }

    String snapshot(int max) throws Exception {
        AccessibilityNodeInfo r = root();
        if (r == null) throw new IllegalStateException("No readable window (screen off or app not ready)");
        checkAllowed(r);
        nodes.clear();
        JSONArray out = new JSONArray();
        walk(r, out, 0, max);
        Rect screen = new Rect();
        r.getBoundsInScreen(screen);
        JSONObject o = new JSONObject();
        o.put("package", r.getPackageName());
        o.put("activity", lastActivity);
        o.put("screen", screen.width() + "x" + screen.height());
        o.put("elements", out);
        return o.toString();
    }

    private void walk(AccessibilityNodeInfo n, JSONArray out, int depth, int max) throws Exception {
        if (n == null || out.length() >= max || depth > 60) return;
        if (!n.isVisibleToUser()) { return; }
        CharSequence txt = n.getText(), desc = n.getContentDescription();
        String hint = Build.VERSION.SDK_INT >= 26 && n.getHintText() != null ? n.getHintText().toString() : "";
        boolean interesting = n.isClickable() || n.isEditable() || n.isScrollable() || n.isCheckable() || n.isLongClickable()
                || (txt != null && txt.length() > 0) || (desc != null && desc.length() > 0);
        if (interesting) {
            int id = out.length() + 1;
            JSONObject e = new JSONObject();
            e.put("id", id);
            String cls = n.getClassName() == null ? "" : n.getClassName().toString();
            e.put("type", cls.substring(cls.lastIndexOf('.') + 1));
            if (n.isPassword()) e.put("text", "•••• (password field — not readable)");
            else if (txt != null && txt.length() > 0) e.put("text", clip(txt.toString(), 160));
            if (desc != null && desc.length() > 0) e.put("desc", clip(desc.toString(), 120));
            if (!hint.isEmpty()) e.put("hint", clip(hint, 80));
            if (n.getViewIdResourceName() != null) e.put("res", n.getViewIdResourceName().replaceAll("^.*:id/", ""));
            List<String> f = new ArrayList<>();
            if (n.isClickable()) f.add("click");
            if (n.isLongClickable()) f.add("longclick");
            if (n.isEditable()) f.add("edit");
            if (n.isScrollable()) f.add("scroll");
            if (n.isCheckable()) f.add(n.isChecked() ? "checked" : "unchecked");
            if (n.isSelected()) f.add("selected");
            if (!n.isEnabled()) f.add("disabled");
            if (n.isFocused()) f.add("focused");
            if (n.isPassword()) f.add("password");
            e.put("can", String.join(",", f));
            Rect b = new Rect();
            n.getBoundsInScreen(b);
            e.put("x", b.centerX());
            e.put("y", b.centerY());
            out.put(e);
            nodes.put(id, AccessibilityNodeInfo.obtain(n));
        }
        for (int i = 0; i < n.getChildCount(); i++) walk(n.getChild(i), out, depth + 1, max);
    }

    private static String clip(String s, int n) { s = s.replace('\n', ' ').trim(); return s.length() > n ? s.substring(0, n) + "…" : s; }

    // ------------------------------------------------------------------ acting

    private AccessibilityNodeInfo node(int id) {
        AccessibilityNodeInfo n = nodes.get(id);
        if (n == null) throw new IllegalArgumentException("Element #" + id + " not found — call screen_read again");
        n.refresh();
        checkAllowed(root());
        return n;
    }

    /** Text of the element and its nearest labelled ancestor/children, for the JS safety check. */
    String label(int id) {
        AccessibilityNodeInfo n = node(id);
        StringBuilder sb = new StringBuilder();
        collectText(n, sb, 0);
        AccessibilityNodeInfo p = n.getParent();
        if (sb.length() == 0 && p != null) collectText(p, sb, 0);
        return sb.toString().trim();
    }

    private void collectText(AccessibilityNodeInfo n, StringBuilder sb, int depth) {
        if (n == null || depth > 4 || sb.length() > 300) return;
        if (n.getText() != null) sb.append(n.getText()).append(' ');
        if (n.getContentDescription() != null) sb.append(n.getContentDescription()).append(' ');
        for (int i = 0; i < n.getChildCount(); i++) collectText(n.getChild(i), sb, depth + 1);
    }

    String click(int id, boolean longPress) {
        AccessibilityNodeInfo n = node(id);
        int action = longPress ? AccessibilityNodeInfo.ACTION_LONG_CLICK : AccessibilityNodeInfo.ACTION_CLICK;
        for (AccessibilityNodeInfo c = n; c != null; c = c.getParent()) {
            if ((longPress ? c.isLongClickable() : c.isClickable()) && c.performAction(action)) return "tapped #" + id;
        }
        Rect b = new Rect();
        n.getBoundsInScreen(b);
        return gesture(b.centerX(), b.centerY(), b.centerX(), b.centerY(), longPress ? 700 : 60) ? "tapped #" + id + " (gesture)" : "tap failed";
    }

    String type(int id, String text, boolean append) {
        AccessibilityNodeInfo n = node(id);
        if (n.isPassword()) throw new SecurityException("Refusing to type into a password field — the user must enter passwords themselves");
        if (!n.isEditable()) {
            for (AccessibilityNodeInfo c : childrenEditable(n)) { n = c; break; }
            if (!n.isEditable()) throw new IllegalArgumentException("Element #" + id + " is not a text field");
        }
        n.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        String value = append && n.getText() != null ? n.getText() + text : text;
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value);
        return n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args) ? "typed into #" + id : "typing failed";
    }

    private List<AccessibilityNodeInfo> childrenEditable(AccessibilityNodeInfo n) {
        List<AccessibilityNodeInfo> out = new ArrayList<>();
        for (int i = 0; i < n.getChildCount(); i++) { AccessibilityNodeInfo c = n.getChild(i); if (c != null && c.isEditable()) out.add(c); }
        return out;
    }

    /** Presses the keyboard's action key (search / go / send) on the focused field. */
    String submit(int id) {
        AccessibilityNodeInfo n = node(id);
        if (Build.VERSION.SDK_INT >= 30 && n.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId())) return "pressed enter";
        return "enter not supported here — tap the search/send button instead";
    }

    String scroll(int id, String dir) {
        boolean fwd = dir.equals("down") || dir.equals("right");
        if (id > 0) {
            for (AccessibilityNodeInfo c = node(id); c != null; c = c.getParent())
                if (c.isScrollable() && c.performAction(fwd ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) return "scrolled " + dir;
        }
        AccessibilityNodeInfo r = root();
        checkAllowed(r);
        Rect b = new Rect();
        r.getBoundsInScreen(b);
        int cx = b.centerX(), cy = b.centerY(), dx = b.width() / 3, dy = b.height() / 3;
        boolean ok;
        switch (dir) {
            case "up": ok = gesture(cx, cy - dy, cx, cy + dy, 350); break;
            case "left": ok = gesture(cx - dx, cy, cx + dx, cy, 300); break;
            case "right": ok = gesture(cx + dx, cy, cx - dx, cy, 300); break;
            default: ok = gesture(cx, cy + dy, cx, cy - dy, 350);
        }
        return ok ? "scrolled " + dir + " (swipe)" : "scroll failed";
    }

    String swipe(int x1, int y1, int x2, int y2, int ms) {
        checkAllowed(root());
        return gesture(x1, y1, x2, y2, Math.max(50, Math.min(ms, 3000))) ? "swiped" : "swipe failed";
    }

    String tapAt(int x, int y) {
        checkAllowed(root());
        return gesture(x, y, x, y, 60) ? "tapped at " + x + "," + y : "tap failed";
    }

    private boolean gesture(int x1, int y1, int x2, int y2, long ms) {
        Path p = new Path();
        p.moveTo(x1, y1);
        if (x1 != x2 || y1 != y2) p.lineTo(x2, y2);
        GestureDescription g = new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(p, 0, ms)).build();
        CountDownLatch l = new CountDownLatch(1);
        final boolean[] ok = {false};
        main.post(() -> dispatchGesture(g, new GestureResultCallback() {
            @Override public void onCompleted(GestureDescription d) { ok[0] = true; l.countDown(); }
            @Override public void onCancelled(GestureDescription d) { l.countDown(); }
        }, null));
        try { l.await(ms + 3000, TimeUnit.MILLISECONDS); } catch (InterruptedException ignored) { }
        return ok[0];
    }

    String global(String action) {
        int a;
        switch (action) {
            case "home": a = GLOBAL_ACTION_HOME; break;
            case "recents": a = GLOBAL_ACTION_RECENTS; break;
            case "notifications": a = GLOBAL_ACTION_NOTIFICATIONS; break;
            case "quick_settings": a = GLOBAL_ACTION_QUICK_SETTINGS; break;
            default: a = GLOBAL_ACTION_BACK;
        }
        return performGlobalAction(a) ? action + " pressed" : action + " failed";
    }

    /** Waits until the screen stops changing (or timeout) so the next read sees the result. */
    void settle(long maxMs) {
        long end = System.currentTimeMillis() + maxMs;
        try { Thread.sleep(350); } catch (InterruptedException ignored) { }
        while (System.currentTimeMillis() < end && System.currentTimeMillis() - lastChange < 400) {
            try { Thread.sleep(120); } catch (InterruptedException ignored) { }
        }
    }

    /** Screenshot of the current screen into the workspace (Android 11+). */
    String screenshot(File out) throws Exception {
        if (Build.VERSION.SDK_INT < 30) throw new UnsupportedOperationException("Screenshots need Android 11+");
        checkAllowed(root());
        CountDownLatch l = new CountDownLatch(1);
        final Exception[] err = {null};
        takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
            @Override public void onSuccess(ScreenshotResult r) {
                try {
                    Bitmap hw = Bitmap.wrapHardwareBuffer(r.getHardwareBuffer(), r.getColorSpace());
                    if (hw == null) throw new IllegalStateException("no bitmap");
                    Bitmap bmp = hw.copy(Bitmap.Config.ARGB_8888, false);
                    hw.recycle();
                    r.getHardwareBuffer().close();
                    File p = out.getParentFile();
                    if (p != null) //noinspection ResultOfMethodCallIgnored
                        p.mkdirs();
                    try (FileOutputStream os = new FileOutputStream(out)) { bmp.compress(Bitmap.CompressFormat.JPEG, 85, os); }
                    bmp.recycle();
                } catch (Exception e) { err[0] = e; }
                l.countDown();
            }
            @Override public void onFailure(int code) { err[0] = new IllegalStateException("screenshot failed (" + code + ")"); l.countDown(); }
        });
        if (!l.await(6, TimeUnit.SECONDS)) throw new IllegalStateException("screenshot timeout");
        if (err[0] != null) throw err[0];
        return out.getAbsolutePath();
    }

    String foreground() { AccessibilityNodeInfo r = root(); return r == null || r.getPackageName() == null ? lastPackage : r.getPackageName().toString(); }

    static void setBlocklist(String regex) {
        try { blocked = Pattern.compile(regex == null || regex.trim().isEmpty() ? "(?!x)x" : regex.trim(), Pattern.CASE_INSENSITIVE); } catch (Exception ignored) { }
    }

    static String lower(String s) { return s == null ? "" : s.toLowerCase(Locale.ROOT); }
}
