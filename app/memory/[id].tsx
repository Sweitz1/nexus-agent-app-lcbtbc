import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost, apiDelete } from '@/utils/api';
import { COLORS, FONTS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Trash2, Tag, Clock } from 'lucide-react-native';

interface MemoryItem {
  id: string;
  type: string;
  content: string;
  tags?: string[];
  importance?: number;
  created_at: string;
}

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  fact: { color: COLORS.info, bg: COLORS.infoMuted },
  task: { color: COLORS.primary, bg: COLORS.primaryMuted },
  preference: { color: COLORS.warning, bg: 'rgba(255,184,0,0.12)' },
  context: { color: COLORS.reflection, bg: COLORS.reflectionMuted },
  default: { color: COLORS.textSecondary, bg: COLORS.surfaceSecondary },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MemoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [item, setItem] = useState<MemoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState('fact');
  const [newTags, setNewTags] = useState('');
  const [saving, setSaving] = useState(false);

  const isNew = id === 'new';

  const fetchItem = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      setShowNewModal(true);
      return;
    }
    console.log('[MemoryDetail] Fetching memory item:', id);
    try {
      const res = await apiGet<MemoryItem>(`/api/memory/${id}`);
      setItem(res);
      setError('');
    } catch (err) {
      console.error('[MemoryDetail] Fetch error:', err);
      setError('Failed to load memory item.');
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  const handleDelete = async () => {
    if (!id || isNew) return;
    setDeleting(true);
    console.log('[MemoryDetail] Delete memory pressed:', id);
    try {
      await apiDelete(`/api/memory/${id}`);
      router.back();
    } catch (err) {
      console.error('[MemoryDetail] Delete error:', err);
      setError('Failed to delete memory.');
      setDeleting(false);
    }
  };

  const handleSaveNew = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    const tagsArr = newTags.split(',').map(t => t.trim()).filter(Boolean);
    console.log('[MemoryDetail] Saving new memory:', { type: newType, content: newContent.trim() });
    try {
      await apiPost('/api/memory', {
        type: newType,
        content: newContent.trim(),
        tags: tagsArr,
      });
      setShowNewModal(false);
      router.back();
    } catch (err) {
      console.error('[MemoryDetail] Save error:', err);
      setError('Failed to save memory.');
    } finally {
      setSaving(false);
    }
  };

  const typeConfig = item ? (TYPE_COLORS[item.type] || TYPE_COLORS.default) : TYPE_COLORS.default;
  const tagsArr = item?.tags || [];
  const importanceWidth = Math.min(100, Math.max(0, (item?.importance || 0) * 100));
  const dateStr = item ? formatDate(item.created_at) : '';

  if (isNew) {
    return (
      <>
        <Stack.Screen options={{ title: 'Add Memory' }} />
        <Modal visible={showNewModal} animationType="slide" presentationStyle="formSheet">
          <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Memory</Text>
              <AnimatedPressable onPress={() => { setShowNewModal(false); router.back(); }}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </AnimatedPressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Type</Text>
                <View style={styles.typeRow}>
                  {['fact', 'task', 'preference', 'context'].map(t => (
                    <AnimatedPressable
                      key={t}
                      style={[styles.typeChip, newType === t && styles.typeChipSelected]}
                      onPress={() => {
                        console.log('[MemoryDetail] Type selected:', t);
                        setNewType(t);
                      }}
                    >
                      <Text style={[styles.typeChipText, newType === t && styles.typeChipTextSelected]}>
                        {t}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Content</Text>
                <TextInput
                  style={[styles.formInput, styles.contentInput]}
                  value={newContent}
                  onChangeText={setNewContent}
                  placeholder="What should the agent remember?"
                  placeholderTextColor={COLORS.textTertiary}
                  multiline
                  textAlignVertical="top"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tags (comma-separated)</Text>
                <TextInput
                  style={styles.formInput}
                  value={newTags}
                  onChangeText={setNewTags}
                  placeholder="work, project, important"
                  placeholderTextColor={COLORS.textTertiary}
                  autoCapitalize="none"
                />
              </View>
              <AnimatedPressable
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSaveNew}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.background} size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save memory</Text>
                )}
              </AnimatedPressable>
            </ScrollView>
          </View>
        </Modal>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Memory',
          headerRight: () => (
            <AnimatedPressable
              style={styles.deleteHeaderBtn}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color={COLORS.danger} size="small" />
              ) : (
                <Trash2 size={18} color={COLORS.danger} />
              )}
            </AnimatedPressable>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : item ? (
          <>
            {/* Type badge */}
            <View style={[styles.typeBadge, { backgroundColor: typeConfig.bg }]}>
              <Text style={[styles.typeText, { color: typeConfig.color }]}>{item.type}</Text>
            </View>

            {/* Content */}
            <View style={styles.contentCard}>
              <Text style={styles.contentText} selectable>{item.content}</Text>
            </View>

            {/* Tags */}
            {tagsArr.length > 0 && (
              <View style={styles.tagsSection}>
                <View style={styles.tagsSectionHeader}>
                  <Tag size={14} color={COLORS.textSecondary} />
                  <Text style={styles.tagsSectionTitle}>Tags</Text>
                </View>
                <View style={styles.tagsRow}>
                  {tagsArr.map((tag, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Importance */}
            {item.importance !== undefined && (
              <View style={styles.importanceSection}>
                <Text style={styles.importanceLabel}>Importance</Text>
                <View style={styles.importanceBar}>
                  <View style={[styles.importanceFill, { width: `${importanceWidth}%` as any }]} />
                </View>
                <Text style={styles.importanceValue}>{Math.round(importanceWidth)}%</Text>
              </View>
            )}

            {/* Date */}
            <View style={styles.dateRow}>
              <Clock size={13} color={COLORS.textTertiary} />
              <Text style={styles.dateText}>{dateStr}</Text>
            </View>

            {/* Delete button */}
            <AnimatedPressable
              style={[styles.deleteBtn, deleting && { opacity: 0.6 }]}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color={COLORS.danger} size="small" />
              ) : (
                <>
                  <Trash2 size={16} color={COLORS.danger} />
                  <Text style={styles.deleteBtnText}>Delete memory</Text>
                </>
              )}
            </AnimatedPressable>
          </>
        ) : null}
      </ScrollView>
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
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 16,
  },
  typeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  contentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contentText: { fontSize: 15, color: COLORS.text, lineHeight: 24 },
  tagsSection: { marginBottom: 20 },
  tagsSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  tagsSectionTitle: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: COLORS.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagText: { fontSize: 12, color: COLORS.textSecondary },
  importanceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  importanceLabel: { fontSize: 13, color: COLORS.textSecondary, width: 80 },
  importanceBar: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  importanceFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  importanceValue: { fontSize: 12, color: COLORS.textSecondary, width: 36, textAlign: 'right' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  dateText: { fontSize: 12, color: COLORS.textTertiary },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  deleteBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '700' },
  deleteHeaderBtn: { padding: 8 },
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
  formGroup: { gap: 8 },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeChipSelected: { backgroundColor: COLORS.primaryMuted, borderColor: 'rgba(0,255,159,0.4)' },
  typeChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  typeChipTextSelected: { color: COLORS.primary },
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
  contentInput: { minHeight: 120, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: COLORS.background, fontSize: 15, fontWeight: '800' },
});
