import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/theme';

type TaskStatus = 'pending' | 'planning' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: COLORS.statusPending, bg: 'rgba(136,136,168,0.12)' },
  planning: { label: 'Planning', color: COLORS.primary, bg: COLORS.primaryMuted },
  running: { label: 'Running', color: COLORS.statusRunning, bg: COLORS.primaryMuted },
  waiting_for_approval: { label: 'Awaiting', color: COLORS.statusWaiting, bg: 'rgba(255,184,0,0.12)' },
  completed: { label: 'Done', color: COLORS.statusCompleted, bg: 'rgba(96,165,250,0.12)' },
  failed: { label: 'Failed', color: COLORS.statusFailed, bg: COLORS.dangerMuted },
  cancelled: { label: 'Cancelled', color: COLORS.statusCancelled, bg: 'rgba(85,85,106,0.12)' },
};

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg },
        isSmall && styles.badgeSm,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text
        style={[
          styles.label,
          { color: config.color },
          isSmall && styles.labelSm,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  labelSm: {
    fontSize: 10,
  },
});
