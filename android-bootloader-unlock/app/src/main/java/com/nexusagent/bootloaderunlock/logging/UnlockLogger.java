package com.nexusagent.bootloaderunlock.logging;

import android.util.Log;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class UnlockLogger {

    private static final int MAX_ENTRIES = 500;

    public interface LogListener {
        void onLogAdded(LogEntry entry);
    }

    private final List<LogEntry> entries = new ArrayList<>();
    private final List<LogListener> listeners = new CopyOnWriteArrayList<>();

    public void addListener(LogListener l) { listeners.add(l); }
    public void removeListener(LogListener l) { listeners.remove(l); }

    public void info(String tag, String message) { log(LogEntry.Level.INFO, tag, message); }
    public void success(String tag, String message) { log(LogEntry.Level.SUCCESS, tag, message); }
    public void warn(String tag, String message) { log(LogEntry.Level.WARNING, tag, message); }
    public void error(String tag, String message) { log(LogEntry.Level.ERROR, tag, message); }

    private synchronized void log(LogEntry.Level level, String tag, String message) {
        Log.d("NexusUnlock/" + tag, message);
        LogEntry entry = new LogEntry(level, tag, message);
        if (entries.size() >= MAX_ENTRIES) {
            entries.remove(0);
        }
        entries.add(entry);
        for (LogListener l : listeners) {
            l.onLogAdded(entry);
        }
    }

    public synchronized List<LogEntry> getAll() {
        return Collections.unmodifiableList(new ArrayList<>(entries));
    }

    public synchronized void clear() {
        entries.clear();
    }
}
