import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Animated,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '@/utils/api';
import { COLORS, FONTS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ListTodo as RawListTodo, ChevronRight as RawChevronRight, Clock as RawClock } from 'lucide-react-native';
import { withStrippedProps } from '@/utils/stripDevProps';

const ListTodo = withStrippedProps(RawListTodo);
const ChevronRight = withStrippedProps(RawChevronRight);
const Clock = withStrippedProps(RawClock);

interface Task {
  id: string;
  goal: string;
  status: string;
  model_provider_id?: string;
  priority?: number;
  created_at: string;
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'running', label: 'Running' },
  { id: 'waiting_for_approval', label: 'Awaiting' },
  { id: 'completed', label: 'Done' },
  { id: 'failed', label: 'Failed' },
  { id: 'cancelled', label: 'Cancelled' },
];

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function SkeletonRow() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.taskRow, { opacity }]}>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ width: '75%', height: 14, borderRadius: 7, backgroundColor: COLORS.surfaceSecondary }} />
        <View style={{ width: '40%', height: 11, borderRadius: 5, backgroundColor: COLORS.surfaceSecondary }} />
      </View>
      <View style={{ width: 60, height: 22, borderRadius: 6, backgroundColor: COLORS.surfaceSecondary }} />
    </Animated.View>
  );
}

export default function TasksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchTasks = useCallback(async () => {
    console.log('[Tasks] Fetching tasks, filter:', filter);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const res = await apiGet<Task[]>(`/api/tasks${params}`);
      setTasks(Array.isArray(res) ? res : []);
      setError('');
    } catch (err) {
      console.error('[Tasks] Fetch error:', err);
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchTasks();
  }, [fetchTasks]);

  const onRefresh = useCallback(() => {
    console.log('[Tasks] Pull to refresh');
    setRefreshing(true);
    fetchTasks();
  }, [fetchTasks]);

  const renderTask = ({ item, index }: { item: Task; index: number }) => {
    const relTime = formatRelativeTime(item.created_at);
    const priorityLabel = item.priority === 2 ? 'High' : item.priority === 0 ? 'Low' : null;
    return (
      <AnimatedPressable
        style={styles.taskRow}
        onPress={() => {
          console.log('[Tasks] Task pressed:', item.id);
          router.push(`/task/${item.id}`);
        }}
      >
        <View style={styles.taskLeft}>
          <Text style={styles.taskGoal} numberOfLines={2}>{item.goal}</Text>
          <View style={styles.taskMeta}>
            <Clock size={11} color={COLORS.textTertiary} />
            <Text style={styles.taskTime}>{relTime}</Text>
            {priorityLabel ? (
              <View style={[styles.priorityBadge, item.priority === 2 && styles.priorityHigh]}>
                <Text style={[styles.priorityText, item.priority === 2 && styles.priorityHighText]}>
                  {priorityLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.taskRight}>
          <StatusBadge status={item.status} size="sm" />
          <ChevronRight size={14} color={COLORS.textTertiary} />
        </View>
      </AnimatedPressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Tasks</Text>
      </View>

      {/* Filter chips */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={f => f.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContent}
        style={styles.filtersList}
        renderItem={({ item: f }) => (
          <AnimatedPressable
            style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
            onPress={() => {
              console.log('[Tasks] Filter changed to:', f.id);
              setFilter(f.id);
            }}
          >
            <Text style={[styles.filterChipText, filter === f.id && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </AnimatedPressable>
        )}
      />

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.listContent}>
          {[0, 1, 2, 3].map(i => <SkeletonRow key={i} />)}
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={t => t.id}
          renderItem={renderTask}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<ListTodo size={28} color={COLORS.primary} />}
              title="No tasks found"
              subtitle={filter === 'all' ? 'Create your first task to get started.' : `No ${filter} tasks.`}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  filtersList: { maxHeight: 48, marginBottom: 12 },
  filtersContent: { paddingHorizontal: 20, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primaryMuted,
    borderColor: 'rgba(0,255,159,0.4)',
  },
  filterChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: COLORS.primary },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted,
    marginHorizontal: 20,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  errorText: { color: COLORS.danger, fontSize: 13 },
  listContent: { paddingHorizontal: 20, paddingTop: 4 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  taskLeft: { flex: 1, marginRight: 10 },
  taskGoal: { fontSize: 14, color: COLORS.text, fontWeight: '500', marginBottom: 6, lineHeight: 20 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskTime: { fontSize: 11, color: COLORS.textTertiary },
  taskRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceSecondary,
  },
  priorityHigh: { backgroundColor: 'rgba(255,68,102,0.12)' },
  priorityText: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '600' },
  priorityHighText: { color: COLORS.danger },
});
