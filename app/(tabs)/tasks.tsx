import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { CheckCircle2, Clock, Activity, LucideProps } from 'lucide-react-native';

const CheckCircle2Icon = withStrippedProps(CheckCircle2);
const ClockIcon = withStrippedProps(Clock);
const ActivityIcon = withStrippedProps(Activity);

const TASKS = [
  { id: '1', title: 'Analyze market data', status: 'running', created: 'Today 9:00 AM' },
  { id: '2', title: 'Generate weekly report', status: 'completed', created: 'Today 8:00 AM' },
  { id: '3', title: 'Review pull requests', status: 'pending', created: 'Yesterday' },
  { id: '4', title: 'Update documentation', status: 'completed', created: 'Yesterday' },
  { id: '5', title: 'Deploy to staging', status: 'pending', created: '2 days ago' },
];

const STATUS_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  running: ActivityIcon,
  completed: CheckCircle2Icon,
  pending: ClockIcon,
};

const STATUS_COLORS: Record<string, string> = {
  running: COLORS.primary,
  completed: '#00ccff',
  pending: '#ffaa00',
};

export default function TasksScreen() {
  const insets = useSafeAreaInsets();

  const handleTaskPress = (taskId: string, taskTitle: string) => {
    console.log('[Tasks] Task pressed:', taskId, taskTitle);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {TASKS.map((task) => {
          const Icon = STATUS_ICONS[task.status] ?? ClockIcon;
          const color = STATUS_COLORS[task.status] ?? COLORS.textSecondary;
          return (
            <TouchableOpacity
              key={task.id}
              style={styles.taskCard}
              onPress={() => handleTaskPress(task.id, task.title)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
                <Icon size={18} color={color} />
              </View>
              <View style={styles.taskInfo}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={styles.taskMeta}>{task.created}</Text>
              </View>
              <Text style={[styles.statusBadge, { color, borderColor: color + '44' }]}>
                {task.status}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  content: { padding: SPACING.md, gap: SPACING.sm },
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
  },
});
