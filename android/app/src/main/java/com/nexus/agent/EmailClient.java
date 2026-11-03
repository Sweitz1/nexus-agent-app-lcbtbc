package com.nexus.agent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Properties;

import javax.mail.Address;
import javax.mail.FetchProfile;
import javax.mail.Flags;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.Multipart;
import javax.mail.Part;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.Transport;
import javax.mail.UIDFolder;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeBodyPart;
import javax.mail.internet.MimeMessage;
import javax.mail.internet.MimeMultipart;
import javax.mail.internet.MimeUtility;
import javax.mail.search.AndTerm;
import javax.mail.search.BodyTerm;
import javax.mail.search.ComparisonTerm;
import javax.mail.search.FlagTerm;
import javax.mail.search.FromStringTerm;
import javax.mail.search.OrTerm;
import javax.mail.search.ReceivedDateTerm;
import javax.mail.search.SearchTerm;
import javax.mail.search.SubjectTerm;

/**
 * Minimal IMAP + SMTP client on top of JavaMail.
 *
 * Every call gets the account in the spec:
 *   account = {email, username, password, fromName,
 *              imapHost, imapPort, imapSecurity: ssl|starttls|none,
 *              smtpHost, smtpPort, smtpSecurity: ssl|starttls|none}
 */
class EmailClient {

    private final Workspace ws;

    EmailClient(Workspace ws) { this.ws = ws; }

    String run(JSONObject spec) throws Exception {
        JSONObject acct = spec.getJSONObject("account");
        String op = spec.optString("op");
        switch (op) {
            case "test": return test(acct);
            case "folders": return folders(acct);
            case "list": return list(acct, spec);
            case "read": return read(acct, spec);
            case "modify": return modify(acct, spec);
            case "send": return send(acct, spec);
            default: throw new IllegalArgumentException("unknown email op " + op);
        }
    }

    // ------------------------------------------------------------------ IMAP

    private Store openStore(JSONObject a) throws Exception {
        String sec = a.optString("imapSecurity", "ssl");
        String proto = sec.equals("ssl") ? "imaps" : "imap";
        Properties p = new Properties();
        p.put("mail.store.protocol", proto);
        p.put("mail." + proto + ".host", a.getString("imapHost"));
        p.put("mail." + proto + ".port", String.valueOf(a.optInt("imapPort", sec.equals("ssl") ? 993 : 143)));
        p.put("mail." + proto + ".connectiontimeout", "20000");
        p.put("mail." + proto + ".timeout", "45000");
        p.put("mail." + proto + ".writetimeout", "45000");
        if (sec.equals("starttls")) {
            p.put("mail.imap.starttls.enable", "true");
            p.put("mail.imap.starttls.required", "true");
        }
        if (!sec.equals("none")) p.put("mail." + proto + ".ssl.checkserveridentity", "true");
        Session s = Session.getInstance(p);
        Store st = s.getStore(proto);
        st.connect(a.getString("imapHost"), a.optInt("imapPort", sec.equals("ssl") ? 993 : 143), user(a), a.getString("password"));
        return st;
    }

    private static String user(JSONObject a) {
        String u = a.optString("username", "");
        return u.isEmpty() ? a.optString("email") : u;
    }

    private String test(JSONObject a) throws Exception {
        JSONObject o = new JSONObject();
        Store st = openStore(a);
        try {
            Folder inbox = st.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            o.put("imap", "ok");
            o.put("inboxMessages", inbox.getMessageCount());
            o.put("inboxUnread", inbox.getUnreadMessageCount());
            inbox.close(false);
        } finally { st.close(); }
        Transport t = smtpSession(a).getTransport("smtp");
        try {
            t.connect(a.getString("smtpHost"), a.optInt("smtpPort", 465), user(a), a.getString("password"));
            o.put("smtp", "ok");
        } finally { t.close(); }
        return o.toString();
    }

    private String folders(JSONObject a) throws Exception {
        Store st = openStore(a);
        try {
            JSONArray arr = new JSONArray();
            for (Folder f : st.getDefaultFolder().list("*")) {
                if ((f.getType() & Folder.HOLDS_MESSAGES) == 0) continue;
                arr.put(f.getFullName());
            }
            return arr.toString();
        } finally { st.close(); }
    }

