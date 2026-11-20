package com.nexus.agent;

import android.app.Notification;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.Iterator;

/**
 * Reads phone/glasses notifications (messages, calls, apps) so agents can summarize or
 * announce them. Only active after the user enables "Notification access" for Nexus Agent.
 */
public class NexusNotificationListener extends NotificationListenerService {

    interface Sink { void posted(JSONObject n); }

    static volatile NexusNotificationListener instance;
    static volatile Sink sink;
    private static final ArrayDeque<JSONObject> recent = new ArrayDeque<>();

    @Override public void onListenerConnected() { instance = this; }
    @Override public void onListenerDisconnected() { instance = null; }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        JSONObject o = toJson(sbn);
        if (o == null) return;
        synchronized (recent) {
            // Replace an older version of the same notification.
            Iterator<JSONObject> it = recent.iterator();
            while (it.hasNext()) if (it.next().optString("key").equals(o.optString("key"))) it.remove();
            recent.addFirst(o);
            while (recent.size() > 150) recent.removeLast();
        }
        Sink s = sink;
        if (s != null) s.posted(o);
    }

    private JSONObject toJson(StatusBarNotification sbn) {
        try {
            if (sbn.getPackageName().equals(getPackageName())) return null;
            Notification n = sbn.getNotification();
            if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0 && !Notification.CATEGORY_CALL.equals(n.category)) return null;
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return null;
            Bundle x = n.extras;
            CharSequence title = x.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence text = x.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (text == null) text = x.getCharSequence(Notification.EXTRA_TEXT);
            if (title == null && text == null) return null;
            JSONObject o = new JSONObject();
            o.put("key", sbn.getKey());
            o.put("package", sbn.getPackageName());
            String label = sbn.getPackageName();
            try {
                PackageManager pm = getPackageManager();
                label = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(sbn.getPackageName(), 0)));
            } catch (Exception ignored) { }
            o.put("app", label);
            o.put("title", title == null ? "" : title.toString());
            o.put("text", text == null ? "" : text.toString());
            o.put("category", n.category == null ? "" : n.category);
            o.put("time", sbn.getPostTime());
            return o;
        } catch (Exception e) {
            return null;
        }
    }

    static String list(int limit) {
        JSONArray arr = new JSONArray();
        synchronized (recent) {
            for (JSONObject o : recent) { if (arr.length() >= limit) break; arr.put(o); }
        }
        return arr.toString();
    }

    static boolean dismiss(String key) {
        NexusNotificationListener i = instance;
        if (i == null) return false;
        i.cancelNotification(key);
        synchronized (recent) { recent.removeIf(o -> o.optString("key").equals(key)); }
        return true;
    }
}
