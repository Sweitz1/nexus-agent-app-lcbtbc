import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '@/utils/api';
import { COLORS, FONTS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { FileText as RawFileText } from 'lucide-react-native';
import { withStrippedProps } from '@/utils/stripDevProps';

const FileText = withStrippedProps(RawFileText);

interface LogEntry {
  id: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  task_id?: string;
  created_at: string;
}

const LEVEL_COLORS: Record<string, { color: string; bg: string }> = {
  debug: { color: COLORS.textSecondary, bg: COLORS.surfaceSecondary },
  info: { color: COLORS.info, bg: COLORS.infoMuted },
  warning: { color: COLORS.warning, bg: 'rgba(255,184,0,0.12)' },
  error: { color: COLORS.danger, bg: COLORS.dangerMuted },
};

const LEVEL_FILTERS = ['all', 'debug', 'info', 'warning', 'error'];

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LogsScreen() {
  const insets = useSafeAreaInsets();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState('all');
  const [taskIdFilter, setTaskIdFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async () => {
    console.log('[Logs] Fetching logs, level:', levelFilter, 'task_id:', taskIdFilter);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (levelFilter !== 'all') params.set('level', levelFilter);
      if (taskIdFilter.trim()) params.set('task_id', taskIdFilter.trim());
      const res = await apiGet<LogEntry[]>(`/api/logs?${params.toString()}`);
      setLogs(Array.isArray(res) ? res : []);
      setError('');
    } catch (err) {
      console.error('[Logs] Fetch error:', err);
      setError('Failed to load logs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [levelFilter, taskIdFilter]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchLogs, taskIdFilter ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  const onRefresh = useCallback(() => {
    console.log('[Logs] Pull to refresh');
    setRefreshing(true);
    fetchLogs();
  }, [fetchLogs]);

  const renderLog = ({ item }: { item: LogEntry }) => {
    const levelConfig = LEVEL_COLORS[item.level] || LEVEL_COLORS.info;
    const timeStr = formatTime(item.created_at);
    return (
      <View style={styles.logRow}>
        <View style={styles.logHeader}>
          <View style={[styles.levelBadge, { backgroundColor: levelConfig.bg }]}>
            <Text style={[styles.levelText, { color: levelConfig.color }]}>
              {item.level.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.logTime}>{timeStr}</Text>
          {item.task_id ? (
            <Text style={styles.logTaskId} numberOfLines={1}>{item.task_id.slice(0, 8)}</Text>
          ) : null}
        </View>
        <Text style={styles.logMessage} selectable>{item.message}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Filters */}
      <View style={styles.filtersSection}>
        <TextInput
          style={styles.taskIdInput}
          value={taskIdFilter}
          onChangeText={v => {
            console.log('[Logs] Task ID filter changed:', v);
            setTaskIdFilter(v);
          }}
          placeholder="Filter by task ID..."
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FlatList
          horizontal
          data={LEVEL_FILTERS}
          keyExtractor={f => f}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.levelFiltersContent}
          renderItem={({ item: f }) => (
            <AnimatedPressable
              style={[styles.filterChip, levelFilter === f && styles.filterChipActive]}
              onPress={() => {
                console.log('[Logs] Level filter changed to:', f);
                setLevelFilter(f);
              }}
            >
              <Text style={[styles.filterChipText, levelFilter === f && styles.filterChipTextActive]}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </AnimatedPressable>
          )}
        />
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={l => l.id}
          renderItem={renderLog}
          contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<FileText size={28} color={COLORS.primary} />}
              title="No logs found"
              subtitle="Logs appear here as the agent executes tasks."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  filtersSection: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 },
  taskIdInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontFamily: FONTS.mono,
  },
  levelFiltersContent: { gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primaryMuted, borderColor: 'rgba(0,255,159,0.4)' },
  filterChipText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: COLORS.primary },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted,
    marginHorizontal: 16,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  errorText: { color: COLORS.danger, fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  logRow: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  logHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  levelText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  logTime: { fontSize: 11, color: COLORS.textTertiary, fontFamily: FONTS.mono },
  logTaskId: {
    fontSize: 10,
    color: COLORS.textTertiary,
    fontFamily: FONTS.mono,
    flex: 1,
  },
  logMessage: {
    fontSize: 12,
    color: COLORS.text,
    fontFamily: FONTS.mono,
    lineHeight: 18,
  },
});
