import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { logs, type Log } from '@/utils/api';
import { ArrowLeft, AlertCircle, Info, AlertTriangle } from 'lucide-react-native';

const ArrowLeftIcon = withStrippedProps(ArrowLeft);
const AlertCircleIcon = withStrippedProps(AlertCircle);
const InfoIcon = withStrippedProps(Info);
const AlertTriangleIcon = withStrippedProps(AlertTriangle);

const LEVEL_COLORS: Record<string, string> = {
  info: COLORS.primary,
  warn: '#ffaa00',
  error: COLORS.error,
};

const LEVEL_ICONS: Record<string, React.ComponentType<any>> = {
  info: withStrippedProps(Info),
  warn: withStrippedProps(AlertTriangle),
  error: withStrippedProps(AlertCircle),
};

const FILTERS = ['all', 'error', 'warn', 'info'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LogsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [logList, setLogList] = useState<Log[]>([]);
  const [levelFilter, setLevelFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await logs.list({
        level: levelFilter !== 'all' ? levelFilter as any : undefined,
        limit: 200,
      });
      setLogList(result);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [levelFilter]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeftIcon size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Activity Logs</Text>
        <Text style={styles.count}>{logList.length}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((f) => {
          const color = f === 'all' ? COLORS.primary : (LEVEL_COLORS[f] ?? COLORS.textSecondary);
          const active = levelFilter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, active && { borderColor: color, backgroundColor: color + '22' }]}
              onPress={() => setLevelFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, active && { color }]}>{f.toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, logList.length === 0 && styles.contentEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {logList.length === 0 ? (
            <View style={styles.empty}>
              <InfoIcon size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No logs</Text>
              <Text style={styles.emptyText}>Agent activity will appear here</Text>
            </View>
          ) : (
            logList.map((log) => {
              const color = LEVEL_COLORS[log.level] ?? COLORS.textSecondary;
              const Icon = LEVEL_ICONS[log.level] ?? InfoIcon;
              return (
                <View key={log.id} style={[styles.logRow, { borderLeftColor: color }]}>
                  <View style={styles.logMeta}>
                    <Icon size={12} color={color} />
                    <Text style={[styles.logLevel, { color }]}>{log.level.toUpperCase()}</Text>
                    <Text style={styles.logTime}>{formatDate(log.created_at)}</Text>
                  </View>
                  <Text style={styles.logMessage}>{log.message}</Text>
                  {log.task_id && (
                    <Text style={styles.logTask} numberOfLines={1}>
                      task: {log.task_id}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: COLORS.text },
  count: { fontSize: 13, color: COLORS.textMuted },
  filters: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', letterSpacing: 0.5 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: SPACING.md, gap: SPACING.xs, paddingBottom: SPACING.xxl },
  contentEmpty: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.xxl },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
  logRow: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    borderLeftWidth: 2,
    gap: 4,
  },
  logMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logLevel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  logTime: { fontSize: 11, color: COLORS.textMuted, fontFamily: 'SpaceMono' },
  logMessage: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  logTask: { fontSize: 11, color: COLORS.textMuted, fontFamily: 'SpaceMono' },
});
