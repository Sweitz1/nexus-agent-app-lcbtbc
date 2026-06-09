package com.nexusagent.bootloaderunlock.ui;

import android.content.Context;
import android.graphics.Color;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.nexusagent.bootloaderunlock.R;
import com.nexusagent.bootloaderunlock.logging.LogEntry;

import java.util.ArrayList;
import java.util.List;

public class LogAdapter extends RecyclerView.Adapter<LogAdapter.ViewHolder> {

    private final List<LogEntry> entries = new ArrayList<>();

    public void addEntry(LogEntry entry) {
        entries.add(entry);
        notifyItemInserted(entries.size() - 1);
    }

    public void setEntries(List<LogEntry> list) {
        entries.clear();
        entries.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(android.R.layout.simple_list_item_1, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        LogEntry entry = entries.get(position);
        holder.text.setText(entry.toString());
        holder.text.setTextSize(11f);
        holder.text.setTypeface(android.graphics.Typeface.MONOSPACE);
        holder.text.setTextColor(colorFor(holder.text.getContext(), entry.level));
    }

    @Override
    public int getItemCount() { return entries.size(); }

    private static int colorFor(Context ctx, LogEntry.Level level) {
        switch (level) {
            case SUCCESS: return ctx.getColor(R.color.colorLogSuccess);
            case WARNING: return ctx.getColor(R.color.colorLogWarning);
            case ERROR:   return ctx.getColor(R.color.colorLogError);
            default:      return ctx.getColor(R.color.colorLogInfo);
        }
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        final TextView text;
        ViewHolder(View v) {
            super(v);
            text = v.findViewById(android.R.id.text1);
        }
    }
}
