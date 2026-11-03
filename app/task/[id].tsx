import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { tasks, type TaskDetail, type TaskStep } from '@/utils/api';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Activity,
  Clock,
  AlertCircle,
  Brain,
  Wrench,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

const ArrowLeftIcon = withStrippedProps(ArrowLeft);
const CheckCircle2Icon = withStrippedProps(CheckCircle2);
const XCircleIcon = withStrippedProps(XCircle);
const ActivityIcon = withStrippedProps(Activity);
const ClockIcon = withStrippedProps(Clock);
const AlertCircleIcon = withStrippedProps(AlertCircle);
const BrainIcon = withStrippedProps(Brain);
const WrenchIcon = withStrippedProps(Wrench);
const FileTextIcon = withStrippedProps(FileText);
const SparklesIcon = withStrippedProps(Sparkles);
const ChevronDownIcon = withStrippedProps(ChevronDown);
const ChevronUpIcon = withStrippedProps(ChevronUp);

const STATUS_COLORS: Record<string, string> = {
  running: COLORS.primary,
  planning: COLORS.primary,
  completed: '#00ccff',
  pending: '#ffaa00',
  waiting_for_approval: '#cc88ff',
  failed: COLORS.error,
  cancelled: COLORS.textMuted,
};

const STEP_ICONS: Record<string, React.ComponentType<any>> = {
  plan: withStrippedProps(Brain),
  thought: withStrippedProps(Brain),
  tool_call: withStrippedProps(Wrench),
  tool_result: withStrippedProps(FileText),
  reflection: withStrippedProps(Sparkles),
  final: withStrippedProps(Sparkles),
  approval_request: withStrippedProps(AlertCircle),
  approval_response: withStrippedProps(CheckCircle2),
};

const STEP_COLORS: Record<string, string> = {
  plan: '#00ccff',
  thought: COLORS.textSecondary,
  tool_call: '#ffaa00',
  tool_result: COLORS.primary,
  reflection: '#cc88ff',
  final: COLORS.primary,
  approval_request: '#ff8844',
  approval_response: '#00ccff',
};

