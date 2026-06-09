package com.nexusagent.bootloaderunlock.ui;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.TextView;

import com.nexusagent.bootloaderunlock.R;
import com.nexusagent.bootloaderunlock.logging.LogEntry;

import java.util.ArrayList;
import java.util.List;

public class LogAdapter extends BaseAdapter {

    private final Context context;
    private final List<LogEntry> entries = new ArrayList<>();

    public LogAdapter(Context context) {
        this.context = context;
    }

    public void addEntry(LogEntry entry) {
        entries.add(entry);
        notifyDataSetChanged();
    }

    @Override public int getCount() { return entries.size(); }
    @Override public Object getItem(int position) { return entries.get(position); }
    @Override public long getItemId(int position) { return position; }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        TextView tv;
        if (convertView instanceof TextView) {
            tv = (TextView) convertView;
        } else {
            tv = new TextView(context);
            tv.setPadding(4, 2, 4, 2);
        }
        LogEntry entry = entries.get(position);
        tv.setText(entry.toString());
        tv.setTextSize(11f);
        tv.setTypeface(android.graphics.Typeface.MONOSPACE);
        tv.setTextColor(colorFor(entry.level));
        return tv;
    }

    private int colorFor(LogEntry.Level level) {
        switch (level) {
            case SUCCESS: return context.getColor(R.color.colorLogSuccess);
            case WARNING: return context.getColor(R.color.colorLogWarning);
            case ERROR:   return context.getColor(R.color.colorLogError);
            default:      return context.getColor(R.color.colorLogInfo);
        }
    }
}
