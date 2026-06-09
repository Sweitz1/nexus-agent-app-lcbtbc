import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withStrippedProps } from '@/utils/stripDevProps';
import { NotificationBell } from '@/components/NotificationBell';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import {
  Activity,
  CheckCircle2,
  Clock,
  Zap,
  ArrowRight,
  Brain,
  ListTodo,
} from 'lucide-react-native';

const ActivityIcon = withStrippedProps(Activity);
const CheckCircle2Icon = withStrippedProps(CheckCircle2);
const ClockIcon = withStrippedProps(Clock);
const ZapIcon = withStrippedProps(Zap);
const ArrowRightIcon = withStrippedProps(ArrowRight);
const BrainIcon = withStrippedProps(Brain);
const ListTodoIcon = withStrippedProps(ListTodo);

const STAT_CARDS = [
  { label: 'Active Tasks', value: '12', icon: ActivityIcon, color: COLORS.primary },
  { label: 'Completed', value: '47', icon: CheckCircle2Icon, color: '#00ccff' },
  { label: 'Pending', value: '5', icon: ClockIcon, color: '#ffaa00' },
  { label: 'Agent Runs', value: '128', icon: ZapIcon, color: '#cc88ff' },
];

const RECENT_TASKS = [
  { id: '1', title: 'Analyze market data', status: 'running', time: '2m ago' },
  { id: '2', title: 'Generate weekly report', status: 'completed', time: '1h ago' },
  { id: '3', title: 'Review pull requests', status: 'pending', time: '3h ago' },
];

const STATUS_COLORS: Record<string, string> = {
  running: COLORS.primary,
  completed: '#00ccff',
  pending: '#ffaa00',
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();

  const handleQuickLinkPress = (label: string) => {
    console.log('[Dashboard] Quick link pressed:', label);
  };

  const handleTaskPress = (taskId: string, taskTitle: string) => {
    console.log('[Dashboard] Task pressed:', taskId, taskTitle);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Good morning</Text>
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
      >
        {/* Stat Cards */}
        <View style={styles.statsGrid}>
          {STAT_CARDS.map((card) => {
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
            <TouchableOpacity
              onPress={() => handleQuickLinkPress('View All Tasks')}
              style={styles.seeAllBtn}
            >
              <Text style={styles.seeAllText}>See all</Text>
              <ArrowRightIcon size={14} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {RECENT_TASKS.map((task) => {
            const statusColor = STATUS_COLORS[task.status] ?? COLORS.textSecondary;
            return (
              <TouchableOpacity
                key={task.id}
                style={styles.taskRow}
                onPress={() => handleTaskPress(task.id, task.title)}
                activeOpacity={0.7}
              >
                <View style={[styles.taskDot, { backgroundColor: statusColor }]} />
                <View style={styles.taskInfo}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskTime}>{task.time}</Text>
                </View>
                <Text style={[styles.taskStatus, { color: statusColor }]}>
                  {task.status}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Quick Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickLinks}>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => handleQuickLinkPress('Memory')}
              activeOpacity={0.7}
            >
              <BrainIcon size={20} color={COLORS.primary} />
              <Text style={styles.quickLinkText}>Memory</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => handleQuickLinkPress('All Tasks')}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
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
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  greeting: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    gap: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
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
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 13,
    color: COLORS.primary,
  },
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
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taskInfo: {
    flex: 1,
    gap: 2,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  taskTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  taskStatus: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  quickLinks: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
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
  quickLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
});
