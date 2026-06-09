import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Switch,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/utils/api';
import { COLORS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import {
  Key as RawKey,
  Plus as RawPlus,
  Trash2 as RawTrash2,
  Edit as RawEdit,
  CheckCircle as RawCheckCircle,
  XCircle as RawXCircle,
  ChevronDown as RawChevronDown,
} from 'lucide-react-native';
import { withStrippedProps } from '@/utils/stripDevProps';

const Key = withStrippedProps(RawKey);
const Plus = withStrippedProps(RawPlus);
const Trash2 = withStrippedProps(RawTrash2);
const Edit = withStrippedProps(RawEdit);
const CheckCircle = withStrippedProps(RawCheckCircle);
const XCircle = withStrippedProps(RawXCircle);
const ChevronDown = withStrippedProps(RawChevronDown);

interface Provider {
  id: string;
  name: string;
  provider_type: string;
  api_key?: string;
  base_url?: string;
  default_model?: string;
  supports_tools: boolean;
  supports_vision: boolean;
  enabled: boolean;
}

const PROVIDER_TYPES = ['OpenAI', 'Anthropic', 'Google', 'OpenAI-Compatible', 'Custom REST'];

const EMPTY_FORM: Omit<Provider, 'id'> = {
  name: '',
  provider_type: 'OpenAI',
  api_key: '',
  base_url: '',
  default_model: '',
  supports_tools: true,
  supports_vision: false,
  enabled: true,
};

export default function ApiKeysScreen() {
  const insets = useSafeAreaInsets();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, boolean>>({});
  const [showTypePicker, setShowTypePicker] = useState(false);

  const fetchProviders = useCallback(async () => {
    console.log('[ApiKeys] Fetching providers');
    try {
      const res = await apiGet<Provider[]>('/api/providers');
      setProviders(Array.isArray(res) ? res : []);
      setError('');
    } catch (err) {
      console.error('[ApiKeys] Fetch error:', err);
      setError('Failed to load providers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const openAdd = () => {
    console.log('[ApiKeys] Add provider pressed');
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (p: Provider) => {
    console.log('[ApiKeys] Edit provider pressed:', p.id);
    setEditingId(p.id);
    setForm({
      name: p.name,
      provider_type: p.provider_type,
      api_key: p.api_key || '',
      base_url: p.base_url || '',
      default_model: p.default_model || '',
      supports_tools: p.supports_tools,
      supports_vision: p.supports_vision,
      enabled: p.enabled,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Provider name is required.');
      return;
    }
    setSaving(true);
    console.log('[ApiKeys] Saving provider:', editingId ? 'edit' : 'add', form.name);
    try {
      if (editingId) {
        await apiPatch(`/api/providers/${editingId}`, form);
      } else {
        await apiPost('/api/providers', form);
      }
      setShowModal(false);
      await fetchProviders();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save provider.';
      setError(msg);
      console.error('[ApiKeys] Save error:', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    console.log('[ApiKeys] Delete provider pressed:', id);
    try {
      await apiDelete(`/api/providers/${id}`);
      await fetchProviders();
    } catch (err) {
      console.error('[ApiKeys] Delete error:', err);
      setError('Failed to delete provider.');
    }
  };

  const handleTest = async (id: string) => {
    console.log('[ApiKeys] Test connection pressed for provider:', id);
    setTesting(id);
    try {
      await apiPost(`/api/providers/${id}/test`, {});
      setTestResult(prev => ({ ...prev, [id]: true }));
    } catch {
      setTestResult(prev => ({ ...prev, [id]: false }));
    } finally {
      setTesting(null);
    }
  };

  const showBaseUrl = form.provider_type === 'OpenAI-Compatible' || form.provider_type === 'Custom REST';

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 }]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.sectionLabel}>Model Providers</Text>
          <AnimatedPressable style={styles.addBtn} onPress={openAdd}>
            <Plus size={16} color={COLORS.primary} />
            <Text style={styles.addBtnText}>Add</Text>
          </AnimatedPressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : providers.length === 0 ? (
          <EmptyState
            icon={<Key size={28} color={COLORS.primary} />}
            title="No providers yet"
            subtitle="Add an API key to connect a model provider."
            ctaLabel="Add provider"
            onCta={openAdd}
          />
        ) : (
          providers.map(p => {
            const testRes = testResult[p.id];
            return (
              <View key={p.id} style={styles.providerCard}>
                <View style={styles.providerTop}>
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{p.name}</Text>
                    <Text style={styles.providerType}>{p.provider_type}</Text>
                  </View>
                  <View style={styles.providerActions}>
                    <AnimatedPressable
                      style={styles.iconBtn}
                      onPress={() => handleTest(p.id)}
                      disabled={testing === p.id}
                    >
                      {testing === p.id ? (
                        <ActivityIndicator color={COLORS.primary} size="small" />
                      ) : testRes === true ? (
                        <CheckCircle size={18} color={COLORS.success} />
                      ) : testRes === false ? (
                        <XCircle size={18} color={COLORS.danger} />
                      ) : (
                        <CheckCircle size={18} color={COLORS.textSecondary} />
                      )}
                    </AnimatedPressable>
                    <AnimatedPressable style={styles.iconBtn} onPress={() => openEdit(p)}>
                      <Edit size={16} color={COLORS.textSecondary} />
                    </AnimatedPressable>
                    <AnimatedPressable style={styles.iconBtn} onPress={() => handleDelete(p.id)}>
                      <Trash2 size={16} color={COLORS.danger} />
                    </AnimatedPressable>
                  </View>
                </View>
                <View style={styles.providerMeta}>
                  {p.default_model ? (
                    <Text style={styles.metaText}>{p.default_model}</Text>
                  ) : null}
                  <View style={[styles.enabledDot, { backgroundColor: p.enabled ? COLORS.primary : COLORS.textTertiary }]} />
                  <Text style={styles.metaText}>{p.enabled ? 'Enabled' : 'Disabled'}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Provider' : 'Add Provider'}</Text>
            <AnimatedPressable onPress={() => setShowModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </AnimatedPressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Name</Text>
              <TextInput
                style={styles.formInput}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholder="e.g. My OpenAI Key"
                placeholderTextColor={COLORS.textTertiary}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Provider Type</Text>
              <AnimatedPressable
                style={styles.pickerBtn}
                onPress={() => {
                  console.log('[ApiKeys] Provider type picker toggled');
                  setShowTypePicker(!showTypePicker);
                }}
              >
                <Text style={styles.pickerBtnText}>{form.provider_type}</Text>
                <ChevronDown size={16} color={COLORS.textSecondary} />
              </AnimatedPressable>
              {showTypePicker && (
                <View style={styles.pickerDropdown}>
                  {PROVIDER_TYPES.map(t => (
                    <AnimatedPressable
                      key={t}
                      style={[styles.pickerOption, form.provider_type === t && styles.pickerOptionSelected]}
                      onPress={() => {
                        console.log('[ApiKeys] Provider type selected:', t);
                        setForm(f => ({ ...f, provider_type: t }));
                        setShowTypePicker(false);
                      }}
                    >
                      <Text style={[styles.pickerOptionText, form.provider_type === t && styles.pickerOptionTextSelected]}>
                        {t}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>API Key</Text>
              <TextInput
                style={styles.formInput}
                value={form.api_key}
                onChangeText={v => setForm(f => ({ ...f, api_key: v }))}
                placeholder="sk-..."
                placeholderTextColor={COLORS.textTertiary}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            {showBaseUrl && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Base URL</Text>
                <TextInput
                  style={styles.formInput}
                  value={form.base_url}
                  onChangeText={v => setForm(f => ({ ...f, base_url: v }))}
                  placeholder="https://api.example.com/v1"
                  placeholderTextColor={COLORS.textTertiary}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Default Model</Text>
              <TextInput
                style={styles.formInput}
                value={form.default_model}
                onChangeText={v => setForm(f => ({ ...f, default_model: v }))}
                placeholder="gpt-4o, claude-3-5-sonnet..."
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.togglesGroup}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Supports Tools</Text>
                <Switch
                  value={form.supports_tools}
                  onValueChange={v => {
                    console.log('[ApiKeys] Supports tools toggled:', v);
                    setForm(f => ({ ...f, supports_tools: v }));
                  }}
                  trackColor={{ false: COLORS.surfaceTertiary, true: COLORS.primaryMuted }}
                  thumbColor={form.supports_tools ? COLORS.primary : COLORS.textTertiary}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Supports Vision</Text>
                <Switch
                  value={form.supports_vision}
                  onValueChange={v => {
                    console.log('[ApiKeys] Supports vision toggled:', v);
                    setForm(f => ({ ...f, supports_vision: v }));
                  }}
                  trackColor={{ false: COLORS.surfaceTertiary, true: COLORS.primaryMuted }}
                  thumbColor={form.supports_vision ? COLORS.primary : COLORS.textTertiary}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Enabled</Text>
                <Switch
                  value={form.enabled}
                  onValueChange={v => {
                    console.log('[ApiKeys] Enabled toggled:', v);
                    setForm(f => ({ ...f, enabled: v }));
                  }}
                  trackColor={{ false: COLORS.surfaceTertiary, true: COLORS.primaryMuted }}
                  thumbColor={form.enabled ? COLORS.primary : COLORS.textTertiary}
                />
              </View>
            </View>

            <AnimatedPressable
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.background} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>{editingId ? 'Save changes' : 'Add provider'}</Text>
              )}
            </AnimatedPressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,255,159,0.3)',
  },
  addBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  errorText: { color: COLORS.danger, fontSize: 13 },
  providerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  providerTop: { flexDirection: 'row', alignItems: 'center' },
  providerInfo: { flex: 1 },
  providerName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  providerType: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  providerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.surfaceSecondary,
  },
  providerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  enabledDot: { width: 6, height: 6, borderRadius: 3 },
  metaText: { fontSize: 12, color: COLORS.textSecondary },
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalCancel: { fontSize: 15, color: COLORS.primary },
  modalContent: { padding: 20, gap: 16 },
  formGroup: { gap: 6 },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  formInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerBtnText: { fontSize: 14, color: COLORS.text },
  pickerDropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  pickerOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pickerOptionSelected: { backgroundColor: COLORS.primaryMuted },
  pickerOptionText: { fontSize: 14, color: COLORS.text },
  pickerOptionTextSelected: { color: COLORS.primary, fontWeight: '600' },
  togglesGroup: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  toggleLabel: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: COLORS.background, fontSize: 15, fontWeight: '800' },
});
