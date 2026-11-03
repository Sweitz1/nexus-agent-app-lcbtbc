package com.nexus.agent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import org.json.JSONObject;

import java.util.ArrayList;

/**
 * Talk to Nexus from Android Auto (or any car / watch that reads messaging notifications):
 * Nexus messages are posted as a MessagingStyle conversation with a voice Reply action. Android
 * Auto reads them aloud; the spoken reply comes back here and is passed to the agent, whose answer
 * is posted to the same conversation.
 */
final class CarMessaging {
    private CarMessaging() { }

    interface Sink { void reply(String text); }
    static volatile Sink sink;

    static final String CHANNEL = "nexus_car";
    static final String KEY_TEXT = "nexus_reply";
    static final int ID = 4711;
    private static final ArrayList<String[]> history = new ArrayList<>();   // {sender, text, timeMs}

    static synchronized void post(Context c, String sender, String text, boolean fromUser) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Nexus conversations (Android Auto)", NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(ch);
        }
        history.add(new String[]{fromUser ? "" : sender, text, String.valueOf(System.currentTimeMillis())});
        while (history.size() > 12) history.remove(0);

        Person me = new Person.Builder().setName("You").build();
        Person nexus = new Person.Builder().setName(sender == null || sender.isEmpty() ? "Nexus" : sender).setBot(true).build();
        Notification.MessagingStyle style = new Notification.MessagingStyle(me).setConversationTitle("Nexus");
        for (String[] h : history) style.addMessage(h[1], Long.parseLong(h[2]), h[0].isEmpty() ? null : nexus);

        RemoteInput ri = new RemoteInput.Builder(KEY_TEXT).setLabel("Reply to Nexus").build();
        PendingIntent replyPi = PendingIntent.getBroadcast(c, 1, new Intent(c, ReplyReceiver.class).setAction("reply"),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        Notification.Action reply = new Notification.Action.Builder(null, "Reply", replyPi)
                .addRemoteInput(ri).setSemanticAction(Notification.Action.SEMANTIC_ACTION_REPLY).setAllowGeneratedReplies(true)
                .build();
        PendingIntent readPi = PendingIntent.getBroadcast(c, 2, new Intent(c, ReplyReceiver.class).setAction("read"),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Action read = new Notification.Action.Builder(null, "Mark as read", readPi)
                .setSemanticAction(Notification.Action.SEMANTIC_ACTION_MARK_AS_READ).build();

        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(android.R.drawable.sym_action_chat)
                .setStyle(style)
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setContentIntent(PendingIntent.getActivity(c, 3, open, PendingIntent.FLAG_IMMUTABLE))
                .addAction(reply)
                .addAction(read)
                .setOnlyAlertOnce(fromUser)
                .setAutoCancel(false)
                .build();
        nm.notify(ID, n);
    }

    static synchronized void clear(Context c) {
        history.clear();
        c.getSystemService(NotificationManager.class).cancel(ID);
    }

    public static class ReplyReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context c, Intent i) {
            if ("read".equals(i.getAction())) { c.getSystemService(NotificationManager.class).cancel(ID); return; }
            Bundle r = RemoteInput.getResultsFromIntent(i);
            CharSequence t = r == null ? null : r.getCharSequence(KEY_TEXT);
            if (t == null || t.toString().trim().isEmpty()) return;
            String text = t.toString().trim();
            Sink s = sink;
            if (s != null) {
                post(c, "", text, true);               // show the user's message in the thread right away
                s.reply(text);
            } else {
                post(c, "Nexus", "Open Nexus on your phone so I can answer, then reply again.", false);
            }
        }
    }

    static String json(String text) {
        try { JSONObject o = new JSONObject(); o.put("text", text); return o.toString(); } catch (Exception e) { return "{}"; }
    }
}
