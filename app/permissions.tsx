import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { permissions as permApi, type Permissions } from '@/utils/api';
import { ArrowLeft, Shield, CheckCircle2 } from 'lucide-react-native';

const ArrowLeftIcon = withStrippedProps(ArrowLeft);
const ShieldIcon = withStrippedProps(Shield);
const CheckCircle2Icon = withStrippedProps(CheckCircle2);

interface PermRow {
  key: keyof Permissions;
  label: string;
  description: string;
  risky?: boolean;
}

const PERM_ROWS: PermRow[] = [
  { key: 'allow_web_access', label: 'Web Access', description: 'Agent can fetch URLs and browse the web' },
  { key: 'allow_file_read', label: 'File Read', description: 'Agent can read files in its sandbox directory' },
  { key: 'allow_file_write', label: 'File Write', description: 'Agent can create and modify files', risky: true },
  { key: 'allow_file_delete', label: 'File Delete', description: 'Agent can delete files permanently', risky: true },
  { key: 'allow_github_read', label: 'GitHub Read', description: 'Agent can read repository files and trees' },
  { key: 'allow_github_write', label: 'GitHub Write', description: 'Agent can commit files to repositories', risky: true },
  { key: 'allow_custom_apis', label: 'Custom APIs', description: 'Agent can call your configured custom APIs' },
  { key: 'require_confirmation_for_risky', label: 'Confirm Risky Actions', description: 'Pause and ask before write/delete/push operations' },
];

export default function PermissionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [budget, setBudget] = useState('10.00');

  useEffect(() => {
    permApi.get().then((p) => {
      setPerms(p);
      setBudget(p.api_budget_usd_monthly || '10.00');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggle = (key: keyof Permissions) => {
    if (!perms) return;
    setPerms({ ...perms, [key]: !perms[key] });
  };

  const handleSave = async () => {
    if (!perms) return;
    setSaving(true);
    try {
      const updated = await permApi.update({ ...perms, api_budget_usd_monthly: budget });
      setPerms(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
    setSaving(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeftIcon size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Tool Permissions</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !perms}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {saving
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : saved
              ? <CheckCircle2Icon size={22} color={COLORS.primary} />
              : <Text style={styles.saveBtn}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.infoBox}>
            <ShieldIcon size={16} color={COLORS.primary} />
            <Text style={styles.infoText}>
              These permissions control what actions the agent is allowed to take. Risky actions are highlighted.
            </Text>
          </View>

          {PERM_ROWS.map((row, idx) => (
            <View key={row.key}>
              {idx > 0 && <View style={styles.divider} />}
              <View style={[styles.permRow, row.risky && styles.permRowRisky]}>
                <View style={styles.permInfo}>
                  <View style={styles.permLabelRow}>
                    <Text style={[styles.permLabel, row.risky && styles.permLabelRisky]}>{row.label}</Text>
                    {row.risky && (
                      <View style={styles.riskyBadge}>
                        <Text style={styles.riskyBadgeText}>risky</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.permDesc}>{row.description}</Text>
                </View>
                <Switch
                  value={!!(perms as any)?.[row.key]}
                  onValueChange={() => toggle(row.key)}
                  trackColor={{ false: COLORS.border, true: row.risky ? COLORS.error + '88' : COLORS.primaryBorder }}
                  thumbColor={!!(perms as any)?.[row.key]
                    ? (row.risky ? COLORS.error : COLORS.primary)
                    : COLORS.textMuted
                  }
                />
              </View>
            </View>
          ))}

          <View style={styles.budgetSection}>
            <Text style={styles.sectionLabel}>Monthly API Budget (USD)</Text>
            <View style={styles.budgetInput}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.budgetField}
                value={budget}
                onChangeText={setBudget}
                keyboardType="decimal-pad"
                placeholder="10.00"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
            <Text style={styles.budgetHint}>Agent will pause if estimated cost exceeds this limit</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: COLORS.text },
  saveBtn: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: SPACING.md, gap: SPACING.md, paddingBottom: SPACING.xxl },
  infoBox: {
    flexDirection: 'row',
    gap: SPACING.sm,
    backgroundColor: COLORS.primaryDim,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  permRowRisky: {},
  permInfo: { flex: 1, gap: 2 },
  permLabelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  permLabel: { fontSize: 15, fontWeight: '500', color: COLORS.text },
  permLabelRisky: { color: COLORS.text },
  permDesc: { fontSize: 12, color: COLORS.textSecondary },
  riskyBadge: {
    backgroundColor: COLORS.error + '22',
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.error + '44',
  },
  riskyBadgeText: { fontSize: 10, color: COLORS.error, fontWeight: '600' },
  divider: { height: 1, backgroundColor: COLORS.border },
  budgetSection: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  budgetInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  currencySymbol: { fontSize: 16, color: COLORS.textSecondary },
  budgetField: { flex: 1, fontSize: 16, color: COLORS.text, padding: SPACING.sm },
  budgetHint: { fontSize: 12, color: COLORS.textMuted },
});
