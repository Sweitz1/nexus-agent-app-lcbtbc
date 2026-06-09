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
import { tasks, type Task } from '@/utils/api';
import { CheckCircle2, Clock, Activity, AlertCircle, XCircle, LucideProps } from 'lucide-react-native';

const CheckCircle2Icon = withStrippedProps(CheckCircle2);
const ClockIcon = withStrippedProps(Clock);
const ActivityIcon = withStrippedProps(Activity);
const AlertCircleIcon = withStrippedProps(AlertCircle);
const XCircleIcon = withStrippedProps(XCircle);

const STATUS_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  running: ActivityIcon,
  planning: ActivityIcon,
  completed: CheckCircle2Icon,
  pending: ClockIcon,
  waiting_for_approval: AlertCircleIcon,
  failed: XCircleIcon,
  cancelled: XCircleIcon,
};

const STATUS_COLORS: Record<string, string> = {
  running: COLORS.primary,
  planning: COLORS.primary,
  completed: '#00ccff',
  pending: '#ffaa00',
  waiting_for_approval: '#cc88ff',
  failed: COLORS.error,
  cancelled: COLORS.textMuted,
};

const STATUS_FILTERS = ['all', 'running', 'pending', 'waiting_for_approval', 'completed', 'failed'];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await tasks.list(statusFilter === 'all' ? undefined : statusFilter);
      setTaskList(result.tasks);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
    // Poll for active tasks every 5s
    const interval = setInterval(() => load(true), 5000);
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
        <Text style={styles.count}>{taskList.length} tasks</Text>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
            onPress={() => setStatusFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, statusFilter === f && styles.filterTextActive]}>
              {f === 'all' ? 'All' : f.replace(/_/g, ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, taskList.length === 0 && styles.contentEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {taskList.length === 0 ? (
            <View style={styles.empty}>
              <ClockIcon size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No tasks</Text>
              <Text style={styles.emptyText}>Create a task to get started</Text>
            </View>
          ) : (
            taskList.map((task) => {
              const Icon = STATUS_ICONS[task.status] ?? ClockIcon;
              const color = STATUS_COLORS[task.status] ?? COLORS.textSecondary;
              return (
                <TouchableOpacity
                  key={task.id}
                  style={styles.taskCard}
                  onPress={() => router.push(`/task/${task.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
                    <Icon size={18} color={color} />
                  </View>
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle} numberOfLines={2}>{task.user_goal}</Text>
                    <Text style={styles.taskMeta}>{timeAgo(task.created_at)}</Text>
                  </View>
                  <Text style={[styles.statusBadge, { color, borderColor: color + '44' }]}>
                    {task.status.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
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
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    paddingTop: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  count: { fontSize: 13, color: COLORS.textSecondary },
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
  filterChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryDim },
  filterText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500', textTransform: 'capitalize' },
  filterTextActive: { color: COLORS.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: SPACING.md, gap: SPACING.sm },
  contentEmpty: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.xxl },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  taskInfo: { flex: 1, gap: 2 },
  taskTitle: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  taskMeta: { fontSize: 12, color: COLORS.textSecondary },
  statusBadge: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
});
