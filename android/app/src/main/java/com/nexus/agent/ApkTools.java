package com.nexus.agent;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Installed-app inventory, APK backup/inspection/install, and app-integration discovery. */
class ApkTools {

    private final Context ctx;
    private final Workspace ws;

    ApkTools(Context ctx, Workspace ws) { this.ctx = ctx; this.ws = ws; }

    private PackageManager pm() { return ctx.getPackageManager(); }

    String list(boolean includeSystem, String filter) throws Exception {
        JSONArray arr = new JSONArray();
        String f = filter == null ? "" : filter.toLowerCase();
        for (PackageInfo pi : pm().getInstalledPackages(0)) {
            ApplicationInfo ai = pi.applicationInfo;
            if (ai == null) continue;
            boolean sys = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0;
            if (sys && !includeSystem) continue;
            String label = String.valueOf(ai.loadLabel(pm()));
            if (!f.isEmpty() && !label.toLowerCase().contains(f) && !pi.packageName.toLowerCase().contains(f)) continue;
            JSONObject o = new JSONObject();
            o.put("label", label);
            o.put("package", pi.packageName);
            o.put("version", pi.versionName);
            o.put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
            o.put("system", sys);
            o.put("split", ai.splitSourceDirs != null && ai.splitSourceDirs.length > 0);
            long size = new File(ai.sourceDir).length();
            if (ai.splitSourceDirs != null) for (String s : ai.splitSourceDirs) size += new File(s).length();
            o.put("sizeMB", Math.round(size / 104857.6) / 10.0);
            o.put("updated", pi.lastUpdateTime);
            try {
                o.put("installer", Build.VERSION.SDK_INT >= 30 ? pm().getInstallSourceInfo(pi.packageName).getInstallingPackageName() : pm().getInstallerPackageName(pi.packageName));
            } catch (Exception ignored) { }
            arr.put(o);
        }
        return arr.toString();
    }

    /** Copies an installed app's APK (or base + split APKs as a .apks zip) into the workspace. */
    String extract(String pkg) throws Exception {
        PackageInfo pi = pm().getPackageInfo(pkg, 0);
        ApplicationInfo ai = pi.applicationInfo;
        String base = "apks/" + pkg + "_" + (pi.versionName == null ? "" : pi.versionName.replaceAll("[^\\w.-]", "_"));
        JSONObject o = new JSONObject();
        if (ai.splitSourceDirs == null || ai.splitSourceDirs.length == 0) {
            File out = ws.unique(base + ".apk");
            File p = out.getParentFile();
            if (p != null) //noinspection ResultOfMethodCallIgnored
                p.mkdirs();
            try (InputStream in = new FileInputStream(ai.sourceDir); OutputStream os = new FileOutputStream(out)) { Workspace.copy(in, os); }
            o.put("path", ws.rel(out));
            o.put("size", out.length());
        } else {
            File out = ws.unique(base + ".apks");
            File p = out.getParentFile();
            if (p != null) //noinspection ResultOfMethodCallIgnored
                p.mkdirs();
            List<String> files = new ArrayList<>();
            files.add(ai.sourceDir);
            for (String s : ai.splitSourceDirs) files.add(s);
            try (ZipOutputStream z = new ZipOutputStream(new FileOutputStream(out))) {
                for (String s : files) {
                    z.putNextEntry(new ZipEntry(new File(s).getName()));
                    try (InputStream in = new FileInputStream(s)) { Workspace.copy(in, z); }
                    z.closeEntry();
                }
            }
            o.put("path", ws.rel(out));
            o.put("size", out.length());
            o.put("note", "Split APK bundle (" + files.size() + " parts) — install with an app that supports .apks (e.g. SAI) or adb install-multiple.");
        }
        return o.toString();
    }

    private File apkFile(String ref) throws Exception {
        if (ref.contains("/") || ref.endsWith(".apk")) {
            File f = ws.resolve(ref);
            if (f.isFile()) return f;
        }
        return new File(pm().getApplicationInfo(ref, 0).sourceDir);
    }

    /** Manifest summary + signing certificate of an installed app or a workspace APK. */
    String inspect(String ref) throws Exception {
        File f = apkFile(ref);
        JSONObject m = AxmlParser.parseApk(f);
        JSONObject o = new JSONObject();
        o.put("package", m.optString("package"));
        o.put("versionName", m.opt("versionName"));
        o.put("versionCode", m.opt("versionCode"));
        o.put("minSdk", m.opt("minSdk"));
        o.put("targetSdk", m.opt("targetSdk"));
        o.put("sizeMB", Math.round(f.length() / 104857.6) / 10.0);
        o.put("permissions", m.getJSONArray("permissions"));
        for (String k : new String[]{"activities", "services", "receivers", "providers"}) o.put(k + "Count", m.getJSONArray(k).length());
        try {
            int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            PackageInfo pi = pm().getPackageArchiveInfo(f.getAbsolutePath(), flags);
            if (pi != null) {
                pi.applicationInfo.sourceDir = f.getAbsolutePath();
                pi.applicationInfo.publicSourceDir = f.getAbsolutePath();
                o.put("label", String.valueOf(pi.applicationInfo.loadLabel(pm())));
                Signature[] sigs = Build.VERSION.SDK_INT >= 28 && pi.signingInfo != null ? pi.signingInfo.getApkContentsSigners() : pi.signatures;
                if (sigs != null && sigs.length > 0) {
                    byte[] d = MessageDigest.getInstance("SHA-256").digest(sigs[0].toByteArray());
                    StringBuilder sb = new StringBuilder();
                    for (byte x : d) sb.append(String.format("%02X:", x));
                    o.put("signerSha256", sb.substring(0, sb.length() - 1));
                }
            }
        } catch (Exception ignored) { }
        o.put("integrations", integrationsFrom(m));
        return o.toString();
    }

