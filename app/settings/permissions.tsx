import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPut } from '@/utils/api';
import { COLORS, RADIUS } from '@/constants/theme';
import { PermissionToggle } from '@/components/PermissionToggle';
import { AnimatedPressable } from '@/components/AnimatedPressable';

interface Permissions {
  allow_file_read: boolean;
  allow_file_write: boolean;
  allow_file_delete: boolean;
  allow_github_read: boolean;
  allow_github_write: boolean;
  allow_web_access: boolean;
  allow_custom_apis: boolean;
  require_confirmation_for_risky: boolean;
  api_budget_usd_monthly: number;
}

const DEFAULT_PERMS: Permissions = {
  allow_file_read: false,
  allow_file_write: false,
  allow_file_delete: false,
  allow_github_read: false,
  allow_github_write: false,
  allow_web_access: true,
  allow_custom_apis: false,
  require_confirmation_for_risky: true,
  api_budget_usd_monthly: 10,
};

export default function PermissionsScreen() {
  const insets = useSafeAreaInsets();

  const [perms, setPerms] = useState<Permissions>({ ...DEFAULT_PERMS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [budgetStr, setBudgetStr] = useState('10');

  const fetchPerms = useCallback(async () => {
    console.log('[Permissions] Fetching permissions');
    try {
      const res = await apiGet<Permissions>('/api/permissions');
      setPerms(res || DEFAULT_PERMS);
      setBudgetStr(String(res?.api_budget_usd_monthly ?? 10));
      setError('');
    } catch (err) {
      console.error('[Permissions] Fetch error:', err);
      setError('Failed to load permissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPerms();
  }, [fetchPerms]);

  const handleToggle = (key: keyof Permissions, val: boolean) => {
    console.log('[Permissions] Toggle:', key, val);
    setPerms(p => ({ ...p, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const budget = parseFloat(budgetStr) || 0;
    const payload = { ...perms, api_budget_usd_monthly: budget };
    console.log('[Permissions] Saving permissions:', payload);
    try {
      await apiPut('/api/permissions', payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save.';
      setError(msg);
      console.error('[Permissions] Save error:', msg);
    } finally {
      setSaving(false);
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
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>File System</Text>
      <View style={styles.group}>
        <PermissionToggle
          label="Read files"
          description="Agent can read files from the workspace"
          value={perms.allow_file_read}
          onValueChange={v => handleToggle('allow_file_read', v)}
        />
        <PermissionToggle
          label="Write files"
          description="Agent can create and modify files"
          value={perms.allow_file_write}
          onValueChange={v => handleToggle('allow_file_write', v)}
        />
        <PermissionToggle
          label="Delete files"
          description="Agent can permanently delete files"
          value={perms.allow_file_delete}
          onValueChange={v => handleToggle('allow_file_delete', v)}
        />
      </View>

      <Text style={styles.sectionLabel}>GitHub</Text>
      <View style={styles.group}>
        <PermissionToggle
          label="Read repositories"
          description="Agent can read code and files from GitHub"
          value={perms.allow_github_read}
          onValueChange={v => handleToggle('allow_github_read', v)}
        />
        <PermissionToggle
          label="Write to repositories"
          description="Agent can push commits and create PRs"
          value={perms.allow_github_write}
          onValueChange={v => handleToggle('allow_github_write', v)}
        />
      </View>

      <Text style={styles.sectionLabel}>Network</Text>
      <View style={styles.group}>
        <PermissionToggle
          label="Web access"
          description="Agent can fetch URLs and search the web"
          value={perms.allow_web_access}
          onValueChange={v => handleToggle('allow_web_access', v)}
        />
        <PermissionToggle
          label="Custom APIs"
          description="Agent can call your configured custom APIs"
          value={perms.allow_custom_apis}
          onValueChange={v => handleToggle('allow_custom_apis', v)}
        />
      </View>

      <Text style={styles.sectionLabel}>Safety</Text>
      <View style={styles.group}>
        <PermissionToggle
          label="Require confirmation for risky steps"
          description="Pause and ask before destructive or irreversible actions"
          value={perms.require_confirmation_for_risky}
          onValueChange={v => handleToggle('require_confirmation_for_risky', v)}
        />
      </View>

      <Text style={styles.sectionLabel}>Budget</Text>
      <View style={styles.budgetCard}>
        <Text style={styles.budgetLabel}>Monthly API budget (USD)</Text>
        <TextInput
          style={styles.budgetInput}
          value={budgetStr}
          onChangeText={v => {
            console.log('[Permissions] Budget changed:', v);
            setBudgetStr(v);
          }}
          keyboardType="decimal-pad"
          placeholder="10.00"
          placeholderTextColor={COLORS.textTertiary}
        />
        <Text style={styles.budgetHint}>Agent will stop and alert you when this limit is reached.</Text>
      </View>

      <AnimatedPressable
        style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={COLORS.background} size="small" />
        ) : (
          <Text style={styles.saveBtnText}>{saved ? 'Saved!' : 'Save permissions'}</Text>
        )}
      </AnimatedPressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
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
    marginBottom: 8,
    marginTop: 20,
  },
  group: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  budgetCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  budgetLabel: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  budgetInput: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  budgetHint: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: { color: COLORS.background, fontSize: 15, fontWeight: '800' },
});
