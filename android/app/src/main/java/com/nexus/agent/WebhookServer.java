package com.nexus.agent;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Minimal HTTP/1.1 server for incoming webhooks and the phone "remote console".
 *
 *   GET  /            remote console page (assets/remote.html) - type to the glasses from a phone
 *   GET  /health      {"ok":true}
 *   any  /...         token-checked, forwarded to the web layer as a "webhook" event; the JS
 *                     agent runtime answers through NativeBridge.serverRespond().
 *
 * Runs only while the app is open. Bound to all interfaces on the chosen port, so keep a
 * token set when on shared Wi-Fi.
 */
class WebhookServer extends Thread {

    private static final int MAX_BODY = 2 * 1024 * 1024;
    private static final long RESPONSE_TIMEOUT_S = 300;

    private final MainActivity activity;
    private final int port;
    private final String token;
    private final ExecutorService workers = Executors.newFixedThreadPool(6);
    private final ConcurrentHashMap<String, Pending> pending = new ConcurrentHashMap<>();
    private volatile ServerSocket socket;
    private volatile boolean running = false;

    private static final class Pending {
        final CountDownLatch latch = new CountDownLatch(1);
        int status = 504;
        String contentType = "application/json";
        String body = "{\"error\":\"agent timeout\"}";
    }

    WebhookServer(MainActivity activity, int port, String token) throws IOException {
        super("nexus-webhook-server");
        this.activity = activity;
        this.port = port;
        this.token = token == null ? "" : token;
        socket = new ServerSocket();
        socket.setReuseAddress(true);
        socket.bind(new InetSocketAddress(port));
        running = true;
    }

    boolean isRunning() { return running; }

    @Override
    public void run() {
        while (running) {
            try {
                Socket s = socket.accept();
                workers.execute(() -> handle(s));
            } catch (IOException e) {
                if (!running) break;
            }
        }
    }

    void shutdown() {
        running = false;
        try { socket.close(); } catch (IOException ignored) { }
        for (Pending p : pending.values()) p.latch.countDown();
        workers.shutdownNow();
    }

    void respond(String reqId, int status, String contentType, String body) {
        Pending p = pending.get(reqId);
        if (p == null) return;
        p.status = status;
        p.contentType = contentType == null || contentType.isEmpty() ? "application/json" : contentType;
        p.body = body == null ? "" : body;
        p.latch.countDown();
    }

    private void handle(Socket s) {
        try (Socket sock = s) {
            sock.setSoTimeout(30000);
            InputStream in = new BufferedInputStream(sock.getInputStream());
            OutputStream out = sock.getOutputStream();

            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) { write(out, 400, "text/plain", "bad request"); return; }
            String method = parts[0].toUpperCase(Locale.ROOT);
            String target = parts[1];

            JSONObject headers = new JSONObject();
            int contentLength = 0;
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int idx = line.indexOf(':');
                if (idx <= 0) continue;
                String k = line.substring(0, idx).trim().toLowerCase(Locale.ROOT);
                String v = line.substring(idx + 1).trim();
                headers.put(k, v);
                if (k.equals("content-length")) {
                    try { contentLength = Integer.parseInt(v); } catch (NumberFormatException ignored) { }
                }
            }
            if (contentLength > MAX_BODY) { write(out, 413, "text/plain", "payload too large"); return; }
            byte[] bodyBytes = new byte[Math.max(0, contentLength)];
            int read = 0;
            while (read < contentLength) {
                int n = in.read(bodyBytes, read, contentLength - read);
                if (n < 0) break;
                read += n;
            }
            String body = new String(bodyBytes, 0, read, StandardCharsets.UTF_8);

            String path = target;
            String query = "";
            int q = target.indexOf('?');
            if (q >= 0) { path = target.substring(0, q); query = target.substring(q + 1); }

            if (method.equals("OPTIONS")) { write(out, 204, "text/plain", ""); return; }
            if (method.equals("GET") && (path.equals("/") || path.equals("/remote"))) {
                write(out, 200, "text/html; charset=utf-8", readAsset("remote.html"));
                return;
            }
            if (path.equals("/health")) { write(out, 200, "application/json", "{\"ok\":true,\"app\":\"nexus-agent\"}"); return; }

            if (!token.isEmpty()) {
                String supplied = "";
                String auth = headers.optString("authorization", "");
                if (auth.toLowerCase(Locale.ROOT).startsWith("bearer ")) supplied = auth.substring(7).trim();
                if (supplied.isEmpty()) supplied = headers.optString("x-nexus-token", "");
                if (supplied.isEmpty()) supplied = queryParam(query, "token");
                if (!constantTimeEquals(token, supplied)) {
                    write(out, 401, "application/json", "{\"error\":\"invalid or missing token\"}");
                    return;
                }
            }

            String reqId = UUID.randomUUID().toString();
            Pending p = new Pending();
            pending.put(reqId, p);
            JSONObject ev = new JSONObject();
            ev.put("reqId", reqId);
            ev.put("method", method);
            ev.put("path", path);
            ev.put("query", query);
            ev.put("headers", headers);
            ev.put("body", body);
            ev.put("remote", String.valueOf(sock.getInetAddress().getHostAddress()));
            activity.emit("webhook", ev.toString());

            boolean done = p.latch.await(RESPONSE_TIMEOUT_S, TimeUnit.SECONDS);
            pending.remove(reqId);
            if (!done) { write(out, 504, "application/json", "{\"error\":\"agent timeout\"}"); return; }
            write(out, p.status, p.contentType, p.body);
        } catch (Exception ignored) {
        }
    }

    private static String queryParam(String query, String name) {
        for (String kv : query.split("&")) {
            int e = kv.indexOf('=');
            if (e > 0 && kv.substring(0, e).equals(name)) {
                try { return URLDecoder.decode(kv.substring(e + 1), "UTF-8"); } catch (Exception ignored) { }
            }
        }
        return "";
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private String readAsset(String name) {
        try (InputStream is = activity.getAssets().open(name)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toString("UTF-8");
        } catch (IOException e) {
            return "<h1>Nexus Agent</h1>";
        }
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') bos.write(c);
            if (bos.size() > 16384) break;
        }
        if (c == -1 && bos.size() == 0) return null;
        return bos.toString("UTF-8");
    }

    private static void write(OutputStream out, int status, String type, String body) throws IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + b.length + "\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Headers: Content-Type, Authorization, X-Nexus-Token\r\n"
                + "Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.UTF_8));
        out.write(b);
        out.flush();
    }

    private static String reason(int s) {
        switch (s) {
            case 200: return "OK";
            case 204: return "No Content";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 404: return "Not Found";
            case 413: return "Payload Too Large";
            case 500: return "Internal Server Error";
            case 504: return "Gateway Timeout";
            default: return "Status";
        }
    }
}
