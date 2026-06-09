import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Switch,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost } from '@/utils/api';
import { COLORS, FONTS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { Key, ChevronDown, Check } from 'lucide-react-native';

interface Provider {
  id: string;
  name: string;
  enabled: boolean;
  default_model?: string;
}

const ALL_TOOLS = [
  { id: 'web_fetch', label: 'Web Fetch', permission: 'allow_web_access' },
  { id: 'github_read', label: 'GitHub Read', permission: 'allow_github_read' },
  { id: 'github_list', label: 'GitHub List', permission: 'allow_github_read' },
  { id: 'custom_api_call', label: 'Custom API', permission: 'allow_custom_apis' },
  { id: 'memory_search', label: 'Memory Search', permission: null },
  { id: 'memory_write', label: 'Memory Write', permission: null },
  { id: 'file_read', label: 'File Read', permission: 'allow_file_read' },
  { id: 'file_write', label: 'File Write', permission: 'allow_file_write' },
  { id: 'file_delete', label: 'File Delete', permission: 'allow_file_delete' },
];

const PRIORITY_LABELS = ['Low', 'Normal', 'High'];

export default function NewTaskScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [goal, setGoal] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedTools, setSelectedTools] = useState<string[]>(['web_fetch', 'memory_search', 'memory_write']);
  const [priority, setPriority] = useState(1);
  const [requireApproval, setRequireApproval] = useState(true);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showProviderPicker, setShowProviderPicker] = useState(false);

  const fetchData = useCallback(async () => {
    console.log('[NewTask] Fetching providers and permissions');
    try {
      const [providersRes, permsRes] = await Promise.all([
        apiGet<Provider[]>('/api/providers').catch(() => [] as Provider[]),
        apiGet<Record<string, boolean>>('/api/permissions').catch(() => ({} as Record<string, boolean>)),
      ]);
      const enabled = Array.isArray(providersRes) ? providersRes.filter(p => p.enabled) : [];
      setProviders(enabled);
      if (enabled.length > 0) setSelectedProvider(enabled[0].id);
      setPermissions(permsRes || {});
    } catch (err) {
      console.error('[NewTask] Fetch error:', err);
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleTool = (toolId: string) => {
    console.log('[NewTask] Toggle tool:', toolId);
    setSelectedTools(prev =>
      prev.includes(toolId) ? prev.filter(t => t !== toolId) : [...prev, toolId]
    );
  };

  const isToolDisabled = (tool: typeof ALL_TOOLS[0]) => {
    if (!tool.permission) return false;
    return permissions[tool.permission] === false;
  };

  const handleSubmit = async () => {
    if (!goal.trim()) {
      setError('Please describe what the agent should do.');
      return;
    }
    if (!selectedProvider) {
      setError('Please select a model provider.');
      return;
    }
    setError('');
    setSubmitting(true);
    console.log('[NewTask] Submitting task:', { goal: goal.trim(), selectedProvider, selectedTools, priority, requireApproval });
    try {
      const result = await apiPost<{ id: string }>('/api/tasks', {
        goal: goal.trim(),
        model_provider_id: selectedProvider,
        allowed_tools: selectedTools,
        priority,
        require_approval: requireApproval,
      });
      console.log('[NewTask] Task created:', result.id);
      setGoal('');
      router.push(`/task/${result.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create task.';
      setError(msg);
      console.error('[NewTask] Submit error:', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProviderObj = providers.find(p => p.id === selectedProvider);

  if (!loadingProviders && providers.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>New Task</Text>
        </View>
        <EmptyState
          icon={<Key size={28} color={COLORS.primary} />}
          title="No model providers"
          subtitle="Add an API key to get started. The agent needs a model to think and act."
          ctaLabel="Add API Key"
          onCta={() => {
            console.log('[NewTask] Add API Key pressed from empty state');
            router.push('/settings/api-keys');
          }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.pageTitle}>New Task</Text>
        <Text style={styles.pageSubtitle}>Describe a goal and the agent will plan and execute it.</Text>

        {/* Goal input */}
        <View style={styles.section}>
          <Text style={styles.label}>Goal</Text>
          <TextInput
            style={styles.goalInput}
            value={goal}
            onChangeText={setGoal}
            placeholder="What should the agent do? Be specific..."
            placeholderTextColor={COLORS.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Model picker */}
        <View style={styles.section}>
          <Text style={styles.label}>Model Provider</Text>
          {loadingProviders ? (
            <View style={styles.pickerBtn}>
              <ActivityIndicator color={COLORS.primary} size="small" />
            </View>
          ) : (
            <>
              <AnimatedPressable
                style={styles.pickerBtn}
                onPress={() => {
                  console.log('[NewTask] Provider picker toggled');
                  setShowProviderPicker(!showProviderPicker);
                }}
              >
                <Text style={styles.pickerBtnText}>
                  {selectedProviderObj?.name || 'Select provider'}
                </Text>
                <ChevronDown size={16} color={COLORS.textSecondary} />
              </AnimatedPressable>
              {showProviderPicker && (
                <View style={styles.pickerDropdown}>
                  {providers.map(p => (
                    <AnimatedPressable
                      key={p.id}
                      style={[
                        styles.pickerOption,
                        selectedProvider === p.id && styles.pickerOptionSelected,
                      ]}
                      onPress={() => {
                        console.log('[NewTask] Provider selected:', p.name);
                        setSelectedProvider(p.id);
                        setShowProviderPicker(false);
                      }}
                    >
                      <Text style={[
                        styles.pickerOptionText,
                        selectedProvider === p.id && styles.pickerOptionTextSelected,
                      ]}>
                        {p.name}
                      </Text>
                      {selectedProvider === p.id && (
                        <Check size={14} color={COLORS.primary} />
                      )}
                    </AnimatedPressable>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Tools */}
        <View style={styles.section}>
          <Text style={styles.label}>Allowed Tools</Text>
          <View style={styles.toolsGrid}>
            {ALL_TOOLS.map(tool => {
              const isSelected = selectedTools.includes(tool.id);
              const isDisabled = isToolDisabled(tool);
              return (
                <AnimatedPressable
                  key={tool.id}
                  style={[
                    styles.toolChip,
                    isSelected && styles.toolChipSelected,
                    isDisabled && styles.toolChipDisabled,
                  ]}
                  onPress={() => !isDisabled && toggleTool(tool.id)}
                  disabled={isDisabled}
                >
                  <Text style={[
                    styles.toolChipText,
                    isSelected && styles.toolChipTextSelected,
                    isDisabled && styles.toolChipTextDisabled,
                  ]}>
                    {tool.label}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        {/* Priority */}
        <View style={styles.section}>
          <Text style={styles.label}>Priority</Text>
          <View style={styles.segmented}>
            {PRIORITY_LABELS.map((label, idx) => (
              <AnimatedPressable
                key={label}
                style={[
                  styles.segmentBtn,
                  priority === idx && styles.segmentBtnActive,
                ]}
                onPress={() => {
                  console.log('[NewTask] Priority set to:', label);
                  setPriority(idx);
                }}
              >
                <Text style={[
                  styles.segmentBtnText,
                  priority === idx && styles.segmentBtnTextActive,
                ]}>
                  {label}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>

        {/* Approval toggle */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextGroup}>
              <Text style={styles.toggleLabel}>Require approval before risky steps</Text>
              <Text style={styles.toggleDesc}>Agent will pause and ask before destructive actions</Text>
            </View>
            <Switch
              value={requireApproval}
              onValueChange={val => {
                console.log('[NewTask] Require approval toggled:', val);
                setRequireApproval(val);
              }}
              trackColor={{ false: COLORS.surfaceTertiary, true: COLORS.primaryMuted }}
              thumbColor={requireApproval ? COLORS.primary : COLORS.textTertiary}
              ios_backgroundColor={COLORS.surfaceTertiary}
            />
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <AnimatedPressable
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.background} size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Launch Agent</Text>
          )}
        </AnimatedPressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 20 },
  pageHeader: { marginBottom: 8 },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  pageSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: FONTS.mono,
    marginBottom: 28,
    lineHeight: 19,
  },
  section: { marginBottom: 24 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  goalInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 16,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 120,
    lineHeight: 22,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerBtnText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  pickerDropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pickerOptionSelected: { backgroundColor: COLORS.primaryMuted },
  pickerOptionText: { fontSize: 14, color: COLORS.text },
  pickerOptionTextSelected: { color: COLORS.primary, fontWeight: '600' },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toolChipSelected: {
    backgroundColor: COLORS.primaryMuted,
    borderColor: 'rgba(0,255,159,0.4)',
  },
  toolChipDisabled: { opacity: 0.4 },
  toolChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  toolChipTextSelected: { color: COLORS.primary },
  toolChipTextDisabled: { color: COLORS.textTertiary },
  segmented: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentBtnActive: { backgroundColor: COLORS.surfaceSecondary },
  segmentBtnText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  segmentBtnTextActive: { color: COLORS.text, fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleTextGroup: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  toggleDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3, lineHeight: 17 },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  errorText: { color: COLORS.danger, fontSize: 13 },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnText: { color: COLORS.background, fontSize: 16, fontWeight: '800' },
});