    private String list(JSONObject a, JSONObject spec) throws Exception {
        int limit = Math.max(1, Math.min(spec.optInt("limit", 15), 100));
        Store st = openStore(a);
        try {
            Folder f = st.getFolder(spec.optString("folder", "INBOX"));
            f.open(Folder.READ_ONLY);
            List<SearchTerm> terms = new ArrayList<>();
            if (spec.optBoolean("unreadOnly")) terms.add(new FlagTerm(new Flags(Flags.Flag.SEEN), false));
            String q = spec.optString("query", "");
            if (!q.isEmpty()) terms.add(new OrTerm(new SearchTerm[]{new SubjectTerm(q), new FromStringTerm(q), new BodyTerm(q)}));
            String from = spec.optString("from", "");
            if (!from.isEmpty()) terms.add(new FromStringTerm(from));
            long since = spec.optLong("sinceMs", 0);
            if (since > 0) terms.add(new ReceivedDateTerm(ComparisonTerm.GE, new Date(since)));
            Message[] msgs;
            if (terms.isEmpty()) {
                int n = f.getMessageCount();
                msgs = n == 0 ? new Message[0] : f.getMessages(Math.max(1, n - limit + 1), n);
            } else {
                msgs = f.search(terms.size() == 1 ? terms.get(0) : new AndTerm(terms.toArray(new SearchTerm[0])));
            }
            int start = Math.max(0, msgs.length - limit);
            Message[] page = new Message[msgs.length - start];
            System.arraycopy(msgs, start, page, 0, page.length);
            FetchProfile fp = new FetchProfile();
            fp.add(FetchProfile.Item.ENVELOPE);
            fp.add(FetchProfile.Item.FLAGS);
            fp.add(FetchProfile.Item.CONTENT_INFO);
            fp.add(UIDFolder.FetchProfileItem.UID);
            f.fetch(page, fp);
            JSONArray arr = new JSONArray();
            UIDFolder uf = (UIDFolder) f;
            for (int i = page.length - 1; i >= 0; i--) {   // newest first
                Message m = page[i];
                JSONObject o = new JSONObject();
                o.put("uid", uf.getUID(m));
                o.put("from", addrs(m.getFrom()));
                o.put("to", addrs(m.getRecipients(Message.RecipientType.TO)));
                o.put("subject", m.getSubject() == null ? "" : m.getSubject());
                Date d = m.getReceivedDate() != null ? m.getReceivedDate() : m.getSentDate();
                o.put("date", d == null ? 0 : d.getTime());
                o.put("unread", !m.isSet(Flags.Flag.SEEN));
                o.put("flagged", m.isSet(Flags.Flag.FLAGGED));
                o.put("hasAttachments", m.isMimeType("multipart/mixed"));
                arr.put(o);
            }
            JSONObject res = new JSONObject();
            res.put("folder", f.getFullName());
            res.put("total", f.getMessageCount());
            res.put("matched", msgs.length);
            res.put("messages", arr);
            f.close(false);
            return res.toString();
        } finally { st.close(); }
    }

    private String read(JSONObject a, JSONObject spec) throws Exception {
        Store st = openStore(a);
        try {
            Folder f = st.getFolder(spec.optString("folder", "INBOX"));
            boolean markRead = spec.optBoolean("markRead", false);
            f.open(markRead ? Folder.READ_WRITE : Folder.READ_ONLY);
            Message m = ((UIDFolder) f).getMessageByUID(spec.getLong("uid"));
            if (m == null) throw new IllegalArgumentException("No message with uid " + spec.optLong("uid"));
            JSONObject o = new JSONObject();
            o.put("uid", spec.getLong("uid"));
            o.put("from", addrs(m.getFrom()));
            o.put("replyTo", addrs(m.getReplyTo()));
            o.put("to", addrs(m.getRecipients(Message.RecipientType.TO)));
            o.put("cc", addrs(m.getRecipients(Message.RecipientType.CC)));
            o.put("subject", m.getSubject() == null ? "" : m.getSubject());
            Date d = m.getSentDate() != null ? m.getSentDate() : m.getReceivedDate();
            o.put("date", d == null ? 0 : d.getTime());
            String[] mid = m.getHeader("Message-ID");
            o.put("messageId", mid != null && mid.length > 0 ? mid[0] : "");
            String[] refs = m.getHeader("References");
            o.put("references", refs != null && refs.length > 0 ? refs[0] : "");
            StringBuilder text = new StringBuilder(), html = new StringBuilder();
            JSONArray atts = new JSONArray();
            String saveDir = spec.optBoolean("saveAttachments", false) ? "email/" + spec.getLong("uid") : null;
            walk(m, text, html, atts, saveDir);
            o.put("text", text.toString());
            o.put("html", text.length() == 0 ? html.toString() : "");
            o.put("attachments", atts);
            if (markRead) m.setFlag(Flags.Flag.SEEN, true);
            f.close(false);
            return o.toString();
        } finally { st.close(); }
    }

