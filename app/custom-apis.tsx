import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { customApis, type CustomApi } from '@/utils/api';
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, Zap, XCircle } from 'lucide-react-native';

const ArrowLeftIcon = withStrippedProps(ArrowLeft);
const PlusIcon = withStrippedProps(Plus);
const Trash2Icon = withStrippedProps(Trash2);
const ChevronDownIcon = withStrippedProps(ChevronDown);
const ChevronUpIcon = withStrippedProps(ChevronUp);
const ZapIcon = withStrippedProps(Zap);
const XCircleIcon = withStrippedProps(XCircle);

export default function CustomApisScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [list, setList] = useState<CustomApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [authType, setAuthType] = useState<'none' | 'api_key' | 'bearer'>('none');
  const [authSecret, setAuthSecret] = useState('');
  const [authHeader, setAuthHeader] = useState('');
  const [sensitive, setSensitive] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setList(await customApis.list()); } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setName(''); setBaseUrl(''); setAuthType('none');
    setAuthSecret(''); setAuthHeader(''); setSensitive(false);
  };

  const handleCreate = async () => {
    if (!name.trim() || !baseUrl.trim()) {
      Alert.alert('Required', 'Name and Base URL are required');
      return;
    }
    setSaving(true);
    try {
      await customApis.create({
        name: name.trim(),
        base_url: baseUrl.trim(),
        auth_type: authType,
        auth_secret: authSecret.trim() || undefined,
        auth_header_name: authHeader.trim() || undefined,
        sensitive,
      });
      setShowModal(false);
      resetForm();
      await load();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
    setSaving(false);
  };

  const handleDelete = (api: CustomApi) => {
    Alert.alert('Delete API', `Remove "${api.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await customApis.delete(api.id);
            setList((prev) => prev.filter((x) => x.id !== api.id));
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  };

  const handleTest = async (api: CustomApi) => {
    setTesting(api.id);
    try {
      const result = await customApis.test(api.id);
      Alert.alert(result.ok ? 'Connected' : 'Failed', `Status ${result.status}: ${result.message}`);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
    setTesting(null);
  };

  const handleDeleteEndpoint = async (apiId: string, endpointId: string) => {
    try {
      await customApis.deleteEndpoint(apiId, endpointId);
      setList((prev) => prev.map((a) =>
        a.id === apiId
          ? { ...a, endpoints: a.endpoints.filter((e) => e.id !== endpointId) }
          : a
      ));
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeftIcon size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Custom APIs</Text>
        <TouchableOpacity onPress={() => setShowModal(true)}>
          <PlusIcon size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {list.length === 0 ? (
            <View style={styles.empty}>
              <ZapIcon size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No custom APIs</Text>
              <Text style={styles.emptyText}>Connect your own REST APIs as agent tools</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)} activeOpacity={0.8}>
                <PlusIcon size={16} color={COLORS.background} />
                <Text style={styles.addBtnText}>Add API</Text>
              </TouchableOpacity>
            </View>
          ) : (
            list.map((api) => {
              const expanded = expandedId === api.id;
              return (
                <View key={api.id} style={styles.apiCard}>
                  <TouchableOpacity
                    style={styles.apiTop}
                    onPress={() => setExpandedId(expanded ? null : api.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.apiInfo}>
                      <Text style={styles.apiName}>{api.name}</Text>
                      <Text style={styles.apiUrl} numberOfLines={1}>{api.base_url}</Text>
                      <View style={styles.apiMeta}>
                        <View style={styles.authBadge}>
                          <Text style={styles.authBadgeText}>{api.auth_type}</Text>
                        </View>
                        {api.sensitive && (
                          <View style={[styles.authBadge, styles.sensitiveBadge]}>
                            <Text style={styles.sensitiveBadgeText}>sensitive</Text>
                          </View>
                        )}
                        <Text style={styles.endpointCount}>{api.endpoints.length} endpoints</Text>
                      </View>
                    </View>
                    {expanded ? <ChevronUpIcon size={18} color={COLORS.textMuted} /> : <ChevronDownIcon size={18} color={COLORS.textMuted} />}
                  </TouchableOpacity>

                  {expanded && (
                    <View style={styles.expanded}>
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={styles.testBtn}
                          onPress={() => handleTest(api)}
                          disabled={testing === api.id}
                          activeOpacity={0.8}
                        >
                          {testing === api.id
                            ? <ActivityIndicator size="small" color={COLORS.primary} />
                            : <Text style={styles.testBtnText}>Test Connection</Text>
                          }
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(api)}>
                          <Trash2Icon size={16} color={COLORS.error} />
                        </TouchableOpacity>
                      </View>

                      {api.endpoints.length > 0 && (
                        <View style={styles.endpointsList}>
                          <Text style={styles.endpointsLabel}>Endpoints</Text>
                          {api.endpoints.map((ep) => (
                            <View key={ep.id} style={styles.endpointRow}>
                              <View style={styles.methodBadge}>
                                <Text style={styles.methodText}>{ep.method}</Text>
                              </View>
                              <Text style={styles.endpointPath} numberOfLines={1}>{ep.path}</Text>
                              <TouchableOpacity onPress={() => handleDeleteEndpoint(api.id, ep.id)}>
                                <XCircleIcon size={14} color={COLORS.textMuted} />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add API modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { paddingTop: insets.top + SPACING.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Custom API</Text>
            <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
              <XCircleIcon size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Slack API"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Base URL</Text>
              <TextInput
                style={styles.input}
                value={baseUrl}
                onChangeText={setBaseUrl}
                placeholder="https://api.example.com"
                placeholderTextColor={COLORS.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Auth Type</Text>
              <View style={styles.authTypeRow}>
                {(['none', 'api_key', 'bearer'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.authChip, authType === t && styles.authChipActive]}
                    onPress={() => setAuthType(t)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.authChipText, authType === t && styles.authChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {authType !== 'none' && (
              <>
                {authType === 'api_key' && (
                  <View style={styles.field}>
                    <Text style={styles.label}>Header Name</Text>
                    <TextInput
                      style={styles.input}
                      value={authHeader}
                      onChangeText={setAuthHeader}
                      placeholder="X-API-Key"
                      placeholderTextColor={COLORS.textMuted}
                      autoCorrect={false}
                    />
                  </View>
                )}
                <View style={styles.field}>
                  <Text style={styles.label}>Secret / Token</Text>
                  <TextInput
                    style={styles.input}
                    value={authSecret}
                    onChangeText={setAuthSecret}
                    placeholder="Your API secret"
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                </View>
              </>
            )}

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Mark as Sensitive</Text>
                <Text style={styles.switchDesc}>Agent must request approval before calling</Text>
              </View>
              <Switch
                value={sensitive}
                onValueChange={setSensitive}
                trackColor={{ false: COLORS.border, true: COLORS.primaryBorder }}
                thumbColor={sensitive ? COLORS.primary : COLORS.textMuted}
              />
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={handleCreate}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color={COLORS.background} />
                : <Text style={styles.saveBtnText}>Save API</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: SPACING.md, gap: SPACING.sm, paddingBottom: SPACING.xxl },
  empty: { alignItems: 'center', gap: SPACING.sm, padding: SPACING.xl, paddingTop: SPACING.xxl },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.background },
  apiCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  apiTop: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.sm },
  apiInfo: { flex: 1, gap: 4 },
  apiName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  apiUrl: { fontSize: 12, color: COLORS.textMuted, fontFamily: 'SpaceMono' },
  apiMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap' },
  authBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  authBadgeText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  sensitiveBadge: { backgroundColor: COLORS.error + '18', borderColor: COLORS.error + '44' },
  sensitiveBadgeText: { fontSize: 11, color: COLORS.error, fontWeight: '500' },
  endpointCount: { fontSize: 11, color: COLORS.textMuted },
  expanded: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  testBtn: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  testBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  endpointsList: { gap: SPACING.xs },
  endpointsLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  endpointRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  methodBadge: {
    backgroundColor: '#ffaa0022',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#ffaa0044',
  },
  methodText: { fontSize: 10, fontWeight: '700', color: '#ffaa00' },
  endpointPath: { flex: 1, fontSize: 12, color: COLORS.text, fontFamily: 'SpaceMono' },
  modal: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalContent: { padding: SPACING.md, gap: SPACING.md, paddingBottom: SPACING.xxl },
  field: { gap: SPACING.xs },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
  },
  authTypeRow: { flexDirection: 'row', gap: SPACING.xs },
  authChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  authChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryDim },
  authChipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  authChipTextActive: { color: COLORS.primary },
  switchRow: {
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
  switchLabel: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  switchDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
    minHeight: 52,
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.background },
});
