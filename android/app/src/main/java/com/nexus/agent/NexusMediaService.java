package com.nexus.agent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaDescription;
import android.media.MediaMetadata;
import android.media.browse.MediaBrowser;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Bundle;
import android.service.media.MediaBrowserService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Nexus as a media app for cars and Bluetooth:
 *  - A MediaSession mirrors Nexus' own player (audiobooks, narration, podcasts, spoken replies), so
 *    Bluetooth car stereos show the title over AVRCP and steering-wheel / headset buttons work.
 *  - A MediaBrowserService lets Android Auto (and other media browsers) list Nexus' audiobooks,
 *    narrations and "Ask Nexus"; voice search ("play … on Nexus") goes to the agent.
 * Playback itself stays in the app's player; commands from the car are forwarded to it as events.
 */
public class NexusMediaService extends MediaBrowserService {
    interface Sink { void command(JSONObject cmd); }
    static volatile Sink sink;
    static volatile NexusMediaService instance;
    /** Browse catalog published by the JS side: {root:[items], "<id>":[items]} with items {id,title,subtitle,playable}. */
    static volatile JSONObject catalog;
    private static final String CHANNEL = "nexus_media";
    private static final String ROOT = "nexus_root";

    MediaSession session;
    private boolean foreground;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        session = new MediaSession(this, "Nexus");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { send("play", null); }
            @Override public void onPause() { send("pause", null); }
            @Override public void onStop() { send("stop", null); }
            @Override public void onSkipToNext() { send("next", null); }
            @Override public void onSkipToPrevious() { send("previous", null); }
            @Override public void onFastForward() { send("forward", null); }
            @Override public void onRewind() { send("rewind", null); }
            @Override public void onSeekTo(long pos) { send("seek", String.valueOf(pos)); }
            @Override public void onPlayFromMediaId(String id, Bundle extras) { send("playId", id); }
            @Override public void onPlayFromSearch(String query, Bundle extras) { send("search", query == null ? "" : query); }
        });
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        session.setSessionActivity(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE));
        setSessionToken(session.getSessionToken());
        applyState("{\"state\":\"none\"}");
    }

    private void send(String action, String arg) {
        Sink s = sink;
        try {
            JSONObject o = new JSONObject();
            o.put("action", action);
            if (arg != null) o.put("arg", arg);
            if (s != null) s.command(o);
            else if ("playId".equals(action) || "search".equals(action) || "play".equals(action)) {
                session.setPlaybackState(new PlaybackState.Builder().setState(PlaybackState.STATE_ERROR, 0, 0)
                        .setErrorMessage("Open Nexus on your phone first").build());
            }
        } catch (Exception ignored) { }
    }

    /** Called from the bridge: {state: playing|paused|stopped|buffering|none, title, artist, album, durationMs, positionMs, rate, canNext, canPrev}. */
    static void update(android.content.Context ctx, String json) {
        NexusMediaService svc = instance;
        if (svc == null) {
            try {
                JSONObject j = new JSONObject(json);
                if (!"playing".equals(j.optString("state"))) return;   // only start the service for actual playback
                Intent i = new Intent(ctx, NexusMediaService.class).putExtra("state", json);
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
            } catch (Exception ignored) { }
            return;
        }
        svc.applyState(json);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra("cmd")) {
            long a = intent.getLongExtra("cmd", 0);
            if (a == PlaybackState.ACTION_PAUSE) send("pause", null);
            else if (a == PlaybackState.ACTION_PLAY) send("play", null);
            else if (a == PlaybackState.ACTION_SKIP_TO_NEXT) send("next", null);
            else if (a == PlaybackState.ACTION_SKIP_TO_PREVIOUS) send("previous", null);
            return START_NOT_STICKY;
        }
        if (intent != null && intent.hasExtra("state")) applyState(intent.getStringExtra("state"));
        else if (!foreground) { startFg(build(null, false)); stopForeground(STOP_FOREGROUND_DETACH); }
        return START_NOT_STICKY;
    }

    void applyState(String json) {
        try {
            JSONObject j = new JSONObject(json);
            String st = j.optString("state", "none");
            int s;
            switch (st) {
                case "playing": s = PlaybackState.STATE_PLAYING; break;
                case "paused": s = PlaybackState.STATE_PAUSED; break;
                case "buffering": s = PlaybackState.STATE_BUFFERING; break;
                case "stopped": s = PlaybackState.STATE_STOPPED; break;
                default: s = PlaybackState.STATE_NONE;
            }
            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                    | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_REWIND
                    | PlaybackState.ACTION_PLAY_FROM_MEDIA_ID | PlaybackState.ACTION_PLAY_FROM_SEARCH
                    | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS;
            session.setPlaybackState(new PlaybackState.Builder()
                    .setActions(actions)
                    .setState(s, j.optLong("positionMs", 0), (float) j.optDouble("rate", 1.0))
                    .build());
            if (j.has("title")) {
                session.setMetadata(new MediaMetadata.Builder()
                        .putString(MediaMetadata.METADATA_KEY_TITLE, j.optString("title"))
                        .putString(MediaMetadata.METADATA_KEY_ARTIST, j.optString("artist", "Nexus"))
                        .putString(MediaMetadata.METADATA_KEY_ALBUM, j.optString("album", ""))
                        .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, j.optString("title"))
                        .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, j.optString("artist", "Nexus"))
                        .putLong(MediaMetadata.METADATA_KEY_DURATION, j.optLong("durationMs", 0))
                        .build());
            }
            boolean active = s == PlaybackState.STATE_PLAYING || s == PlaybackState.STATE_PAUSED || s == PlaybackState.STATE_BUFFERING;
            session.setActive(active);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (s == PlaybackState.STATE_PLAYING || s == PlaybackState.STATE_BUFFERING) {
                startFg(build(j, true));
            } else if (active) {
                if (foreground) { stopForeground(STOP_FOREGROUND_DETACH); foreground = false; }
                nm.notify(7, build(j, false));
            } else {
                if (foreground) { stopForeground(STOP_FOREGROUND_REMOVE); foreground = false; }
                nm.cancel(7);
            }
        } catch (Exception ignored) { }
    }

    private void startFg(Notification n) {
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(7, n);
            foreground = true;
        } catch (Exception ignored) { }
    }

    private Notification build(JSONObject j, boolean playing) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Nexus playback", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification.Builder b = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(j == null ? "Nexus" : j.optString("title", "Nexus"))
                .setContentText(j == null ? "" : j.optString("artist", ""))
                .setContentIntent(session.getController().getSessionActivity())
                .setOngoing(playing)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        b.addAction(new Notification.Action.Builder(null, "Previous", button(PlaybackState.ACTION_SKIP_TO_PREVIOUS)).build());
        b.addAction(new Notification.Action.Builder(null, playing ? "Pause" : "Play", button(playing ? PlaybackState.ACTION_PAUSE : PlaybackState.ACTION_PLAY)).build());
        b.addAction(new Notification.Action.Builder(null, "Next", button(PlaybackState.ACTION_SKIP_TO_NEXT)).build());
        return b.build();
    }

    private PendingIntent button(long action) {
        Intent i = new Intent(this, NexusMediaService.class).putExtra("cmd", action);
        return PendingIntent.getService(this, (int) action, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // ------------------------------------------------------------------ browsing (Android Auto)

    @Override
    public BrowserRoot onGetRoot(String clientPackageName, int clientUid, Bundle rootHints) {
        Bundle extras = new Bundle();
        return new BrowserRoot(ROOT, extras);
    }

    @Override
    public void onLoadChildren(String parentId, Result<List<MediaBrowser.MediaItem>> result) {
        List<MediaBrowser.MediaItem> out = new ArrayList<>();
        JSONObject cat = catalog;
        JSONArray items = cat == null ? null : cat.optJSONArray(ROOT.equals(parentId) ? "root" : parentId);
        if (items == null) {
            if (ROOT.equals(parentId)) out.add(item("open", "Open Nexus on your phone", "Then your audiobooks and narrations appear here", false));
        } else {
            for (int i = 0; i < items.length() && i < 200; i++) {
                JSONObject it = items.optJSONObject(i);
                if (it != null) out.add(item(it.optString("id"), it.optString("title"), it.optString("subtitle", ""), it.optBoolean("playable", true)));
            }
        }
        result.sendResult(out);
    }

    private static MediaBrowser.MediaItem item(String id, String title, String sub, boolean playable) {
        MediaDescription d = new MediaDescription.Builder().setMediaId(id).setTitle(title).setSubtitle(sub).build();
        return new MediaBrowser.MediaItem(d, playable ? MediaBrowser.MediaItem.FLAG_PLAYABLE : MediaBrowser.MediaItem.FLAG_BROWSABLE);
    }

    static void catalogChanged() {
        NexusMediaService s = instance;
        if (s != null) try { s.notifyChildrenChanged(ROOT); } catch (Exception ignored) { }
    }

    @Override
    public void onDestroy() {
        instance = null;
        session.release();
        super.onDestroy();
    }
}
