package com.nexus.agent;

import android.content.Context;
import android.net.wifi.WifiManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.MulticastSocket;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Casting to smart TVs, speakers and receivers on the local network via DLNA / UPnP AV (Samsung,
 * LG, Sony, Panasonic, Philips, Roku TVs, Fire TV/Kodi/VLC renderers, AV receivers …) — no SDK.
 * Discovery is SSDP; control is SOAP to the renderer's AVTransport / RenderingControl services. The
 * media itself is streamed by Nexus' local server (WebhookServer cast shares, with Range support).
 *
 * Chromecast / Google TV use Google's proprietary Cast protocol instead; for those (and for mirroring
 * the whole screen) the system Cast / Smart View panel is used.
 */
final class CastTools {
    private final Context ctx;
    private final Map<String, JSONObject> renderers = new LinkedHashMap<>();   // id → {name, model, location, avt, rc, base}

    CastTools(Context c) { ctx = c.getApplicationContext(); }

    // ------------------------------------------------------------------ discovery

    String discover(int timeoutMs) throws Exception {
        WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
        WifiManager.MulticastLock lock = wm.createMulticastLock("nexus-ssdp");
        lock.setReferenceCounted(false);
        lock.acquire();
        Map<String, String> locations = new LinkedHashMap<>();
        try (MulticastSocket sock = new MulticastSocket()) {
            sock.setSoTimeout(500);
            InetAddress group = InetAddress.getByName("239.255.255.250");
            for (String st : new String[]{"urn:schemas-upnp-org:device:MediaRenderer:1", "urn:schemas-upnp-org:service:AVTransport:1"}) {
                String msg = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: " + st + "\r\nUSER-AGENT: Android/1 UPnP/1.1 NexusAgent/2\r\n\r\n";
                byte[] b = msg.getBytes(StandardCharsets.UTF_8);
                for (int k = 0; k < 2; k++) sock.send(new DatagramPacket(b, b.length, group, 1900));
            }
            long end = System.currentTimeMillis() + Math.max(1500, Math.min(timeoutMs, 10000));
            byte[] buf = new byte[4096];
            while (System.currentTimeMillis() < end) {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try { sock.receive(p); } catch (SocketTimeoutException e) { continue; }
                String resp = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                String loc = header(resp, "location"), usn = header(resp, "usn");
                if (loc != null) locations.put(usn == null ? loc : usn.split("::")[0], loc);
            }
        } finally { lock.release(); }

        JSONArray out = new JSONArray();
        for (Map.Entry<String, String> e : locations.entrySet()) {
            try {
                JSONObject r = describe(e.getValue());
                if (r == null) continue;
                String id = e.getKey().replaceAll("^uuid:", "");
                r.put("id", id);
                synchronized (renderers) { renderers.put(id, r); }
                JSONObject pub = new JSONObject();
                pub.put("id", id); pub.put("name", r.optString("name")); pub.put("model", r.optString("model")); pub.put("host", new URL(e.getValue()).getHost());
                out.put(pub);
            } catch (Exception ignored) { }
        }
        return out.toString();
    }

    private static String header(String resp, String name) {
        for (String line : resp.split("\r\n")) {
            int i = line.indexOf(':');
            if (i > 0 && line.substring(0, i).trim().equalsIgnoreCase(name)) return line.substring(i + 1).trim();
        }
        return null;
    }

    /** Reads the device description XML and finds the AVTransport / RenderingControl control URLs. */
    private JSONObject describe(String location) throws Exception {
        String xml = get(location);
        String avt = null, rc = null;
        Matcher m = Pattern.compile("<service>(.*?)</service>", Pattern.DOTALL | Pattern.CASE_INSENSITIVE).matcher(xml);
        while (m.find()) {
            String svc = m.group(1);
            String type = tag(svc, "serviceType"), ctl = tag(svc, "controlURL");
            if (type == null || ctl == null) continue;
            if (type.contains("AVTransport")) avt = ctl;
            else if (type.contains("RenderingControl")) rc = ctl;
        }
        if (avt == null) return null;
        URL base = new URL(location);
        String urlBase = tag(xml, "URLBase");
        if (urlBase != null && !urlBase.isEmpty()) base = new URL(urlBase);
        JSONObject r = new JSONObject();
        r.put("name", unxml(firstNonNull(tag(xml, "friendlyName"), base.getHost())));
        r.put("model", unxml(firstNonNull(tag(xml, "modelName"), "")));
        r.put("avt", new URL(base, avt).toString());
        if (rc != null) r.put("rc", new URL(base, rc).toString());
        return r;
    }

    private static String firstNonNull(String a, String b) { return a != null ? a : b; }

    private static String tag(String xml, String t) {
        Matcher m = Pattern.compile("<(?:\\w+:)?" + t + "[^>]*>(.*?)</(?:\\w+:)?" + t + ">", Pattern.DOTALL | Pattern.CASE_INSENSITIVE).matcher(xml);
        return m.find() ? m.group(1).trim() : null;
    }

