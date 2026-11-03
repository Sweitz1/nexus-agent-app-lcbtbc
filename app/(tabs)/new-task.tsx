import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { tasks, providers, type Provider } from '@/utils/api';
import { Zap, ChevronDown } from 'lucide-react-native';

const ZapIcon = withStrippedProps(Zap);
const ChevronDownIcon = withStrippedProps(ChevronDown);

const ALL_TOOLS = [
  { key: 'web_fetch', label: 'Web Fetch' },
  { key: 'file_read', label: 'File Read' },
  { key: 'file_write', label: 'File Write' },
  { key: 'file_delete', label: 'File Delete' },
  { key: 'memory_search', label: 'Memory Search' },
  { key: 'memory_write', label: 'Memory Write' },
  { key: 'github_read', label: 'GitHub Read' },
  { key: 'github_list', label: 'GitHub List' },
  { key: 'github_write', label: 'GitHub Write' },
  { key: 'custom_api_call', label: 'Custom API' },
];

export default function NewTaskScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [providerList, setProviderList] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedTools, setSelectedTools] = useState<string[]>(['web_fetch', 'memory_search', 'memory_write']);
  const [requireApproval, setRequireApproval] = useState(true);
  const [priority, setPriority] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showProviders, setShowProviders] = useState(false);
  const [showTools, setShowTools] = useState(false);

  useEffect(() => {
    providers.list().then(setProviderList).catch(() => {});
  }, []);

  const toggleTool = (key: string) => {
    setSelectedTools((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
    );
  };

  const handleSubmit = async () => {
    if (!goal.trim()) {
      Alert.alert('Required', 'Please describe what the agent should do.');
      return;
    }
    setLoading(true);
    try {
      const created = await tasks.create({
        user_goal: goal.trim(),
        model_provider_id: selectedProvider || undefined,
        tools_allowed: selectedTools,
        requires_user_approval: requireApproval,
        priority,
      });
      setGoal('');
      router.push(`/task/${created.id}`);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const selectedProviderName = providerList.find((p) => p.id === selectedProvider)?.name ?? 'Auto (default)';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>New Task</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Goal */}
        <View style={styles.field}>
          <Text style={styles.label}>Goal</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={goal}
            onChangeText={setGoal}
            placeholder="What should the agent accomplish?"
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Model Provider */}
        <View style={styles.field}>
          <Text style={styles.label}>Model Provider</Text>
          <TouchableOpacity
            style={styles.selector}
            onPress={() => setShowProviders(!showProviders)}
            activeOpacity={0.7}
          >
            <Text style={styles.selectorText}>{selectedProviderName}</Text>
            <ChevronDownIcon size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
          {showProviders && (
            <View style={styles.dropdown}>
              <TouchableOpacity
                style={[styles.dropdownItem, !selectedProvider && styles.dropdownItemSelected]}
                onPress={() => { setSelectedProvider(''); setShowProviders(false); }}
              >
                <Text style={styles.dropdownText}>Auto (default)</Text>
              </TouchableOpacity>
              {providerList.filter((p) => p.enabled).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.dropdownItem, selectedProvider === p.id && styles.dropdownItemSelected]}
                  onPress={() => { setSelectedProvider(p.id); setShowProviders(false); }}
                >
                  <Text style={styles.dropdownText}>{p.name}</Text>
                  <Text style={styles.dropdownSub}>{p.provider_type} · {p.default_model}</Text>
                </TouchableOpacity>
              ))}
              {providerList.length === 0 && (
                <Text style={styles.dropdownEmpty}>No providers configured yet</Text>
              )}
            </View>
          )}
        </View>

        {/* Tools */}
        <View style={styles.field}>
          <TouchableOpacity
            style={styles.collapseHeader}
            onPress={() => setShowTools(!showTools)}
            activeOpacity={0.7}
          >
            <Text style={styles.label}>Tools Allowed ({selectedTools.length})</Text>
            <ChevronDownIcon size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
          {showTools && (
            <View style={styles.toolsGrid}>
              {ALL_TOOLS.map((tool) => {
                const active = selectedTools.includes(tool.key);
                return (
                  <TouchableOpacity
                    key={tool.key}
                    style={[styles.toolChip, active && styles.toolChipActive]}
                    onPress={() => toggleTool(tool.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.toolChipText, active && styles.toolChipTextActive]}>
                      {tool.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Options */}
        <View style={styles.field}>
          <Text style={styles.label}>Options</Text>
          <View style={styles.optionRow}>
            <View>
              <Text style={styles.optionLabel}>Require approval for risky actions</Text>
              <Text style={styles.optionSub}>Agent will pause and ask before destructive steps</Text>
            </View>
            <Switch
              value={requireApproval}
              onValueChange={setRequireApproval}
              trackColor={{ false: COLORS.border, true: COLORS.primaryBorder }}
              thumbColor={requireApproval ? COLORS.primary : COLORS.textMuted}
            />
          </View>

          <View style={styles.priorityRow}>
            <Text style={styles.optionLabel}>Priority</Text>
            <View style={styles.priorityBtns}>
              {[{ v: 0, l: 'Normal' }, { v: 1, l: 'High' }, { v: 2, l: 'Urgent' }].map(({ v, l }) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.priorityBtn, priority === v && styles.priorityBtnActive]}
                  onPress={() => setPriority(v)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.priorityBtnText, priority === v && styles.priorityBtnTextActive]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.8}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={COLORS.background} />
            : <><ZapIcon size={18} color={COLORS.background} /><Text style={styles.submitText}>Run Agent</Text></>
          }
        </TouchableOpacity>
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
  content: { padding: SPACING.md, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  field: { gap: SPACING.xs },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
  },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  selectorText: { fontSize: 15, color: COLORS.text },
  dropdown: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginTop: 4,
  },
  dropdownItem: { padding: SPACING.md, gap: 2 },
  dropdownItemSelected: { backgroundColor: COLORS.primaryDim },
  dropdownText: { fontSize: 14, color: COLORS.text },
  dropdownSub: { fontSize: 12, color: COLORS.textSecondary },
  dropdownEmpty: { fontSize: 13, color: COLORS.textMuted, padding: SPACING.md, textAlign: 'center' },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: 4 },
  toolChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  toolChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryDim },
  toolChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  toolChipTextActive: { color: COLORS.primary },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  optionLabel: { fontSize: 14, color: COLORS.text, fontWeight: '500', flex: 1 },
  optionSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  priorityRow: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  priorityBtns: { flexDirection: 'row', gap: SPACING.xs },
  priorityBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  priorityBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryDim },
  priorityBtnText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  priorityBtnTextActive: { color: COLORS.primary },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    minHeight: 52,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontSize: 16, fontWeight: '700', color: COLORS.background },
});