    private void walk(Part p, StringBuilder text, StringBuilder html, JSONArray atts, String saveDir) throws Exception {
        String disp = p.getDisposition();
        String fname = p.getFileName();
        if (fname != null) fname = MimeUtility.decodeText(fname);
        boolean isAttachment = Part.ATTACHMENT.equalsIgnoreCase(disp) || (fname != null && !p.isMimeType("multipart/*"));
        if (isAttachment) {
            JSONObject o = new JSONObject();
            String name = fname == null ? "attachment" : fname.replaceAll("[\\\\/:*?\"<>|]", "_");
            o.put("name", name);
            o.put("mime", p.getContentType().split(";")[0].trim().toLowerCase());
            o.put("size", p.getSize());
            if (saveDir != null) {
                File dest = ws.unique(saveDir + "/" + name);
                File parent = dest.getParentFile();
                if (parent != null) //noinspection ResultOfMethodCallIgnored
                    parent.mkdirs();
                try (InputStream in = p.getInputStream(); OutputStream out = new FileOutputStream(dest)) { Workspace.copy(in, out); }
                o.put("path", ws.rel(dest));
            }
            atts.put(o);
            return;
        }
        if (p.isMimeType("text/plain")) {
            text.append(String.valueOf(p.getContent())).append('\n');
        } else if (p.isMimeType("text/html")) {
            html.append(String.valueOf(p.getContent())).append('\n');
        } else if (p.isMimeType("multipart/alternative")) {
            // Prefer the plain part; fall back to HTML.
            Multipart mp = (Multipart) p.getContent();
            Part plain = null, rich = null;
            for (int i = 0; i < mp.getCount(); i++) {
                Part c = mp.getBodyPart(i);
                if (c.isMimeType("text/plain")) plain = c;
                else if (c.isMimeType("text/html")) rich = c;
                else walk(c, text, html, atts, saveDir);
            }
            if (plain != null) walk(plain, text, html, atts, saveDir);
            else if (rich != null) walk(rich, text, html, atts, saveDir);
        } else if (p.isMimeType("multipart/*")) {
            Multipart mp = (Multipart) p.getContent();
            for (int i = 0; i < mp.getCount(); i++) walk(mp.getBodyPart(i), text, html, atts, saveDir);
        } else if (p.isMimeType("message/rfc822")) {
            text.append("\n--- forwarded message ---\n");
            walk((Part) p.getContent(), text, html, atts, saveDir);
        }
    }

    private String modify(JSONObject a, JSONObject spec) throws Exception {
        String action = spec.getString("action");
        Store st = openStore(a);
        try {
            Folder f = st.getFolder(spec.optString("folder", "INBOX"));
            f.open(Folder.READ_WRITE);
            JSONArray uids = spec.getJSONArray("uids");
            long[] ids = new long[uids.length()];
            for (int i = 0; i < ids.length; i++) ids[i] = uids.getLong(i);
            Message[] msgs = ((UIDFolder) f).getMessagesByUID(ids);
            List<Message> found = new ArrayList<>();
            for (Message m : msgs) if (m != null) found.add(m);
            Message[] arr = found.toArray(new Message[0]);
            switch (action) {
                case "read": f.setFlags(arr, new Flags(Flags.Flag.SEEN), true); break;
                case "unread": f.setFlags(arr, new Flags(Flags.Flag.SEEN), false); break;
                case "flag": f.setFlags(arr, new Flags(Flags.Flag.FLAGGED), true); break;
                case "unflag": f.setFlags(arr, new Flags(Flags.Flag.FLAGGED), false); break;
                case "move": {
                    Folder target = st.getFolder(spec.getString("target"));
                    if (!target.exists()) throw new IllegalArgumentException("Folder not found: " + spec.getString("target"));
                    f.copyMessages(arr, target);
                    f.setFlags(arr, new Flags(Flags.Flag.DELETED), true);
                    break;
                }
                case "delete": f.setFlags(arr, new Flags(Flags.Flag.DELETED), true); break;
                default: throw new IllegalArgumentException("unknown action " + action);
            }
            f.close(action.equals("move") || action.equals("delete"));   // expunge when removing
            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("changed", arr.length);
            return o.toString();
        } finally { st.close(); }
    }

    // ------------------------------------------------------------------ SMTP

    private Session smtpSession(JSONObject a) {
        String sec = a.optString("smtpSecurity", "ssl");
        Properties p = new Properties();
        p.put("mail.smtp.host", a.optString("smtpHost"));
        p.put("mail.smtp.port", String.valueOf(a.optInt("smtpPort", sec.equals("ssl") ? 465 : 587)));
        p.put("mail.smtp.auth", "true");
        p.put("mail.smtp.connectiontimeout", "20000");
        p.put("mail.smtp.timeout", "45000");
        p.put("mail.smtp.writetimeout", "45000");
        if (sec.equals("ssl")) {
            p.put("mail.smtp.ssl.enable", "true");
            p.put("mail.smtp.ssl.checkserveridentity", "true");
        } else if (sec.equals("starttls")) {
            p.put("mail.smtp.starttls.enable", "true");
            p.put("mail.smtp.starttls.required", "true");
            p.put("mail.smtp.ssl.checkserveridentity", "true");
        }
        return Session.getInstance(p);
    }

