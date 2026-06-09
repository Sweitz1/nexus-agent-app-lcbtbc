import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withStrippedProps } from '@/utils/stripDevProps';
import { NotificationBell } from '@/components/NotificationBell';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { tasks, memory, type Task, type Memory } from '@/utils/api';
import {
  Activity,
  CheckCircle2,
  Clock,
  Zap,
  ArrowRight,
  Brain,
  ListTodo,
  AlertCircle,
} from 'lucide-react-native';

const ActivityIcon = withStrippedProps(Activity);
const CheckCircle2Icon = withStrippedProps(CheckCircle2);
const ClockIcon = withStrippedProps(Clock);
const ZapIcon = withStrippedProps(Zap);
const ArrowRightIcon = withStrippedProps(ArrowRight);
const BrainIcon = withStrippedProps(Brain);
const ListTodoIcon = withStrippedProps(ListTodo);
const AlertCircleIcon = withStrippedProps(AlertCircle);

const STATUS_COLORS: Record<string, string> = {
  running: COLORS.primary,
  planning: COLORS.primary,
  completed: '#00ccff',
  pending: '#ffaa00',
  waiting_for_approval: '#cc88ff',
  failed: COLORS.error,
  cancelled: COLORS.textMuted,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [memoryList, setMemoryList] = useState<Memory[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      const [taskResult, memResult] = await Promise.all([
        tasks.list(),
        memory.list({ type: 'task' }),
      ]);
      setTaskList(taskResult.tasks);
      setMemoryList(memResult);
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 10000);
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const activeCount = taskList.filter((t) => ['running', 'planning', 'pending'].includes(t.status)).length;
  const completedCount = taskList.filter((t) => t.status === 'completed').length;
  const pendingApproval = taskList.filter((t) => t.status === 'waiting_for_approval').length;
  const totalRuns = taskList.length;
  const recentTasks = taskList.slice(0, 5);

  const statCards = [
    { label: 'Active', value: String(activeCount), icon: ActivityIcon, color: COLORS.primary },
    { label: 'Completed', value: String(completedCount), icon: CheckCircle2Icon, color: '#00ccff' },
    { label: 'Approval', value: String(pendingApproval), icon: AlertCircleIcon, color: '#cc88ff' },
    { label: 'Total Runs', value: String(totalRuns), icon: ZapIcon, color: '#ffaa00' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.title}>Dashboard</Text>
        </View>
        <View style={styles.headerRight}>
          <NotificationBell variant="compact" size={22} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Stat Cards */}
        <View style={styles.statsGrid}>
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <View key={card.label} style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: card.color + '22' }]}>
                  <Icon size={18} color={card.color} />
                </View>
                <Text style={styles.statValue}>{card.value}</Text>
                <Text style={styles.statLabel}>{card.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Recent Tasks */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Tasks</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/tasks')} style={styles.seeAllBtn}>
              <Text style={styles.seeAllText}>See all</Text>
              <ArrowRightIcon size={14} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {recentTasks.length === 0 ? (
            <View style={styles.emptyTasks}>
              <ClockIcon size={24} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No tasks yet — create one to get started</Text>
            </View>
          ) : (
            recentTasks.map((task) => {
              const statusColor = STATUS_COLORS[task.status] ?? COLORS.textSecondary;
              return (
                <TouchableOpacity
                  key={task.id}
                  style={styles.taskRow}
                  onPress={() => router.push(`/task/${task.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.taskDot, { backgroundColor: statusColor }]} />
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle} numberOfLines={1}>{task.user_goal}</Text>
                    <Text style={styles.taskTime}>{timeAgo(task.created_at)}</Text>
                  </View>
                  <Text style={[styles.taskStatus, { color: statusColor }]}>
                    {task.status.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Quick Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickLinks}>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push('/(tabs)/memory')}
              activeOpacity={0.7}
            >
              <BrainIcon size={20} color={COLORS.primary} />
              <Text style={styles.quickLinkText}>Memory ({memoryList.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push('/(tabs)/tasks')}
              activeOpacity={0.7}
            >
              <ListTodoIcon size={20} color='#00ccff' />
              <Text style={styles.quickLinkText}>All Tasks</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  greeting: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, gap: SPACING.lg, paddingBottom: SPACING.xl },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  statValue: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.textSecondary },
  section: { gap: SPACING.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seeAllText: { fontSize: 13, color: COLORS.primary },
  emptyTasks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: { fontSize: 13, color: COLORS.textMuted, flex: 1 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  taskDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  taskInfo: { flex: 1, gap: 2 },
  taskTitle: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  taskTime: { fontSize: 12, color: COLORS.textSecondary },
  taskStatus: { fontSize: 12, fontWeight: '500', textTransform: 'capitalize', flexShrink: 0 },
  quickLinks: { flexDirection: 'row', gap: SPACING.sm },
  quickLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickLinkText: { fontSize: 14, fontWeight: '500', color: COLORS.text },
});