function StepCard({ step }: { step: TaskStep }) {
  const [expanded, setExpanded] = useState(step.step_type === 'approval_request' || step.step_type === 'final');
  const Icon = STEP_ICONS[step.step_type] ?? FileTextIcon;
  const color = STEP_COLORS[step.step_type] ?? COLORS.textSecondary;
  const label = step.step_type.replace(/_/g, ' ');

  return (
    <TouchableOpacity
      style={styles.stepCard}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.8}
    >
      <View style={styles.stepHeader}>
        <View style={[styles.stepIcon, { backgroundColor: color + '22' }]}>
          <Icon size={14} color={color} />
        </View>
        <Text style={[styles.stepType, { color }]}>{label}</Text>
        <View style={[styles.stepStatus, { borderColor: step.status === 'completed' ? '#00cc4422' : '#ffaa0022' }]}>
          <Text style={[styles.stepStatusText, { color: step.status === 'completed' ? '#00cc44' : '#ffaa00' }]}>
            {step.status}
          </Text>
        </View>
        {expanded ? <ChevronUpIcon size={14} color={COLORS.textMuted} /> : <ChevronDownIcon size={14} color={COLORS.textMuted} />}
      </View>
      {expanded && (
        <Text style={styles.stepContent}>{step.content}</Text>
      )}
      {expanded && step.tool_name && (
        <View style={styles.toolBadge}>
          <WrenchIcon size={12} color={COLORS.textSecondary} />
          <Text style={styles.toolBadgeText}>{step.tool_name}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvalNote, setApprovalNote] = useState('');
  const [approving, setApproving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const t = await tasks.get(id);
      setTask(t);
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const active = ['pending', 'planning', 'running', 'waiting_for_approval'];
    const interval = setInterval(() => {
      if (task && active.includes(task.status)) load(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [load, task?.status]);

  const pendingApprovalStep = task?.steps.find(
    (s) => s.step_type === 'approval_request' && s.status === 'awaiting_approval'
  );

  const handleApproval = async (approved: boolean) => {
    if (!task || !pendingApprovalStep) return;
    setApproving(true);
    try {
      await tasks.approve(task.id, pendingApprovalStep.id, approved, approvalNote);
      setApprovalNote('');
      await load(true);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
    setApproving(false);
  };

  const handleCancel = () => {
    if (!task) return;
    Alert.alert('Cancel Task', 'Stop this task?', [
      { text: 'Keep Running', style: 'cancel' },
      {
        text: 'Cancel Task',
        style: 'destructive',
        onPress: async () => {
          try {
            await tasks.cancel(task.id);
            await load(true);
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  };

  if (loading && !task) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Task not found</Text>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[task.status] ?? COLORS.textSecondary;
  const isActive = ['pending', 'planning', 'running'].includes(task.status);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeftIcon size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Task Detail</Text>
        {isActive && (
          <TouchableOpacity onPress={handleCancel}>
            <XCircleIcon size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Goal card */}
        <View style={styles.goalCard}>
          <View style={styles.goalTop}>
            <View style={[styles.statusPill, { borderColor: statusColor + '44', backgroundColor: statusColor + '18' }]}>
              {isActive && <ActivityIndicator size="small" color={statusColor} />}
              <Text style={[styles.statusText, { color: statusColor }]}>{task.status.replace(/_/g, ' ')}</Text>
            </View>
            <Text style={styles.priorityText}>Priority {task.priority}</Text>
          </View>
          <Text style={styles.goalText}>{task.user_goal}</Text>
          {task.output && (
            <View style={styles.outputBox}>
              <Text style={styles.outputLabel}>Result</Text>
              <Text style={styles.outputText}>{task.output}</Text>
            </View>
          )}
          {task.error_log && (
            <View style={styles.errorBox}>
              <Text style={styles.errorLabel}>Error</Text>
              <Text style={styles.errorBoxText}>{task.error_log}</Text>
            </View>
          )}
        </View>

        {/* Approval panel */}
        {task.status === 'waiting_for_approval' && pendingApprovalStep && (
          <View style={styles.approvalCard}>
            <View style={styles.approvalHeader}>
              <AlertCircleIcon size={18} color='#ff8844' />
              <Text style={styles.approvalTitle}>Approval Required</Text>
            </View>
            <Text style={styles.approvalContent}>{pendingApprovalStep.content}</Text>
            <TextInput
              style={styles.approvalNote}
              value={approvalNote}
              onChangeText={setApprovalNote}
              placeholder="Add a note (optional)..."
              placeholderTextColor={COLORS.textMuted}
              multiline
            />
            <View style={styles.approvalBtns}>
              <TouchableOpacity
                style={[styles.approvalBtn, styles.rejectBtn]}
                onPress={() => handleApproval(false)}
                disabled={approving}
                activeOpacity={0.8}
              >
                <XCircleIcon size={16} color={COLORS.error} />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approvalBtn, styles.approveBtn]}
                onPress={() => handleApproval(true)}
                disabled={approving}
                activeOpacity={0.8}
              >
                {approving
                  ? <ActivityIndicator size="small" color={COLORS.background} />
                  : <><CheckCircle2Icon size={16} color={COLORS.background} /><Text style={styles.approveBtnText}>Approve</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Steps timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Execution Timeline ({task.steps.length} steps)</Text>
          {task.steps.length === 0 ? (
            <View style={styles.stepsEmpty}>
              <ClockIcon size={28} color={COLORS.textMuted} />
              <Text style={styles.stepsEmptyText}>Agent is preparing...</Text>
            </View>
          ) : (
            task.steps.map((step) => <StepCard key={step.id} step={step} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: COLORS.text },
  content: { padding: SPACING.md, gap: SPACING.md, paddingBottom: SPACING.xxl },
  goalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  goalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  priorityText: { fontSize: 12, color: COLORS.textMuted },
  goalText: { fontSize: 16, fontWeight: '500', color: COLORS.text, lineHeight: 22 },
  outputBox: {
    backgroundColor: COLORS.primaryDim,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    gap: 4,
  },
  outputLabel: { fontSize: 11, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  outputText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  errorBox: {
    backgroundColor: COLORS.error + '18',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.error + '44',
    gap: 4,
  },
  errorLabel: { fontSize: 11, fontWeight: '700', color: COLORS.error, textTransform: 'uppercase', letterSpacing: 0.5 },
  errorBoxText: { fontSize: 13, color: COLORS.text },
  errorText: { fontSize: 16, color: COLORS.textSecondary },
  approvalCard: {
    backgroundColor: '#ff884418',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#ff884444',
    gap: SPACING.sm,
  },
  approvalHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  approvalTitle: { fontSize: 15, fontWeight: '700', color: '#ff8844' },
  approvalContent: { fontSize: 13, color: COLORS.text, lineHeight: 18, fontFamily: 'SpaceMono' },
  approvalNote: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  approvalBtns: { flexDirection: 'row', gap: SPACING.sm },
  approvalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    minHeight: 48,
  },
  rejectBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.error + '44' },
  approveBtn: { backgroundColor: COLORS.primary },
  rejectBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.error },
  approveBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.background },
  section: { gap: SPACING.sm },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  stepsEmpty: { alignItems: 'center', gap: SPACING.sm, padding: SPACING.lg },
  stepsEmptyText: { fontSize: 14, color: COLORS.textMuted },
  stepCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  stepIcon: { width: 28, height: 28, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  stepType: { flex: 1, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  stepStatus: { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2 },
  stepStatusText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  stepContent: { fontSize: 13, color: COLORS.text, lineHeight: 18, fontFamily: 'SpaceMono' },
  toolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  toolBadgeText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
});
