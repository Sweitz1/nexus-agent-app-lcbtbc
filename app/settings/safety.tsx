import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPut } from '@/utils/api';
import { COLORS, RADIUS } from '@/constants/theme';
import { PermissionToggle } from '@/components/PermissionToggle';
import { Shield as RawShield, AlertTriangle as RawAlertTriangle } from 'lucide-react-native';
import { withStrippedProps } from '@/utils/stripDevProps';

const Shield = withStrippedProps(RawShield);
const AlertTriangle = withStrippedProps(RawAlertTriangle);

const ALWAYS_CONFIRM_RULES = [
  { icon: '🗑️', label: 'Delete files', desc: 'Any file deletion requires your approval' },
  { icon: '📧', label: 'Send emails', desc: 'Sending emails on your behalf always requires confirmation' },
  { icon: '⬆️', label: 'Push to GitHub', desc: 'Commits and pushes require your approval' },
  { icon: '💸', label: 'Budget overruns', desc: 'Agent stops when monthly API budget is exceeded' },
  { icon: '⚠️', label: 'Dangerous commands', desc: 'Shell commands that could harm the system' },
  { icon: '📦', label: 'Install packages', desc: 'Installing software or dependencies' },
  { icon: '🔑', label: 'Sensitive APIs', desc: 'Calls to payment, auth, or sensitive data APIs' },
  { icon: '🔒', label: 'Private Google data', desc: 'Accessing Gmail, Drive, or Calendar' },
];

export default function SafetyScreen() {
  const insets = useSafeAreaInsets();

  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchPerms = useCallback(async () => {
    console.log('[Safety] Fetching permissions for safety screen');
    try {
      const res = await apiGet<{ require_confirmation_for_risky: boolean }>('/api/permissions');
      setRequireConfirmation(res?.require_confirmation_for_risky ?? true);
    } catch (err) {
      console.error('[Safety] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPerms();
  }, [fetchPerms]);

  const handleToggle = async (val: boolean) => {
    console.log('[Safety] Require confirmation toggled:', val);
    setRequireConfirmation(val);
    try {
      await apiPut('/api/permissions', { require_confirmation_for_risky: val });
    } catch (err) {
      console.error('[Safety] Save error:', err);
      setRequireConfirmation(!val); // revert
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
    >
      {/* Header card */}
      <View style={styles.headerCard}>
        <Shield size={24} color={COLORS.primary} />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Safety First</Text>
          <Text style={styles.headerDesc}>
            Nexus Agent is designed to be powerful but safe. The rules below are always enforced — they cannot be disabled.
          </Text>
        </View>
      </View>

      {/* Always-confirm toggle */}
      <View style={styles.group}>
        <PermissionToggle
          label="Require confirmation for risky steps"
          description="Agent pauses and asks before any potentially destructive action"
          value={requireConfirmation}
          onValueChange={handleToggle}
        />
      </View>

      {/* Always-confirm rules */}
      <Text style={styles.sectionLabel}>Always requires your approval</Text>
      <View style={styles.rulesGroup}>
        {ALWAYS_CONFIRM_RULES.map((rule, idx) => {
          const isLast = idx === ALWAYS_CONFIRM_RULES.length - 1;
          return (
            <View key={rule.label} style={[styles.ruleRow, !isLast && styles.ruleRowBorder]}>
              <Text style={styles.ruleIcon}>{rule.icon}</Text>
              <View style={styles.ruleText}>
                <Text style={styles.ruleLabel}>{rule.label}</Text>
                <Text style={styles.ruleDesc}>{rule.desc}</Text>
              </View>
              <View style={styles.alwaysBadge}>
                <AlertTriangle size={10} color={COLORS.warning} />
                <Text style={styles.alwaysText}>Always</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.footerNote}>
        <Text style={styles.footerText}>
          These safety rules are hardcoded and cannot be overridden by any task or prompt. They exist to protect you from accidental data loss or unauthorized actions.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.primaryMuted,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,255,159,0.2)',
    gap: 14,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  headerDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  group: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textTertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  rulesGroup: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 24,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  ruleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  ruleIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  ruleText: { flex: 1 },
  ruleLabel: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  ruleDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, lineHeight: 17 },
  alwaysBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,184,0,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  alwaysText: { fontSize: 10, color: COLORS.warning, fontWeight: '700' },
  footerNote: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  footerText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
});
