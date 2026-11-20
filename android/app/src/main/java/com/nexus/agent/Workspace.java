package com.nexus.agent;

import android.content.Context;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * The agent's private file workspace (app-internal storage, invisible to other apps).
 * All paths coming from JS are relative to the workspace root and are confined to it.
 */
class Workspace {

    final File root;

    Workspace(Context c) {
        root = new File(c.getFilesDir(), "workspace");
        //noinspection ResultOfMethodCallIgnored
        root.mkdirs();
    }

    /** Resolves a relative path inside the workspace; throws on any escape attempt. */
    File resolve(String rel) throws IOException {
        if (rel == null) rel = "";
        rel = rel.replace('\\', '/');
        while (rel.startsWith("/")) rel = rel.substring(1);
        if (rel.startsWith("workspace/")) rel = rel.substring("workspace/".length());
        File f = new File(root, rel).getCanonicalFile();
        String r = root.getCanonicalPath();
        if (!f.getPath().equals(r) && !f.getPath().startsWith(r + File.separator))
            throw new IOException("Path escapes the workspace: " + rel);
        return f;
    }

    String rel(File f) throws IOException {
        String r = root.getCanonicalPath();
        String p = f.getCanonicalPath();
        return p.length() <= r.length() ? "" : p.substring(r.length() + 1);
    }

    /** Picks a free name like "photo (2).jpg" if the path is taken. */
    File unique(String rel) throws IOException {
        File f = resolve(rel);
        if (!f.exists()) return f;
        String name = f.getName();
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 2; i < 10000; i++) {
            File g = new File(f.getParentFile(), stem + " (" + i + ")" + ext);
            if (!g.exists()) return g;
        }
        throw new IOException("No free file name");
    }

    String list(String dir, boolean recursive) throws Exception {
        File d = resolve(dir);
        JSONArray out = new JSONArray();
        if (d.isDirectory()) walk(d, recursive, out, 0);
        return out.toString();
    }

    private void walk(File d, boolean recursive, JSONArray out, int depth) throws Exception {
        File[] kids = d.listFiles();
        if (kids == null) return;
        Arrays.sort(kids, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
        for (File k : kids) {
            JSONObject o = new JSONObject();
            o.put("path", rel(k));
            o.put("name", k.getName());
            o.put("dir", k.isDirectory());
            o.put("size", k.isDirectory() ? 0 : k.length());
            o.put("mtime", k.lastModified());
            o.put("mime", k.isDirectory() ? "inode/directory" : MainActivity.mimeFor(k.getName()));
            out.put(o);
            if (recursive && k.isDirectory() && depth < 12 && out.length() < 5000) walk(k, true, out, depth + 1);
        }
    }

    String stat(String path) throws Exception {
        File f = resolve(path);
        JSONObject o = new JSONObject();
        o.put("exists", f.exists());
        o.put("path", rel(f));
        o.put("dir", f.isDirectory());
        o.put("size", f.length());
        o.put("mtime", f.lastModified());
        o.put("mime", MainActivity.mimeFor(f.getName()));
        return o.toString();
    }

    byte[] readBytes(String path, long max) throws IOException {
        File f = resolve(path);
        if (f.length() > max) throw new IOException("File too large (" + f.length() + " bytes)");
        try (InputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()];
            int off = 0, n;
            while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n;
            return b;
        }
    }

    String readText(String path) throws IOException {
        return new String(readBytes(path, 20L * 1024 * 1024), StandardCharsets.UTF_8);
    }

    String readB64(String path) throws IOException {
        return Base64.encodeToString(readBytes(path, 60L * 1024 * 1024), Base64.NO_WRAP);
    }

    String write(String path, byte[] data) throws IOException {
        File f = resolve(path);
        File parent = f.getParentFile();
        if (parent != null) //noinspection ResultOfMethodCallIgnored
            parent.mkdirs();
        try (OutputStream os = new FileOutputStream(f)) { os.write(data); }
        return rel(f);
    }

    boolean delete(String path) throws IOException {
        File f = resolve(path);
        if (f.getCanonicalPath().equals(root.getCanonicalPath())) throw new IOException("Refusing to delete the workspace root");
        return deleteTree(f);
    }

    private static boolean deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        return f.delete();
    }

    String move(String from, String to) throws IOException {
        File a = resolve(from), b = resolve(to);
        File parent = b.getParentFile();
        if (parent != null) //noinspection ResultOfMethodCallIgnored
            parent.mkdirs();
        if (!a.renameTo(b)) throw new IOException("Move failed");
        return rel(b);
    }

    static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    static List<File> filesUnder(File f) {
        List<File> out = new ArrayList<>();
        if (f.isFile()) out.add(f);
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) out.addAll(filesUnder(k));
        return out;
    }
}
