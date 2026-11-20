package com.nexus.agent;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/**
 * Reads and controls the media sessions of every music/video app (Spotify, YouTube Music,
 * Plex, podcasts...). Needs notification access (same permission as notification reading).
 */
class MusicTools {

    private final Context ctx;

    MusicTools(Context ctx) { this.ctx = ctx; }

    private List<MediaController> sessions() {
        MediaSessionManager m = (MediaSessionManager) ctx.getSystemService(Context.MEDIA_SESSION_SERVICE);
        return m.getActiveSessions(new ComponentName(ctx, NexusNotificationListener.class));
    }

    String list() throws Exception {
        JSONArray arr = new JSONArray();
        PackageManager pm = ctx.getPackageManager();
        for (MediaController c : sessions()) {
            JSONObject o = new JSONObject();
            o.put("package", c.getPackageName());
            try { o.put("app", String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(c.getPackageName(), 0)))); } catch (Exception e) { o.put("app", c.getPackageName()); }
            MediaMetadata md = c.getMetadata();
            if (md != null) {
                o.put("title", md.getString(MediaMetadata.METADATA_KEY_TITLE));
                o.put("artist", md.getString(MediaMetadata.METADATA_KEY_ARTIST));
                o.put("album", md.getString(MediaMetadata.METADATA_KEY_ALBUM));
                o.put("durationMs", md.getLong(MediaMetadata.METADATA_KEY_DURATION));
            }
            PlaybackState st = c.getPlaybackState();
            if (st != null) {
                o.put("state", st.getState() == PlaybackState.STATE_PLAYING ? "playing" : st.getState() == PlaybackState.STATE_PAUSED ? "paused"
                        : st.getState() == PlaybackState.STATE_BUFFERING ? "buffering" : st.getState() == PlaybackState.STATE_STOPPED ? "stopped" : "other");
                long pos = st.getPosition();
                if (st.getState() == PlaybackState.STATE_PLAYING && st.getLastPositionUpdateTime() > 0)
                    pos += (long) ((android.os.SystemClock.elapsedRealtime() - st.getLastPositionUpdateTime()) * st.getPlaybackSpeed());
                o.put("positionMs", pos);
            }
            arr.put(o);
        }
        return arr.toString();
    }

    /** pkg "" = the first playing session (else the first session). */
    String control(String pkg, String action, long value) throws Exception {
        List<MediaController> all = sessions();
        MediaController target = null;
        for (MediaController c : all) {
            if (pkg != null && !pkg.isEmpty() && !c.getPackageName().equals(pkg)) continue;
            if (target == null) target = c;
            PlaybackState st = c.getPlaybackState();
            if (st != null && st.getState() == PlaybackState.STATE_PLAYING) { target = c; break; }
        }
        if (target == null) throw new IllegalStateException(pkg == null || pkg.isEmpty() ? "No app is playing media" : "No media session for " + pkg + " (open the app first)");
        MediaController.TransportControls t = target.getTransportControls();
        PlaybackState st = target.getPlaybackState();
        long pos = st == null ? 0 : st.getPosition();
        switch (action) {
            case "play": t.play(); break;
            case "pause": t.pause(); break;
            case "toggle": if (st != null && st.getState() == PlaybackState.STATE_PLAYING) t.pause(); else t.play(); break;
            case "next": t.skipToNext(); break;
            case "previous": t.skipToPrevious(); break;
            case "stop": t.stop(); break;
            case "seek": t.seekTo(Math.max(0, value)); break;
            case "forward": t.seekTo(pos + (value > 0 ? value : 15000)); break;
            case "rewind": t.seekTo(Math.max(0, pos - (value > 0 ? value : 15000))); break;
            default: throw new IllegalArgumentException("unknown action " + action);
        }
        return action + " → " + target.getPackageName();
    }
}
