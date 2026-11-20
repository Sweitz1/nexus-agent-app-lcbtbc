package com.nexus.agent;

import android.graphics.Bitmap;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaMuxer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/** Zip archives and video processing with the Android framework only (no FFmpeg). */
class MediaTools {

    private final Workspace ws;

    MediaTools(Workspace ws) { this.ws = ws; }

    // ------------------------------------------------------------------ zip

    String zip(JSONObject spec) throws Exception {
        String op = spec.optString("op");
        switch (op) {
            case "create": return zipCreate(spec);
            case "extract": return zipExtract(spec);
            case "list": return zipList(spec);
            default: throw new IllegalArgumentException("unknown zip op " + op);
        }
    }

    private String zipCreate(JSONObject spec) throws Exception {
        JSONArray inputs = spec.getJSONArray("inputs");
        File out = ws.resolve(spec.getString("output"));
        File parent = out.getParentFile();
        if (parent != null) //noinspection ResultOfMethodCallIgnored
            parent.mkdirs();
        int count = 0;
        try (ZipOutputStream zos = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(out)))) {
            for (int i = 0; i < inputs.length(); i++) {
                File in = ws.resolve(inputs.getString(i));
                if (!in.exists()) throw new IOException("Not found: " + inputs.getString(i));
                File base = in.getParentFile();
                for (File f : Workspace.filesUnder(in)) {
                    if (f.getCanonicalPath().equals(out.getCanonicalPath())) continue;
                    String name = base.toURI().relativize(f.toURI()).getPath();
                    zos.putNextEntry(new ZipEntry(name));
                    try (InputStream is = new BufferedInputStream(new FileInputStream(f))) { Workspace.copy(is, zos); }
                    zos.closeEntry();
                    count++;
                }
            }
        }
        JSONObject o = new JSONObject();
        o.put("output", ws.rel(out));
        o.put("files", count);
        o.put("size", out.length());
        return o.toString();
    }

    private String zipExtract(JSONObject spec) throws Exception {
        File zip = ws.resolve(spec.getString("path"));
        String destRel = spec.optString("dest", "");
        if (destRel.isEmpty()) {
            String n = zip.getName();
            destRel = ws.rel(zip.getParentFile()) + "/" + (n.toLowerCase().endsWith(".zip") ? n.substring(0, n.length() - 4) : n + "_files");
        }
        File dest = ws.resolve(destRel);
        String destCanon = dest.getCanonicalPath();
        int count = 0;
        long total = 0;
        try (ZipFile zf = new ZipFile(zip)) {
            Enumeration<? extends ZipEntry> en = zf.entries();
            while (en.hasMoreElements()) {
                ZipEntry e = en.nextElement();
                File target = new File(dest, e.getName()).getCanonicalFile();
                // Zip-slip protection.
                if (!target.getPath().startsWith(destCanon + File.separator) && !target.getPath().equals(destCanon))
                    throw new IOException("Unsafe entry " + e.getName());
                if (e.isDirectory()) { //noinspection ResultOfMethodCallIgnored
                    target.mkdirs(); continue; }
                File p = target.getParentFile();
                if (p != null) //noinspection ResultOfMethodCallIgnored
                    p.mkdirs();
                try (InputStream is = zf.getInputStream(e); OutputStream os = new BufferedOutputStream(new FileOutputStream(target))) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = is.read(buf)) > 0) {
                        total += n;
                        if (total > 1024L * 1024 * 1024) throw new IOException("Archive expands beyond 1 GB; stopped");
                        os.write(buf, 0, n);
                    }
                }
                count++;
            }
        }
        JSONObject o = new JSONObject();
        o.put("dest", ws.rel(dest));
        o.put("files", count);
        o.put("bytes", total);
        return o.toString();
    }

    private String zipList(JSONObject spec) throws Exception {
        File zip = ws.resolve(spec.getString("path"));
        JSONArray arr = new JSONArray();
        try (ZipFile zf = new ZipFile(zip)) {
            Enumeration<? extends ZipEntry> en = zf.entries();
            while (en.hasMoreElements() && arr.length() < 2000) {
                ZipEntry e = en.nextElement();
                JSONObject o = new JSONObject();
                o.put("name", e.getName());
                o.put("dir", e.isDirectory());
                o.put("size", e.getSize());
                o.put("compressed", e.getCompressedSize());
                arr.put(o);
            }
        }
        return arr.toString();
    }

    // ------------------------------------------------------------------ video

    String video(JSONObject spec) throws Exception {
        String op = spec.optString("op");
        switch (op) {
            case "info": return videoInfo(ws.resolve(spec.getString("path")));
            case "frames": return videoFrames(spec);
            case "trim": return remux(spec, true, true);
            case "audio": return remux(spec, false, true);
            case "mute": return remux(spec, true, false);
            default: throw new IllegalArgumentException("unknown video op " + op);
        }
    }

    private String videoInfo(File f) throws Exception {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(f.getAbsolutePath());
            JSONObject o = new JSONObject();
            o.put("path", ws.rel(f));
            o.put("size", f.length());
            o.put("durationMs", parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)));
            o.put("width", parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)));
            o.put("height", parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)));
            o.put("rotation", parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)));
            o.put("bitrate", parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)));
            o.put("mime", r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE));
            o.put("hasAudio", "yes".equals(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO)));
            o.put("hasVideo", "yes".equals(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO)));
            o.put("frameCount", parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)));
            o.put("location", r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_LOCATION));
            o.put("date", r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE));
            MediaExtractor ex = new MediaExtractor();
            try {
                ex.setDataSource(f.getAbsolutePath());
                JSONArray tracks = new JSONArray();
                for (int i = 0; i < ex.getTrackCount(); i++) tracks.put(ex.getTrackFormat(i).getString(MediaFormat.KEY_MIME));
                o.put("tracks", tracks);
            } finally { ex.release(); }
            return o.toString();
        } finally {
            r.release();
        }
    }

    private String videoFrames(JSONObject spec) throws Exception {
        File f = ws.resolve(spec.getString("path"));
        int maxW = spec.optInt("maxWidth", 1280);
        String outDir = spec.optString("outputDir", "");
        if (outDir.isEmpty()) outDir = "frames/" + stem(f.getName());
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        JSONArray out = new JSONArray();
        try {
            r.setDataSource(f.getAbsolutePath());
            long dur = parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
            JSONArray times = spec.optJSONArray("timesMs");
            if (times == null || times.length() == 0) {
                int count = Math.max(1, Math.min(spec.optInt("count", 6), 60));
                times = new JSONArray();
                for (int i = 0; i < count; i++) times.put((long) (dur * (i + 0.5) / count));
            }
            for (int i = 0; i < times.length(); i++) {
                long t = Math.max(0, Math.min(times.getLong(i), Math.max(0, dur - 1)));
                Bitmap b = r.getFrameAtTime(t * 1000, MediaMetadataRetriever.OPTION_CLOSEST);
                if (b == null) continue;
                if (b.getWidth() > maxW) {
                    Bitmap s = Bitmap.createScaledBitmap(b, maxW, Math.round(b.getHeight() * (maxW / (float) b.getWidth())), true);
                    b.recycle();
                    b = s;
                }
                File img = ws.resolve(outDir + "/frame_" + String.format(java.util.Locale.ROOT, "%03d_%dms.jpg", i + 1, t));
                File p = img.getParentFile();
                if (p != null) //noinspection ResultOfMethodCallIgnored
                    p.mkdirs();
                try (OutputStream os = new FileOutputStream(img)) { b.compress(Bitmap.CompressFormat.JPEG, 85, os); }
                b.recycle();
                JSONObject o = new JSONObject();
                o.put("path", ws.rel(img));
                o.put("timeMs", t);
                out.put(o);
            }
        } finally {
            r.release();
        }
        JSONObject res = new JSONObject();
        res.put("frames", out);
        return res.toString();
    }

    /** Lossless cut / track selection: copies compressed samples, no re-encoding. */
    private String remux(JSONObject spec, boolean keepVideo, boolean keepAudio) throws Exception {
        File in = ws.resolve(spec.getString("path"));
        long startUs = Math.max(0, spec.optLong("startMs", 0)) * 1000;
        long endMs = spec.optLong("endMs", -1);
        long endUs = endMs < 0 ? Long.MAX_VALUE : endMs * 1000;
        String outRel = spec.optString("output", "");
        if (outRel.isEmpty()) outRel = ws.rel(in.getParentFile()) + "/" + stem(in.getName()) + (keepVideo ? (keepAudio ? "_trim.mp4" : "_muted.mp4") : "_audio.m4a");
        File out = ws.unique(outRel);
        File p = out.getParentFile();
        if (p != null) //noinspection ResultOfMethodCallIgnored
            p.mkdirs();

        MediaExtractor ex = new MediaExtractor();
        MediaMuxer mux = null;
        boolean started = false;
        try {
            ex.setDataSource(in.getAbsolutePath());
            mux = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            Map<Integer, Integer> map = new HashMap<>();
            int maxSize = 1024 * 1024;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat fmt = ex.getTrackFormat(i);
                String mime = fmt.getString(MediaFormat.KEY_MIME);
                if (mime == null) continue;
                boolean isV = mime.startsWith("video/"), isA = mime.startsWith("audio/");
                if ((isV && keepVideo) || (isA && keepAudio)) {
                    ex.selectTrack(i);
                    map.put(i, mux.addTrack(fmt));
                    if (fmt.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) maxSize = Math.max(maxSize, fmt.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE));
                }
            }
            if (map.isEmpty()) throw new IOException(keepVideo ? "No video track" : "No audio track");
            if (keepVideo) {
                MediaMetadataRetriever r = new MediaMetadataRetriever();
                try {
                    r.setDataSource(in.getAbsolutePath());
                    mux.setOrientationHint((int) parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)));
                } finally { r.release(); }
            }
            mux.start();
            started = true;
            ex.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            ByteBuffer buf = ByteBuffer.allocate(maxSize);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            long firstUs = -1;
            int samples = 0;
            while (true) {
                int size = ex.readSampleData(buf, 0);
                if (size < 0) break;
                long t = ex.getSampleTime();
                if (t > endUs) break;
                if (firstUs < 0) firstUs = t;
                Integer dst = map.get(ex.getSampleTrackIndex());
                if (dst != null) {
                    info.offset = 0;
                    info.size = size;
                    info.presentationTimeUs = Math.max(0, t - firstUs);
                    info.flags = (ex.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                    mux.writeSampleData(dst, buf, info);
                    samples++;
                }
                ex.advance();
            }
            mux.stop();
            started = false;
            JSONObject o = new JSONObject();
            o.put("output", ws.rel(out));
            o.put("size", out.length());
            o.put("samples", samples);
            o.put("note", "Cut points snap to the nearest earlier keyframe (no re-encoding).");
            return o.toString();
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            out.delete();
            throw e;
        } finally {
            ex.release();
            if (mux != null) {
                try { if (started) mux.stop(); } catch (Exception ignored) { }
                try { mux.release(); } catch (Exception ignored) { }
            }
        }
    }

    private static long parseLong(String s) {
        try { return s == null ? 0 : Long.parseLong(s.trim()); } catch (NumberFormatException e) { return 0; }
    }

    private static String stem(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }
}
