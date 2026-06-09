import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost } from '@/utils/api';
import { COLORS, FONTS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { StatusBadge } from '@/components/StatusBadge';
import { StepRow, TaskStep } from '@/components/StepRow';
import { XCircle as RawXCircle, RefreshCw as RawRefreshCw } from 'lucide-react-native';
import { withStrippedProps } from '@/utils/stripDevProps';

const XCircle = withStrippedProps(RawXCircle);
const RefreshCw = withStrippedProps(RawRefreshCw);

interface Task {
  id: string;
  goal: string;
  status: string;
  model_provider_id?: string;
  priority?: number;
  created_at: string;
  steps?: TaskStep[];
}

const POLLING_STATUSES = ['planning', 'running', 'waiting_for_approval'];

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTask = useCallback(async () => {
    if (!id) return;
    console.log('[TaskDetail] Fetching task:', id);
    try {
      const res = await apiGet<Task>(`/api/tasks/${id}`);
      setTask(res);
      setError('');
    } catch (err) {
      console.error('[TaskDetail] Fetch error:', err);
      setError('Failed to load task.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Polling while active
  useEffect(() => {
    if (!task) return;
    if (POLLING_STATUSES.includes(task.status)) {
      console.log('[TaskDetail] Starting poll for task:', id);
      pollRef.current = setInterval(fetchTask, 2000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [task?.status, fetchTask]);

  const handleCancel = async () => {
    if (!id) return;
    console.log('[TaskDetail] Cancel task pressed:', id);
    setCancelling(true);
    try {
      await apiPost(`/api/tasks/${id}/cancel`, {});
      await fetchTask();
    } catch (err) {
      console.error('[TaskDetail] Cancel error:', err);
      setError('Failed to cancel task.');
    } finally {
      setCancelling(false);
    }
  };

  const handleApprove = async (stepId: string) => {
    if (!id) return;
    console.log('[TaskDetail] Approve step:', stepId, 'for task:', id);
    try {
      await apiPost(`/api/tasks/${id}/approve`, { step_id: stepId, approved: true });
      await fetchTask();
    } catch (err) {
      console.error('[TaskDetail] Approve error:', err);
      setError('Failed to approve step.');
    }
  };

  const handleReject = async (stepId: string) => {
    if (!id) return;
    console.log('[TaskDetail] Reject step:', stepId, 'for task:', id);
    try {
      await apiPost(`/api/tasks/${id}/approve`, { step_id: stepId, approved: false });
      await fetchTask();
    } catch (err) {
      console.error('[TaskDetail] Reject error:', err);
      setError('Failed to reject step.');
    }
  };

  const isActive = task && POLLING_STATUSES.includes(task.status);
  const steps = task?.steps || [];

  return (
    <>
      <Stack.Screen
        options={{
          title: task ? 'Task' : 'Loading...',
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerRight: () =>
            task && isActive ? (
              <AnimatedPressable
                style={styles.cancelHeaderBtn}
                onPress={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator color={COLORS.danger} size="small" />
                ) : (
                  <XCircle size={20} color={COLORS.danger} />
                )}
              </AnimatedPressable>
            ) : null,
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.loadingText}>Loading task...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <AnimatedPressable onPress={fetchTask} style={styles.retryBtn}>
              <RefreshCw size={14} color={COLORS.primary} />
              <Text style={styles.retryText}>Retry</Text>
            </AnimatedPressable>
          </View>
        ) : task ? (
          <>
            {/* Task header */}
            <View style={styles.taskHeader}>
              <Text style={styles.taskGoal}>{task.goal}</Text>
              <View style={styles.taskMeta}>
                <StatusBadge status={task.status} />
                {isActive && (
                  <View style={styles.liveIndicator}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>Live</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Steps */}
            <View style={styles.stepsSection}>
              <Text style={styles.stepsTitle}>
                Execution Log
                {steps.length > 0 ? ` (${steps.length})` : ''}
              </Text>

              {steps.length === 0 && isActive ? (
                <View style={styles.waitingCard}>
                  <ActivityIndicator color={COLORS.primary} size="small" />
                  <Text style={styles.waitingText}>Agent is thinking...</Text>
                </View>
              ) : steps.length === 0 ? (
                <View style={styles.waitingCard}>
                  <Text style={styles.waitingText}>No steps recorded yet.</Text>
                </View>
              ) : (
                steps.map(step => (
                  <StepRow
                    key={step.id}
                    step={step}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))
              )}
            </View>

            {/* Cancel button (bottom) */}
            {isActive && (
              <AnimatedPressable
                style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
                onPress={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator color={COLORS.danger} size="small" />
                ) : (
                  <>
                    <XCircle size={16} color={COLORS.danger} />
                    <Text style={styles.cancelBtnText}>Cancel Task</Text>
                  </>
                )}
              </AnimatedPressable>
            )}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20 },
  loadingCenter: { alignItems: 'center', paddingTop: 60, gap: 16 },
  loadingText: { color: COLORS.textSecondary, fontSize: 14 },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.sm,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
    gap: 12,
  },
  errorText: { color: COLORS.danger, fontSize: 13 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  retryText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  taskHeader: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  taskGoal: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 24,
  },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  liveText: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },
  stepsSection: { gap: 0 },
  stepsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    fontFamily: FONTS.mono,
  },
  waitingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  waitingText: { color: COLORS.textSecondary, fontSize: 14 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  cancelBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '700' },
  cancelHeaderBtn: {
    padding: 8,
  },
});
