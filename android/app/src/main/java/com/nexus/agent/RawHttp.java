package com.nexus.agent;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Locale;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Tiny HTTP/1.1 client for methods HttpURLConnection rejects (PROPFIND, REPORT, MKCALENDAR,
 * PATCH...). Needed for CalDAV. TLS uses the system trust store and hostname verification.
 */
final class RawHttp {

    private RawHttp() { }

    /** Android's default verifier (OkHostnameVerifier); replaceable for JVM tests. */
    static HostnameVerifier verifier = HttpsURLConnection.getDefaultHostnameVerifier();

    static JSONObject request(String method, String urlStr, JSONObject headers, String body, int timeoutMs) throws Exception {
        String current = urlStr;
        for (int hop = 0; hop < 5; hop++) {
            JSONObject r = once(method, new URL(current), headers, body, timeoutMs);
            int st = r.getInt("status");
            String loc = r.getJSONObject("headers").optString("location", "");
            if ((st == 301 || st == 302 || st == 307 || st == 308) && !loc.isEmpty()) {
                current = new URL(new URL(current), loc).toString();
                continue;
            }
            return r;
        }
        throw new IOException("Too many redirects");
    }

    private static JSONObject once(String method, URL url, JSONObject headers, String body, int timeoutMs) throws Exception {
        boolean tls = "https".equals(url.getProtocol());
        if (!tls && !"http".equals(url.getProtocol())) throw new IllegalArgumentException("Only http/https");
        String host = url.getHost();
        int port = url.getPort() > 0 ? url.getPort() : (tls ? 443 : 80);
        Socket s;
        if (tls) {
            Socket plain = new Socket();
            plain.connect(new InetSocketAddress(host, port), Math.min(timeoutMs, 20000));
            plain.setSoTimeout(timeoutMs);
            // Layer TLS with the hostname so SNI is sent, then verify the certificate name.
            SSLSocket wrapped = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(plain, host, port, true);
            wrapped.startHandshake();
            if (!verifier.verify(host, wrapped.getSession())) { wrapped.close(); throw new IOException("TLS hostname mismatch for " + host); }
            s = wrapped;
        } else {
            s = new Socket();
            s.connect(new InetSocketAddress(host, port), Math.min(timeoutMs, 20000));
        }
        try (Socket sock = s) {
            sock.setSoTimeout(timeoutMs);
            byte[] payload = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
            String path = url.getFile().isEmpty() ? "/" : url.getFile();
            StringBuilder req = new StringBuilder();
            req.append(method).append(' ').append(path).append(" HTTP/1.1\r\n");
            req.append("Host: ").append(host).append(url.getPort() > 0 ? ":" + url.getPort() : "").append("\r\n");
            req.append("Connection: close\r\n");
            boolean hasUa = false;
            if (headers != null) {
                Iterator<String> it = headers.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    String lk = k.toLowerCase(Locale.ROOT);
                    if (lk.equals("host") || lk.equals("content-length") || lk.equals("connection") || lk.equals("accept-encoding")) continue;
                    if (lk.equals("user-agent")) hasUa = true;
                    req.append(k).append(": ").append(headers.optString(k).replace("\r", "").replace("\n", "")).append("\r\n");
                }
            }
            if (!hasUa) req.append("User-Agent: NexusAgent/1.0 (Android; RayNeo)\r\n");
            req.append("Content-Length: ").append(payload.length).append("\r\n\r\n");
            OutputStream out = sock.getOutputStream();
            out.write(req.toString().getBytes(StandardCharsets.UTF_8));
            out.write(payload);
            out.flush();

            InputStream in = new BufferedInputStream(sock.getInputStream());
            String statusLine = readLine(in);
            if (statusLine == null) throw new IOException("Empty response");
            String[] parts = statusLine.split(" ", 3);
            int status = Integer.parseInt(parts[1]);
            JSONObject rh = new JSONObject();
            long len = -1;
            boolean chunked = false;
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int i = line.indexOf(':');
                if (i <= 0) continue;
                String k = line.substring(0, i).trim().toLowerCase(Locale.ROOT), v = line.substring(i + 1).trim();
                rh.put(k, v);
                if (k.equals("content-length")) len = Long.parseLong(v);
                if (k.equals("transfer-encoding") && v.toLowerCase(Locale.ROOT).contains("chunked")) chunked = true;
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            if (method.equals("HEAD") || status == 204 || status == 304) {
                // no body
            } else if (chunked) {
                while (true) {
                    String sz = readLine(in);
                    if (sz == null) break;
                    int semi = sz.indexOf(';');
                    int n = Integer.parseInt((semi >= 0 ? sz.substring(0, semi) : sz).trim(), 16);
                    if (n == 0) break;
                    copyN(in, bos, n);
                    readLine(in);
                }
            } else if (len >= 0) {
                copyN(in, bos, len);
            } else {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0 && bos.size() < 8 * 1024 * 1024) bos.write(buf, 0, n);
            }
            JSONObject res = new JSONObject();
            res.put("status", status);
            res.put("headers", rh);
            res.put("body", bos.toString("UTF-8"));
            return res;
        }
    }

    private static void copyN(InputStream in, ByteArrayOutputStream out, long n) throws IOException {
        byte[] buf = new byte[16384];
        while (n > 0) {
            int r = in.read(buf, 0, (int) Math.min(buf.length, n));
            if (r < 0) break;
            out.write(buf, 0, r);
            n -= r;
        }
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
        }
        if (c == -1 && b.size() == 0) return null;
        return b.toString("UTF-8");
    }
}
