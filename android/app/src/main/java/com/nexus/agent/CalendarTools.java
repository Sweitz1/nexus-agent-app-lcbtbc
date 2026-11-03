package com.nexus.agent;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.TimeZone;

/**
 * Android device calendar (CalendarContract): every account synced on the device
 * (Google, Exchange, Samsung, local...). Times are epoch milliseconds.
 */
class CalendarTools {

    private final Context ctx;

    CalendarTools(Context ctx) { this.ctx = ctx; }

    String run(JSONObject spec) throws Exception {
        switch (spec.optString("op")) {
            case "calendars": return calendars();
            case "events": return events(spec);
            case "create": return create(spec);
            case "update": return update(spec);
            case "delete": return delete(spec);
            default: throw new IllegalArgumentException("unknown calendar op " + spec.optString("op"));
        }
    }

    private String calendars() throws Exception {
        JSONArray arr = new JSONArray();
        String[] proj = {CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME, CalendarContract.Calendars.ACCOUNT_TYPE,
                CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.IS_PRIMARY,
                CalendarContract.Calendars.VISIBLE, CalendarContract.Calendars.CALENDAR_TIME_ZONE};
        try (Cursor c = ctx.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, proj, null, null, null)) {
            while (c != null && c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(0));
                o.put("name", c.getString(1));
                o.put("account", c.getString(2));
                o.put("accountType", c.getString(3));
                o.put("writable", c.getInt(4) >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR);
                o.put("primary", c.getInt(5) == 1);
                o.put("visible", c.getInt(6) == 1);
                o.put("timeZone", c.getString(7));
                arr.put(o);
            }
        }
        return arr.toString();
    }

    private long defaultCalendarId() throws Exception {
        JSONArray cals = new JSONArray(calendars());
        long fallback = -1;
        for (int i = 0; i < cals.length(); i++) {
            JSONObject c = cals.getJSONObject(i);
            if (!c.optBoolean("writable")) continue;
            if (c.optBoolean("primary") && c.optBoolean("visible")) return c.getLong("id");
            if (fallback < 0) fallback = c.getLong("id");
        }
        if (fallback < 0) throw new IllegalStateException("No writable calendar on this device. Add an account in Android Settings, or use a CalDAV account (iCloud, Fastmail…) in Nexus settings.");
        return fallback;
    }

    /** Expanded instances (recurring events included) in [startMs, endMs]. */
    private String events(JSONObject spec) throws Exception {
        long start = spec.getLong("startMs"), end = spec.getLong("endMs");
        Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, start);
        ContentUris.appendId(b, end);
        String[] proj = {CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END, CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.EVENT_LOCATION,
                CalendarContract.Instances.DESCRIPTION, CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
                CalendarContract.Instances.CALENDAR_ID, CalendarContract.Instances.RRULE, CalendarContract.Instances.ORGANIZER,
                CalendarContract.Instances.SELF_ATTENDEE_STATUS};
        String sel = null;
        String[] args = null;
        long calId = spec.optLong("calendarId", -1);
        String q = spec.optString("query", "");
        if (calId >= 0 && !q.isEmpty()) {
            sel = CalendarContract.Instances.CALENDAR_ID + "=? AND (" + CalendarContract.Instances.TITLE + " LIKE ? OR " + CalendarContract.Instances.EVENT_LOCATION + " LIKE ? OR " + CalendarContract.Instances.DESCRIPTION + " LIKE ?)";
            args = new String[]{String.valueOf(calId), "%" + q + "%", "%" + q + "%", "%" + q + "%"};
        } else if (calId >= 0) {
            sel = CalendarContract.Instances.CALENDAR_ID + "=?";
            args = new String[]{String.valueOf(calId)};
        } else if (!q.isEmpty()) {
            sel = CalendarContract.Instances.TITLE + " LIKE ? OR " + CalendarContract.Instances.EVENT_LOCATION + " LIKE ? OR " + CalendarContract.Instances.DESCRIPTION + " LIKE ?";
            args = new String[]{"%" + q + "%", "%" + q + "%", "%" + q + "%"};
        }
        JSONArray arr = new JSONArray();
        try (Cursor c = ctx.getContentResolver().query(b.build(), proj, sel, args, CalendarContract.Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext() && arr.length() < 500) {
                JSONObject o = new JSONObject();
                o.put("id", String.valueOf(c.getLong(0)));
                o.put("title", c.getString(1));
                o.put("startMs", c.getLong(2));
                o.put("endMs", c.getLong(3));
                o.put("allDay", c.getInt(4) == 1);
                o.put("location", c.getString(5));
                o.put("description", c.getString(6));
                o.put("calendar", c.getString(7));
                o.put("calendarId", c.getLong(8));
                o.put("recurring", c.getString(9) != null);
                o.put("organizer", c.getString(10));
                o.put("myStatus", c.getInt(11));
                arr.put(o);
            }
        }
        return arr.toString();
    }

    private ContentValues values(JSONObject e, boolean isNew) throws Exception {
        ContentValues v = new ContentValues();
        boolean allDay = e.optBoolean("allDay", false);
        if (e.has("title")) v.put(CalendarContract.Events.TITLE, e.getString("title"));
        if (e.has("description")) v.put(CalendarContract.Events.DESCRIPTION, e.getString("description"));
        if (e.has("location")) v.put(CalendarContract.Events.EVENT_LOCATION, e.getString("location"));
        if (e.has("startMs")) {
            long s = e.getLong("startMs");
            long en = e.optLong("endMs", s + (allDay ? 86400000L : 3600000L));
            v.put(CalendarContract.Events.DTSTART, s);
            v.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
            v.put(CalendarContract.Events.EVENT_TIMEZONE, allDay ? "UTC" : TimeZone.getDefault().getID());
            String rrule = e.optString("rrule", "");
            if (!rrule.isEmpty()) {
                // Recurring events use DURATION instead of DTEND.
                v.put(CalendarContract.Events.RRULE, rrule.replaceFirst("(?i)^RRULE:", ""));
                long secs = Math.max(60, (en - s) / 1000);
                v.put(CalendarContract.Events.DURATION, allDay ? "P" + Math.max(1, secs / 86400) + "D" : "PT" + secs + "S");
                v.putNull(CalendarContract.Events.DTEND);
            } else {
                v.put(CalendarContract.Events.DTEND, en);
                if (!isNew) { v.putNull(CalendarContract.Events.RRULE); v.putNull(CalendarContract.Events.DURATION); }
            }
        }
        return v;
    }

    private String create(JSONObject spec) throws Exception {
        JSONObject e = spec.getJSONObject("event");
        long calId = e.optLong("calendarId", -1);
        if (calId < 0) calId = defaultCalendarId();
        ContentValues v = values(e, true);
        v.put(CalendarContract.Events.CALENDAR_ID, calId);
        if (e.optJSONArray("attendees") != null && e.optJSONArray("attendees").length() > 0) v.put(CalendarContract.Events.HAS_ATTENDEE_DATA, 1);
        ContentResolver cr = ctx.getContentResolver();
        Uri uri = cr.insert(CalendarContract.Events.CONTENT_URI, v);
        if (uri == null) throw new IllegalStateException("Calendar insert failed");
        long id = ContentUris.parseId(uri);
        JSONArray rem = e.optJSONArray("reminderMinutes");
        if (rem != null) for (int i = 0; i < rem.length(); i++) {
            ContentValues r = new ContentValues();
            r.put(CalendarContract.Reminders.EVENT_ID, id);
            r.put(CalendarContract.Reminders.MINUTES, rem.getInt(i));
            r.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
            cr.insert(CalendarContract.Reminders.CONTENT_URI, r);
        }
        JSONArray att = e.optJSONArray("attendees");
        if (att != null) for (int i = 0; i < att.length(); i++) {
            ContentValues a = new ContentValues();
            a.put(CalendarContract.Attendees.EVENT_ID, id);
            a.put(CalendarContract.Attendees.ATTENDEE_EMAIL, att.getString(i));
            a.put(CalendarContract.Attendees.ATTENDEE_RELATIONSHIP, CalendarContract.Attendees.RELATIONSHIP_ATTENDEE);
            a.put(CalendarContract.Attendees.ATTENDEE_TYPE, CalendarContract.Attendees.TYPE_REQUIRED);
            a.put(CalendarContract.Attendees.ATTENDEE_STATUS, CalendarContract.Attendees.ATTENDEE_STATUS_INVITED);
            cr.insert(CalendarContract.Attendees.CONTENT_URI, a);
        }
        JSONObject o = new JSONObject();
        o.put("id", String.valueOf(id));
        o.put("calendarId", calId);
        return o.toString();
    }

    private String update(JSONObject spec) throws Exception {
        long id = Long.parseLong(spec.getString("id"));
        ContentValues v = values(spec.getJSONObject("event"), false);
        int n = ctx.getContentResolver().update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), v, null, null);
        return "{\"updated\":" + n + "}";
    }

    private String delete(JSONObject spec) throws Exception {
        long id = Long.parseLong(spec.getString("id"));
        int n = ctx.getContentResolver().delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), null, null);
        return "{\"deleted\":" + n + "}";
    }
}