    private static String xml(String s) { return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }
    private static String unxml(String s) { return s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&"); }

    private static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(3000); c.setReadTimeout(5000);
        try (InputStream in = c.getInputStream()) { return read(in); } finally { c.disconnect(); }
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        return b.toString("UTF-8");
    }

    // ------------------------------------------------------------------ control

    private JSONObject renderer(String idOrName) throws Exception {
        synchronized (renderers) {
            if (renderers.isEmpty()) throw new Exception("No TV/speaker found yet — run cast discovery first");
            JSONObject r = renderers.get(idOrName);
            if (r != null) return r;
            String q = idOrName == null ? "" : idOrName.toLowerCase(Locale.ROOT);
            for (JSONObject x : renderers.values()) if (x.optString("name").toLowerCase(Locale.ROOT).contains(q)) return x;
            if (q.isEmpty() && renderers.size() == 1) return renderers.values().iterator().next();
        }
        throw new Exception("Unknown cast device: " + idOrName);
    }

    private static String soap(String controlUrl, String service, String action, String args) throws Exception {
        String body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>"
                + "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body>"
                + "<u:" + action + " xmlns:u=\"urn:schemas-upnp-org:service:" + service + ":1\">" + args + "</u:" + action + ">"
                + "</s:Body></s:Envelope>";
        HttpURLConnection c = (HttpURLConnection) new URL(controlUrl).openConnection();
        c.setConnectTimeout(4000); c.setReadTimeout(8000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"");
        c.setRequestProperty("SOAPACTION", "\"urn:schemas-upnp-org:service:" + service + ":1#" + action + "\"");
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        c.setFixedLengthStreamingMode(b.length);
        try (OutputStream os = c.getOutputStream()) { os.write(b); }
        int st = c.getResponseCode();
        InputStream in = st >= 400 ? c.getErrorStream() : c.getInputStream();
        String resp = in == null ? "" : read(in);
        c.disconnect();
        if (st >= 400) {
            String err = tag(resp, "errorDescription");
            throw new Exception(action + " failed (" + st + (err != null ? ": " + err : "") + ")");
        }
        return resp;
    }

    /** Casts a URL (http on this LAN) to the renderer and starts playback. */
    String play(String device, String url, String mime, String title) throws Exception {
        JSONObject r = renderer(device);
        String cls = mime.startsWith("video") ? "object.item.videoItem" : mime.startsWith("image") ? "object.item.imageItem.photo" : "object.item.audioItem.musicTrack";
        String didl = "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\">"
                + "<item id=\"0\" parentID=\"-1\" restricted=\"1\"><dc:title>" + xml(title) + "</dc:title><upnp:class>" + cls + "</upnp:class>"
                + "<res protocolInfo=\"http-get:*:" + mime + ":DLNA.ORG_OP=01;DLNA.ORG_CI=0\">" + xml(url) + "</res></item></DIDL-Lite>";
        String avt = r.getString("avt");
        try { soap(avt, "AVTransport", "Stop", "<InstanceID>0</InstanceID>"); } catch (Exception ignored) { }
        soap(avt, "AVTransport", "SetAVTransportURI", "<InstanceID>0</InstanceID><CurrentURI>" + xml(url) + "</CurrentURI><CurrentURIMetaData>" + xml(didl) + "</CurrentURIMetaData>");
        if (!mime.startsWith("image")) soap(avt, "AVTransport", "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>");
        return "Casting \"" + title + "\" to " + r.optString("name");
    }

    String control(String device, String action, String arg) throws Exception {
        JSONObject r = renderer(device);
        String avt = r.getString("avt");
        switch (action) {
            case "play": soap(avt, "AVTransport", "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>"); return "playing";
            case "pause": soap(avt, "AVTransport", "Pause", "<InstanceID>0</InstanceID>"); return "paused";
            case "stop": soap(avt, "AVTransport", "Stop", "<InstanceID>0</InstanceID>"); return "stopped";
            case "seek": {
                int s = Math.max(0, (int) Double.parseDouble(arg));
                String t = String.format(Locale.ROOT, "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60);
                soap(avt, "AVTransport", "Seek", "<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>" + t + "</Target>");
                return "seeked to " + t;
            }
            case "volume": {
                if (!r.has("rc")) throw new Exception("This device has no remote volume control");
                int v = Math.max(0, Math.min(100, (int) Double.parseDouble(arg)));
                soap(r.getString("rc"), "RenderingControl", "SetVolume", "<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>" + v + "</DesiredVolume>");
                return "volume " + v;
            }
            case "status": {
                String ti = soap(avt, "AVTransport", "GetTransportInfo", "<InstanceID>0</InstanceID>");
                String pi = soap(avt, "AVTransport", "GetPositionInfo", "<InstanceID>0</InstanceID>");
                JSONObject o = new JSONObject();
                o.put("device", r.optString("name"));
                o.put("state", firstNonNull(tag(ti, "CurrentTransportState"), "?"));
                o.put("position", firstNonNull(tag(pi, "RelTime"), "?"));
                o.put("duration", firstNonNull(tag(pi, "TrackDuration"), "?"));
                return o.toString();
            }
            default: throw new Exception("Unknown cast action: " + action);
        }
    }
}