    String integrations(String ref) throws Exception {
        JSONObject m = AxmlParser.parseApk(apkFile(ref));
        JSONObject o = integrationsFrom(m);
        o.put("package", m.optString("package"));
        return o.toString();
    }

    /** Turns exported intent filters into usable entry points: deep links, share targets, text actions. */
    private static JSONObject integrationsFrom(JSONObject m) throws Exception {
        JSONArray links = new JSONArray(), share = new JSONArray(), text = new JSONArray(), actions = new JSONArray();
        JSONArray acts = m.getJSONArray("activities");
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (int i = 0; i < acts.length(); i++) {
            JSONObject c = acts.getJSONObject(i);
            JSONArray fs = c.getJSONArray("filters");
            boolean exported = c.has("exported") ? c.optBoolean("exported") : fs.length() > 0;
            if (!exported) continue;
            for (int k = 0; k < fs.length(); k++) {
                JSONObject f = fs.getJSONObject(k);
                List<String> as = new ArrayList<>(), cs = new ArrayList<>();
                for (int x = 0; x < f.getJSONArray("actions").length(); x++) as.add(f.getJSONArray("actions").getString(x));
                for (int x = 0; x < f.getJSONArray("categories").length(); x++) cs.add(f.getJSONArray("categories").getString(x));
                JSONArray data = f.getJSONArray("data");
                if (as.contains("android.intent.action.VIEW") && cs.contains("android.intent.category.BROWSABLE")) {
                    List<String> schemes = new ArrayList<>(), hosts = new ArrayList<>(), paths = new ArrayList<>();
                    for (int x = 0; x < data.length(); x++) {
                        JSONObject d = data.getJSONObject(x);
                        if (d.has("scheme")) schemes.add(d.optString("scheme"));
                        if (d.has("host")) hosts.add(d.optString("host"));
                        for (String pk : new String[]{"path", "pathPrefix", "pathPattern"}) if (d.has(pk)) paths.add(d.optString(pk) + (pk.equals("pathPrefix") ? "…" : ""));
                    }
                    for (String s : schemes.isEmpty() ? java.util.Collections.singletonList("") : schemes) {
                        for (String h : hosts.isEmpty() ? java.util.Collections.singletonList("") : hosts) {
                            String key = s + "://" + h;
                            if (s.isEmpty() || !seen.add(key)) continue;
                            JSONObject l = new JSONObject();
                            l.put("url", s + "://" + h + (paths.isEmpty() ? "" : (paths.get(0).startsWith("/") ? "" : "/") + paths.get(0)));
                            l.put("activity", c.getString("name"));
                            if (paths.size() > 1) l.put("paths", new JSONArray(paths.subList(0, Math.min(6, paths.size()))));
                            links.put(l);
                        }
                    }
                } else if (as.contains("android.intent.action.SEND") || as.contains("android.intent.action.SEND_MULTIPLE")) {
                    for (int x = 0; x < data.length(); x++) {
                        String mt = data.getJSONObject(x).optString("mimeType");
                        if (!mt.isEmpty() && seen.add("share:" + mt + c.getString("name"))) { JSONObject s = new JSONObject(); s.put("mimeType", mt); s.put("activity", c.getString("name")); s.put("multiple", as.contains("android.intent.action.SEND_MULTIPLE")); share.put(s); }
                    }
                } else if (as.contains("android.intent.action.PROCESS_TEXT")) {
                    JSONObject t = new JSONObject(); t.put("activity", c.getString("name")); text.put(t);
                } else {
                    for (String a : as) if (!a.equals("android.intent.action.MAIN") && !a.startsWith("android.intent.action.VIEW") && seen.add("a:" + a)) { JSONObject t = new JSONObject(); t.put("action", a); t.put("activity", c.getString("name")); actions.put(t); }
                }
            }
        }
        JSONObject o = new JSONObject();
        o.put("deepLinks", links);
        o.put("shareTargets", share);
        o.put("textActions", text);
        o.put("customActions", actions);
        return o;
    }

    /** Opens the system installer for a workspace APK (user confirms). */
    String install(String path) throws Exception {
        if (Build.VERSION.SDK_INT >= 26 && !pm().canRequestPackageInstalls()) {
            ctx.startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return "First allow \"Install unknown apps\" for Nexus Agent (settings opened), then try again.";
        }
        File f = ws.resolve(path);
        if (!f.getName().endsWith(".apk")) throw new IllegalArgumentException("Only single .apk files can be installed here");
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(WorkspaceProvider.uriFor(ctx, f), "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        return "Android's installer is open — confirm the install there.";
    }

    String uninstall(String pkg) {
        Intent i = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        return "Android's uninstall dialog is open — confirm there.";
    }
}
