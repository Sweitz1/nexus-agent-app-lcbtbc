import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '@/utils/api';
import { COLORS, FONTS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import {
  CheckCircle as RawCheckCircle,
  XCircle as RawXCircle,
  RefreshCw as RawRefreshCw,
  Cpu as RawCpu,
} from 'lucide-react-native';
import { withStrippedProps } from '@/utils/stripDevProps';

const CheckCircle = withStrippedProps(RawCheckCircle);
const XCircle = withStrippedProps(RawXCircle);
const RefreshCw = withStrippedProps(RawRefreshCw);
const Cpu = withStrippedProps(RawCpu);

interface RuntimeStatus {
  version: string;
  status: string;
  available_tools: string[];
  unavailable_tools?: string[];
}

export default function RuntimeScreen() {
  const insets = useSafeAreaInsets();

  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchRuntime = useCallback(async () => {
    console.log('[Runtime] Fetching runtime status');
    setLoading(true);
    try {
      const res = await apiGet<RuntimeStatus>('/api/runtime/status');
      setRuntime(res);
      setError('');
    } catch (err) {
      console.error('[Runtime] Fetch error:', err);
      setError('Failed to load runtime status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuntime();
  }, [fetchRuntime]);

  const availableTools = runtime?.available_tools || [];
  const unavailableTools = runtime?.unavailable_tools || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
    >
      {/* Status card */}
      <View style={styles.statusCard}>
        <Cpu size={24} color={COLORS.primary} />
        <View style={styles.statusInfo}>
          <Text style={styles.statusTitle}>Runtime</Text>
          {loading ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : runtime ? (
            <>
              <Text style={styles.versionText}>v{runtime.version}</Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: runtime.status === 'ok' ? COLORS.primaryMuted : COLORS.dangerMuted },
              ]}>
                <Text style={[
                  styles.statusBadgeText,
                  { color: runtime.status === 'ok' ? COLORS.primary : COLORS.danger },
                ]}>
                  {runtime.status}
                </Text>
              </View>
            </>
          ) : null}
        </View>
        <AnimatedPressable onPress={() => {
          console.log('[Runtime] Refresh pressed');
          fetchRuntime();
        }}>
          <RefreshCw size={18} color={COLORS.textSecondary} />
        </AnimatedPressable>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!loading && runtime && (
        <>
          <Text style={styles.sectionLabel}>Available Tools ({availableTools.length})</Text>
          <View style={styles.toolsGroup}>
            {availableTools.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No tools available</Text>
              </View>
            ) : (
              availableTools.map((tool, idx) => {
                const isLast = idx === availableTools.length - 1;
                return (
                  <View key={tool} style={[styles.toolRow, !isLast && styles.toolRowBorder]}>
                    <CheckCircle size={14} color={COLORS.success} />
                    <Text style={styles.toolName}>{tool}</Text>
                  </View>
                );
              })
            )}
          </View>

          {unavailableTools.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Unavailable Tools</Text>
              <View style={styles.toolsGroup}>
                {unavailableTools.map((tool, idx) => {
                  const isLast = idx === unavailableTools.length - 1;
                  return (
                    <View key={tool} style={[styles.toolRow, !isLast && styles.toolRowBorder]}>
                      <XCircle size={14} color={COLORS.danger} />
                      <Text style={[styles.toolName, { color: COLORS.textSecondary }]}>{tool}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20 },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  statusInfo: { flex: 1, gap: 6 },
  statusTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  versionText: { fontSize: 13, color: COLORS.textSecondary, fontFamily: FONTS.mono },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  errorText: { color: COLORS.danger, fontSize: 13 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textTertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  toolsGroup: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 24,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  toolRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  toolName: { fontSize: 13, color: COLORS.text, fontFamily: FONTS.mono },
  emptyRow: { padding: 16, alignItems: 'center' },
  emptyText: { fontSize: 13, color: COLORS.textSecondary },
});
