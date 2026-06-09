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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { providers, type Provider } from '@/utils/api';
import { ArrowLeft, Plus, Trash2, CheckCircle2, XCircle, Zap } from 'lucide-react-native';

const ArrowLeftIcon = withStrippedProps(ArrowLeft);
const PlusIcon = withStrippedProps(Plus);
const Trash2Icon = withStrippedProps(Trash2);
const CheckCircle2Icon = withStrippedProps(CheckCircle2);
const XCircleIcon = withStrippedProps(XCircle);
const ZapIcon = withStrippedProps(Zap);

const PROVIDER_DEFAULTS: Record<string, { model: string; baseUrl?: string }> = {
  openai: { model: 'gpt-4o' },
  anthropic: { model: 'claude-opus-4-8' },
  google: { model: 'gemini-2.5-flash' },
  openai_compatible: { model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai' },
  custom_rest: { model: 'default' },
};

export default function ProvidersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [list, setList] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, boolean>>({});

  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setList(await providers.list());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleTypeChange = (t: string) => {
    setProviderType(t);
    const defaults = PROVIDER_DEFAULTS[t] || {};
    setModel(defaults.model || '');
    setBaseUrl(defaults.baseUrl || '');
  };

  const handleCreate = async () => {
    if (!name.trim() || !apiKey.trim() || !model.trim()) {
      Alert.alert('Required', 'Name, API key, and model are required.');
      return;
    }
    setSaving(true);
    try {
      await providers.create({
        name: name.trim(),
        provider_type: providerType,
        api_key: apiKey.trim(),
        default_model: model.trim(),
        base_url: baseUrl.trim() || undefined,
      });
      setShowModal(false);
      setName(''); setApiKey(''); setModel('gpt-4o'); setBaseUrl(''); setProviderType('openai');
      await load();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
    setSaving(false);
  };

  const handleDelete = (p: Provider) => {
    Alert.alert('Delete Provider', `Remove "${p.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await providers.delete(p.id);
            setList((prev) => prev.filter((x) => x.id !== p.id));
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  };

  const handleTest = async (p: Provider) => {
    setTesting(p.id);
    try {
      const result = await providers.test(p.id);
      setTestResult((prev) => ({ ...prev, [p.id]: result.ok }));
      Alert.alert(result.ok ? 'Connected' : 'Failed', result.message);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
    setTesting(null);
  };

  const TYPES = ['openai', 'anthropic', 'google', 'openai_compatible', 'custom_rest'];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeftIcon size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Model Providers</Text>
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
              <Text style={styles.emptyTitle}>No providers</Text>
              <Text style={styles.emptyText}>Add an OpenAI, Anthropic, or Google API key to enable the agent</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)} activeOpacity={0.8}>
                <PlusIcon size={16} color={COLORS.background} />
                <Text style={styles.addBtnText}>Add Provider</Text>
              </TouchableOpacity>
            </View>
          ) : (
            list.map((p) => (
              <View key={p.id} style={styles.providerCard}>
                <View style={styles.providerTop}>
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{p.name}</Text>
                    <Text style={styles.providerType}>{p.provider_type} · {p.default_model}</Text>
                  </View>
                  <View style={[styles.enabledDot, { backgroundColor: p.enabled ? COLORS.primary : COLORS.textMuted }]} />
                </View>
                <View style={styles.providerActions}>
                  <TouchableOpacity
                    style={styles.testBtn}
                    onPress={() => handleTest(p)}
                    disabled={testing === p.id}
                    activeOpacity={0.8}
                  >
                    {testing === p.id
                      ? <ActivityIndicator size="small" color={COLORS.primary} />
                      : testResult[p.id] !== undefined
                        ? testResult[p.id]
                          ? <CheckCircle2Icon size={14} color={COLORS.primary} />
                          : <XCircleIcon size={14} color={COLORS.error} />
                        : null
                    }
                    <Text style={styles.testBtnText}>Test</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Trash2Icon size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add provider modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { paddingTop: insets.top + SPACING.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Provider</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <XCircleIcon size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.field}>
              <Text style={styles.label}>Provider Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
                {TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, providerType === t && styles.typeChipActive]}
                    onPress={() => handleTypeChange(t)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.typeChipText, providerType === t && styles.typeChipTextActive]}>
                      {t.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. My OpenAI"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>API Key</Text>
              <TextInput
                style={styles.input}
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="sk-..."
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Model</Text>
              <TextInput
                style={styles.input}
                value={model}
                onChangeText={setModel}
                placeholder="e.g. gpt-4o"
                placeholderTextColor={COLORS.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            {(providerType === 'openai_compatible' || providerType === 'custom_rest') && (
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
            )}

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleCreate}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color={COLORS.background} />
                : <Text style={styles.saveBtnText}>Save Provider</Text>
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
  providerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  providerTop: { flexDirection: 'row', alignItems: 'center' },
  providerInfo: { flex: 1 },
  providerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  providerType: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  enabledDot: { width: 8, height: 8, borderRadius: 4 },
  providerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  testBtnText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
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
  typeRow: { gap: SPACING.xs },
  typeChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typeChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryDim },
  typeChipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500', textTransform: 'capitalize' },
  typeChipTextActive: { color: COLORS.primary },
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
  saveBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.background },
});
