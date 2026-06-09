import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Modal,
  Switch,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPatch, apiPost, apiDelete } from '@/utils/api';
import { COLORS, FONTS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import {
  Plus as RawPlus,
  Trash2 as RawTrash2,
  Edit as RawEdit,
  ChevronDown as RawChevronDown,
} from 'lucide-react-native';
import { withStrippedProps } from '@/utils/stripDevProps';

const Plus = withStrippedProps(RawPlus);
const Trash2 = withStrippedProps(RawTrash2);
const Edit = withStrippedProps(RawEdit);
const ChevronDown = withStrippedProps(RawChevronDown);

interface Endpoint {
  id: string;
  method: string;
  path: string;
  description?: string;
  requires_confirmation: boolean;
  input_schema?: string;
  output_schema?: string;
}

interface CustomApi {
  id: string;
  name: string;
  base_url: string;
  auth_type?: string;
  auth_value?: string;
  endpoints?: Endpoint[];
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const EMPTY_ENDPOINT: Omit<Endpoint, 'id'> = {
  method: 'GET',
  path: '',
  description: '',
  requires_confirmation: false,
  input_schema: '',
  output_schema: '',
};

export default function CustomApiDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [api, setApi] = useState<CustomApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showEndpointModal, setShowEndpointModal] = useState(false);
  const [editingEndpointId, setEditingEndpointId] = useState<string | null>(null);
  const [endpointForm, setEndpointForm] = useState({ ...EMPTY_ENDPOINT });
  const [showMethodPicker, setShowMethodPicker] = useState(false);

  const fetchApi = useCallback(async () => {
    if (!id || id === 'new') return;
    console.log('[CustomApiDetail] Fetching API:', id);
    try {
      const res = await apiGet<CustomApi>(`/api/custom-apis/${id}`);
      setApi(res);
      setError('');
    } catch (err) {
      console.error('[CustomApiDetail] Fetch error:', err);
      setError('Failed to load API.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchApi();
  }, [fetchApi]);

  const handleSaveApi = async () => {
    if (!api || !id) return;
    setSaving(true);
    console.log('[CustomApiDetail] Saving API:', id);
    try {
      await apiPatch(`/api/custom-apis/${id}`, {
        name: api.name,
        base_url: api.base_url,
        auth_type: api.auth_type,
        auth_value: api.auth_value,
      });
      setError('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save.';
      setError(msg);
      console.error('[CustomApiDetail] Save error:', msg);
    } finally {
      setSaving(false);
    }
  };

  const openAddEndpoint = () => {
    console.log('[CustomApiDetail] Add endpoint pressed');
    setEditingEndpointId(null);
    setEndpointForm({ ...EMPTY_ENDPOINT });
    setShowEndpointModal(true);
  };

  const openEditEndpoint = (ep: Endpoint) => {
    console.log('[CustomApiDetail] Edit endpoint pressed:', ep.id);
    setEditingEndpointId(ep.id);
    setEndpointForm({
      method: ep.method,
      path: ep.path,
      description: ep.description || '',
      requires_confirmation: ep.requires_confirmation,
      input_schema: ep.input_schema || '',
      output_schema: ep.output_schema || '',
    });
    setShowEndpointModal(true);
  };

  const handleSaveEndpoint = async () => {
    if (!id) return;
    console.log('[CustomApiDetail] Saving endpoint:', editingEndpointId ? 'edit' : 'add');
    try {
      if (editingEndpointId) {
        await apiPatch(`/api/custom-apis/${id}/endpoints/${editingEndpointId}`, endpointForm);
      } else {
        await apiPost(`/api/custom-apis/${id}/endpoints`, endpointForm);
      }
      setShowEndpointModal(false);
      await fetchApi();
    } catch (err) {
      console.error('[CustomApiDetail] Save endpoint error:', err);
      setError('Failed to save endpoint.');
    }
  };

  const handleDeleteEndpoint = async (epId: string) => {
    if (!id) return;
    console.log('[CustomApiDetail] Delete endpoint pressed:', epId);
    try {
      await apiDelete(`/api/custom-apis/${id}/endpoints/${epId}`);
      await fetchApi();
    } catch (err) {
      console.error('[CustomApiDetail] Delete endpoint error:', err);
      setError('Failed to delete endpoint.');
    }
  };

  const endpoints = api?.endpoints || [];

  return (
    <>
      <Stack.Screen options={{ title: api?.name || 'Custom API' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : !api ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error || 'API not found.'}</Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* API config */}
            <Text style={styles.sectionLabel}>Configuration</Text>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Name</Text>
              <TextInput
                style={styles.formInput}
                value={api.name}
                onChangeText={v => setApi(a => a ? { ...a, name: v } : a)}
                placeholder="API name"
                placeholderTextColor={COLORS.textTertiary}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Base URL</Text>
              <TextInput
                style={styles.formInput}
                value={api.base_url}
                onChangeText={v => setApi(a => a ? { ...a, base_url: v } : a)}
                placeholder="https://api.example.com"
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Auth Type</Text>
              <TextInput
                style={styles.formInput}
                value={api.auth_type || ''}
                onChangeText={v => setApi(a => a ? { ...a, auth_type: v } : a)}
                placeholder="bearer, api_key, basic..."
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Auth Value</Text>
              <TextInput
                style={styles.formInput}
                value={api.auth_value || ''}
                onChangeText={v => setApi(a => a ? { ...a, auth_value: v } : a)}
                placeholder="Token or key value"
                placeholderTextColor={COLORS.textTertiary}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <AnimatedPressable
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSaveApi}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.background} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save configuration</Text>
              )}
            </AnimatedPressable>

            {/* Endpoints */}
            <View style={styles.endpointsHeader}>
              <Text style={styles.sectionLabel}>Endpoints ({endpoints.length})</Text>
              <AnimatedPressable style={styles.addBtn} onPress={openAddEndpoint}>
                <Plus size={14} color={COLORS.primary} />
                <Text style={styles.addBtnText}>Add</Text>
              </AnimatedPressable>
            </View>

            {endpoints.map(ep => (
              <View key={ep.id} style={styles.endpointCard}>
                <View style={styles.endpointTop}>
                  <View style={[styles.methodBadge, { backgroundColor: COLORS.toolCallMuted }]}>
                    <Text style={[styles.methodText, { color: COLORS.toolCall }]}>{ep.method}</Text>
                  </View>
                  <Text style={styles.endpointPath} numberOfLines={1}>{ep.path}</Text>
                  <AnimatedPressable style={styles.iconBtn} onPress={() => openEditEndpoint(ep)}>
                    <Edit size={14} color={COLORS.textSecondary} />
                  </AnimatedPressable>
                  <AnimatedPressable style={styles.iconBtn} onPress={() => handleDeleteEndpoint(ep.id)}>
                    <Trash2 size={14} color={COLORS.danger} />
                  </AnimatedPressable>
                </View>
                {ep.description ? (
                  <Text style={styles.endpointDesc}>{ep.description}</Text>
                ) : null}
                {ep.requires_confirmation && (
                  <View style={styles.confirmBadge}>
                    <Text style={styles.confirmText}>Requires confirmation</Text>
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Endpoint Modal */}
      <Modal visible={showEndpointModal} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingEndpointId ? 'Edit Endpoint' : 'Add Endpoint'}</Text>
            <AnimatedPressable onPress={() => setShowEndpointModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </AnimatedPressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Method</Text>
              <AnimatedPressable
                style={styles.pickerBtn}
                onPress={() => {
                  console.log('[CustomApiDetail] Method picker toggled');
                  setShowMethodPicker(!showMethodPicker);
                }}
              >
                <Text style={styles.pickerBtnText}>{endpointForm.method}</Text>
                <ChevronDown size={16} color={COLORS.textSecondary} />
              </AnimatedPressable>
              {showMethodPicker && (
                <View style={styles.pickerDropdown}>
                  {HTTP_METHODS.map(m => (
                    <AnimatedPressable
                      key={m}
                      style={[styles.pickerOption, endpointForm.method === m && styles.pickerOptionSelected]}
                      onPress={() => {
                        console.log('[CustomApiDetail] Method selected:', m);
                        setEndpointForm(f => ({ ...f, method: m }));
                        setShowMethodPicker(false);
                      }}
                    >
                      <Text style={[styles.pickerOptionText, endpointForm.method === m && styles.pickerOptionTextSelected]}>
                        {m}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Path</Text>
              <TextInput
                style={[styles.formInput, { fontFamily: FONTS.mono }]}
                value={endpointForm.path}
                onChangeText={v => setEndpointForm(f => ({ ...f, path: v }))}
                placeholder="/users/{id}"
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Description</Text>
              <TextInput
                style={styles.formInput}
                value={endpointForm.description}
                onChangeText={v => setEndpointForm(f => ({ ...f, description: v }))}
                placeholder="What does this endpoint do?"
                placeholderTextColor={COLORS.textTertiary}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Input Schema (JSON)</Text>
              <TextInput
                style={[styles.formInput, styles.schemaInput, { fontFamily: FONTS.mono }]}
                value={endpointForm.input_schema}
                onChangeText={v => setEndpointForm(f => ({ ...f, input_schema: v }))}
                placeholder='{"type": "object", "properties": {...}}'
                placeholderTextColor={COLORS.textTertiary}
                multiline
                autoCapitalize="none"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Output Schema (JSON)</Text>
              <TextInput
                style={[styles.formInput, styles.schemaInput, { fontFamily: FONTS.mono }]}
                value={endpointForm.output_schema}
                onChangeText={v => setEndpointForm(f => ({ ...f, output_schema: v }))}
                placeholder='{"type": "object", "properties": {...}}'
                placeholderTextColor={COLORS.textTertiary}
                multiline
                autoCapitalize="none"
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Requires confirmation</Text>
              <Switch
                value={endpointForm.requires_confirmation}
                onValueChange={v => {
                  console.log('[CustomApiDetail] Requires confirmation toggled:', v);
                  setEndpointForm(f => ({ ...f, requires_confirmation: v }));
                }}
                trackColor={{ false: COLORS.surfaceTertiary, true: COLORS.primaryMuted }}
                thumbColor={endpointForm.requires_confirmation ? COLORS.primary : COLORS.textTertiary}
              />
            </View>
            <AnimatedPressable style={styles.saveBtn} onPress={handleSaveEndpoint}>
              <Text style={styles.saveBtnText}>{editingEndpointId ? 'Save endpoint' : 'Add endpoint'}</Text>
            </AnimatedPressable>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20 },
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
    marginBottom: 12,
    marginTop: 20,
  },
  formGroup: { marginBottom: 14 },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
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
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  saveBtnText: { color: COLORS.background, fontSize: 15, fontWeight: '800' },
  endpointsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,255,159,0.3)',
  },
  addBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  endpointCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  endpointTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  methodText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  endpointPath: { flex: 1, fontSize: 13, color: COLORS.text, fontFamily: FONTS.mono },
  iconBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: COLORS.surfaceSecondary,
  },
  endpointDesc: { fontSize: 12, color: COLORS.textSecondary },
  confirmBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,184,0,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  confirmText: { fontSize: 10, color: COLORS.warning, fontWeight: '600' },
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
  modalContent: { padding: 20 },
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
  schemaInput: { minHeight: 80, textAlignVertical: 'top' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  toggleLabel: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
});