    private String send(JSONObject a, JSONObject spec) throws Exception {
        Session s = smtpSession(a);
        MimeMessage msg = new MimeMessage(s);
        String fromName = a.optString("fromName", "");
        msg.setFrom(fromName.isEmpty() ? new InternetAddress(a.getString("email")) : new InternetAddress(a.getString("email"), fromName, "UTF-8"));
        msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(spec.optString("to", ""), false));
        if (!spec.optString("cc", "").isEmpty()) msg.setRecipients(Message.RecipientType.CC, InternetAddress.parse(spec.optString("cc"), false));
        if (!spec.optString("bcc", "").isEmpty()) msg.setRecipients(Message.RecipientType.BCC, InternetAddress.parse(spec.optString("bcc"), false));
        msg.setSubject(spec.optString("subject", ""), "UTF-8");
        msg.setSentDate(new Date());
        if (!spec.optString("inReplyTo", "").isEmpty()) msg.setHeader("In-Reply-To", spec.optString("inReplyTo"));
        if (!spec.optString("references", "").isEmpty()) msg.setHeader("References", spec.optString("references"));
        msg.setHeader("X-Mailer", "Nexus Agent");

        String body = spec.optString("body", "");
        String htmlBody = spec.optString("html", "");
        JSONArray atts = spec.optJSONArray("attachments");
        MimeBodyPart content = new MimeBodyPart();
        if (!htmlBody.isEmpty()) {
            MimeMultipart alt = new MimeMultipart("alternative");
            MimeBodyPart t = new MimeBodyPart();
            t.setText(body, "UTF-8");
            MimeBodyPart h = new MimeBodyPart();
            h.setContent(htmlBody, "text/html; charset=UTF-8");
            alt.addBodyPart(t);
            alt.addBodyPart(h);
            content.setContent(alt);
        } else {
            content.setText(body, "UTF-8");
        }
        if (atts != null && atts.length() > 0) {
            MimeMultipart mixed = new MimeMultipart("mixed");
            mixed.addBodyPart(content);
            for (int i = 0; i < atts.length(); i++) {
                File file = ws.resolve(atts.getString(i));
                if (!file.isFile()) throw new IllegalArgumentException("Attachment not found: " + atts.getString(i));
                MimeBodyPart ap = new MimeBodyPart();
                ap.attachFile(file, MainActivity.mimeFor(file.getName()), null);
                ap.setFileName(MimeUtility.encodeText(file.getName(), "UTF-8", null));
                mixed.addBodyPart(ap);
            }
            msg.setContent(mixed);
        } else if (!htmlBody.isEmpty()) {
            msg.setContent((MimeMultipart) content.getContent());
        } else {
            msg.setText(body, "UTF-8");
        }
        msg.saveChanges();
        Transport t = s.getTransport("smtp");
        try {
            t.connect(a.getString("smtpHost"), a.optInt("smtpPort", 465), user(a), a.getString("password"));
            t.sendMessage(msg, msg.getAllRecipients());
        } finally { t.close(); }

        JSONObject o = new JSONObject();
        o.put("ok", true);
        o.put("messageId", msg.getMessageID());
        o.put("recipients", msg.getAllRecipients().length);
        // Many providers (not Gmail) do not keep a copy of SMTP-sent mail: append to Sent.
        if (spec.optBoolean("saveToSent", true)) {
            try {
                Store st = openStore(a);
                try {
                    Folder sent = null;
                    for (String name : new String[]{"Sent", "Sent Messages", "Sent Items", "INBOX.Sent", "[Gmail]/Sent Mail"}) {
                        Folder c = st.getFolder(name);
                        if (c.exists()) { sent = c; break; }
                    }
                    if (sent != null && !sent.getFullName().startsWith("[Gmail]")) {
                        msg.setFlag(Flags.Flag.SEEN, true);
                        sent.appendMessages(new Message[]{msg});
                        o.put("savedTo", sent.getFullName());
                    }
                } finally { st.close(); }
            } catch (Exception e) {
                o.put("sentCopy", "not saved: " + e.getMessage());
            }
        }
        return o.toString();
    }

    private static String addrs(Address[] a) {
        if (a == null) return "";
        StringBuilder sb = new StringBuilder();
        for (Address x : a) {
            if (sb.length() > 0) sb.append(", ");
            sb.append(x instanceof InternetAddress ? ((InternetAddress) x).toUnicodeString() : x.toString());
        }
        return sb.toString();
    }
}
