package com.nexusagent.bootloaderunlock.logging;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class LogEntry {

    public enum Level { INFO, SUCCESS, WARNING, ERROR }

    public final long timestamp;
    public final Level level;
    public final String tag;
    public final String message;

    private static final SimpleDateFormat TIME_FMT =
            new SimpleDateFormat("HH:mm:ss.SSS", Locale.US);

    public LogEntry(Level level, String tag, String message) {
        this.timestamp = System.currentTimeMillis();
        this.level = level;
        this.tag = tag;
        this.message = message;
    }

    public String formattedTime() {
        return TIME_FMT.format(new Date(timestamp));
    }

    @Override
    public String toString() {
        return "[" + formattedTime() + "] [" + level.name() + "/" + tag + "] " + message;
    }
}
