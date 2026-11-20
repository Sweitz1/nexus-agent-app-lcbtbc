package com.nexus.agent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Minimal parser for Android binary XML (AndroidManifest.xml inside an APK). Extracts the
 * package, versions, SDK levels, permissions and every component with its intent filters
 * (deep links, share targets, actions), which is what app integration needs.
 */
final class AxmlParser {

    private AxmlParser() { }

    // Framework attribute resource ids, used when attribute names were stripped.
    private static String attrName(int resId) {
        switch (resId) {
            case 0x01010003: return "name";
            case 0x01010010: return "exported";
            case 0x01010026: return "mimeType";
            case 0x01010027: return "scheme";
            case 0x01010028: return "host";
            case 0x01010029: return "port";
            case 0x0101002a: return "path";
            case 0x0101002b: return "pathPrefix";
            case 0x0101002c: return "pathPattern";
            case 0x01010018: return "authorities";
            case 0x0101021b: return "versionCode";
            case 0x0101021c: return "versionName";
            case 0x0101020c: return "minSdkVersion";
            case 0x01010270: return "targetSdkVersion";
            case 0x01010001: return "label";
            case 0x01010006: return "permission";
            default: return "";
        }
    }

    static JSONObject parseApk(File apk) throws Exception {
        try (ZipFile z = new ZipFile(apk)) {
            ZipEntry e = z.getEntry("AndroidManifest.xml");
            if (e == null) throw new IllegalArgumentException("No AndroidManifest.xml (not an APK?)");
            try (InputStream in = z.getInputStream(e)) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                Workspace.copy(in, bos);
                return parse(bos.toByteArray());
            }
        }
    }

    static JSONObject parse(byte[] data) throws Exception {
        ByteBuffer b = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        if ((b.getShort(0) & 0xffff) != 0x0003) throw new IllegalArgumentException("Not a binary XML file");
        String[] strings = new String[0];
        int[] resMap = new int[0];
        JSONObject out = new JSONObject();
        JSONArray perms = new JSONArray(), activities = new JSONArray(), services = new JSONArray(), receivers = new JSONArray(), providers = new JSONArray();
        Deque<String> stack = new ArrayDeque<>();
        JSONObject comp = null, filter = null;
        int pos = b.getShort(2) & 0xffff;
        while (pos + 8 <= data.length) {
            int type = b.getShort(pos) & 0xffff, headerSize = b.getShort(pos + 2) & 0xffff, size = b.getInt(pos + 4);
            if (size <= 0) break;
            if (type == 0x0001) strings = readPool(b, pos);
            else if (type == 0x0180) { resMap = new int[(size - headerSize) / 4]; for (int i = 0; i < resMap.length; i++) resMap[i] = b.getInt(pos + headerSize + i * 4); }
            else if (type == 0x0102) {
                int nameIdx = b.getInt(pos + 20);
                String tag = str(strings, nameIdx);
                int attrStart = b.getShort(pos + 24) & 0xffff, attrSize = b.getShort(pos + 26) & 0xffff, attrCount = b.getShort(pos + 28) & 0xffff;
                JSONObject attrs = new JSONObject();
                for (int i = 0; i < attrCount; i++) {
                    int a = pos + 16 + attrStart + i * attrSize;
                    int an = b.getInt(a + 4), raw = b.getInt(a + 8), dt = b.get(a + 15) & 0xff, d = b.getInt(a + 16);
                    String name = str(strings, an);
                    if (name.isEmpty() && an >= 0 && an < resMap.length) name = attrName(resMap[an]);
                    if (name.isEmpty()) continue;
                    Object val;
                    if (raw != -1) val = str(strings, raw);
                    else if (dt == 0x03) val = str(strings, d);
                    else if (dt == 0x12) val = d != 0;
                    else if (dt == 0x10) val = d;
                    else if (dt == 0x01) val = String.format("@0x%08x", d);
                    else val = d;
                    attrs.put(name, val);
                }
                String parent = stack.peek();
                stack.push(tag);
                switch (tag) {
                    case "manifest":
                        out.put("package", attrs.optString("package"));
                        out.put("versionName", attrs.opt("versionName"));
                        out.put("versionCode", attrs.opt("versionCode"));
                        break;
                    case "uses-sdk":
                        out.put("minSdk", attrs.opt("minSdkVersion"));
                        out.put("targetSdk", attrs.opt("targetSdkVersion"));
                        break;
                    case "uses-permission": case "uses-permission-sdk-23":
                        perms.put(attrs.optString("name"));
                        break;
                    case "activity": case "activity-alias": case "service": case "receiver": case "provider":
                        comp = new JSONObject();
                        comp.put("name", attrs.optString("name"));
                        if (attrs.has("exported")) comp.put("exported", attrs.opt("exported"));
                        if (attrs.has("permission")) comp.put("permission", attrs.optString("permission"));
                        if (attrs.has("authorities")) comp.put("authorities", attrs.optString("authorities"));
                        comp.put("filters", new JSONArray());
                        (tag.startsWith("activity") ? activities : tag.equals("service") ? services : tag.equals("receiver") ? receivers : providers).put(comp);
                        break;
                    case "intent-filter":
                        if (comp != null) { filter = new JSONObject(); filter.put("actions", new JSONArray()); filter.put("categories", new JSONArray()); filter.put("data", new JSONArray()); comp.getJSONArray("filters").put(filter); }
                        break;
                    case "action": if (filter != null && "intent-filter".equals(parent)) filter.getJSONArray("actions").put(attrs.optString("name")); break;
                    case "category": if (filter != null && "intent-filter".equals(parent)) filter.getJSONArray("categories").put(attrs.optString("name")); break;
                    case "data": if (filter != null && "intent-filter".equals(parent)) filter.getJSONArray("data").put(attrs); break;
                    default: break;
                }
            } else if (type == 0x0103) {
                String tag = stack.isEmpty() ? "" : stack.pop();
                if (tag.equals("intent-filter")) filter = null;
                if (tag.startsWith("activity") || tag.equals("service") || tag.equals("receiver") || tag.equals("provider")) comp = null;
            }
            pos += size;
        }
        out.put("permissions", perms);
        out.put("activities", activities);
        out.put("services", services);
        out.put("receivers", receivers);
        out.put("providers", providers);
        return out;
    }

    private static String str(String[] s, int i) { return i >= 0 && i < s.length && s[i] != null ? s[i] : ""; }

    private static String[] readPool(ByteBuffer b, int pos) {
        int count = b.getInt(pos + 8), flags = b.getInt(pos + 16), stringsStart = b.getInt(pos + 20);
        boolean utf8 = (flags & (1 << 8)) != 0;
        String[] out = new String[count];
        for (int i = 0; i < count; i++) {
            int off = pos + stringsStart + b.getInt(pos + 28 + i * 4);
            try {
                if (utf8) {
                    int p = off;
                    int n = b.get(p) & 0xff; p += (n & 0x80) != 0 ? 2 : 1;           // char length (skipped)
                    int len = b.get(p) & 0xff;
                    if ((len & 0x80) != 0) { len = ((len & 0x7f) << 8) | (b.get(p + 1) & 0xff); p += 2; } else p += 1;
                    byte[] bytes = new byte[len];
                    for (int k = 0; k < len; k++) bytes[k] = b.get(p + k);
                    out[i] = new String(bytes, StandardCharsets.UTF_8);
                } else {
                    int len = b.getShort(off) & 0xffff, p = off + 2;
                    if ((len & 0x8000) != 0) { len = ((len & 0x7fff) << 16) | (b.getShort(off + 2) & 0xffff); p += 2; }
                    char[] c = new char[len];
                    for (int k = 0; k < len; k++) c[k] = b.getChar(p + k * 2);
                    out[i] = new String(c);
                }
            } catch (Exception e) {
                out[i] = "";
            }
        }
        return out;
    }
}
