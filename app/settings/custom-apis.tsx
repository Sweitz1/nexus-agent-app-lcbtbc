import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost, apiDelete } from '@/utils/api';
import { COLORS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import { Globe, Plus, Trash2, ChevronRight } from 'lucide-react-native';

interface CustomApi {
  id: string;
  name: string;
  base_url: string;
  auth_type?: string;
  endpoints?: unknown[];
}

export default function CustomApisScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [apis, setApis] = useState<CustomApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchApis = useCallback(async () => {
    console.log('[CustomApis] Fetching custom APIs');
    try {
      const res = await apiGet<CustomApi[]>('/api/custom-apis');
      setApis(Array.isArray(res) ? res : []);
      setError('');
    } catch (err) {
      console.error('[CustomApis] Fetch error:', err);
      setError('Failed to load custom APIs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApis();
  }, [fetchApis]);

  const handleAdd = async () => {
    console.log('[CustomApis] Add custom API pressed');
    try {
      const res = await apiPost<CustomApi>('/api/custom-apis', {
        name: 'New API',
        base_url: '',
      });
      router.push(`/custom-api/${res.id}`);
    } catch (err) {
      console.error('[CustomApis] Add error:', err);
      setError('Failed to create API.');
    }
  };

  const handleDelete = async (id: string) => {
    console.log('[CustomApis] Delete custom API pressed:', id);
    try {
      await apiDelete(`/api/custom-apis/${id}`);
      await fetchApis();
    } catch (err) {
      console.error('[CustomApis] Delete error:', err);
      setError('Failed to delete API.');
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionLabel}>Custom APIs</Text>
          <AnimatedPressable style={styles.addBtn} onPress={handleAdd}>
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
        ) : apis.length === 0 ? (
          <EmptyState
            icon={<Globe size={28} color={COLORS.primary} />}
            title="No custom APIs"
            subtitle="Connect external REST APIs for the agent to call."
            ctaLabel="Add API"
            onCta={handleAdd}
          />
        ) : (
          apis.map(api => {
            const endpointCount = Array.isArray(api.endpoints) ? api.endpoints.length : 0;
            return (
              <AnimatedPressable
                key={api.id}
                style={styles.apiCard}
                onPress={() => {
                  console.log('[CustomApis] API pressed:', api.id);
                  router.push(`/custom-api/${api.id}`);
                }}
              >
                <View style={styles.apiInfo}>
                  <Text style={styles.apiName}>{api.name}</Text>
                  <Text style={styles.apiUrl} numberOfLines={1}>{api.base_url || 'No URL set'}</Text>
                  <Text style={styles.apiMeta}>{endpointCount} endpoint{endpointCount !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.apiActions}>
                  <AnimatedPressable
                    style={styles.iconBtn}
                    onPress={() => handleDelete(api.id)}
                  >
                    <Trash2 size={16} color={COLORS.danger} />
                  </AnimatedPressable>
                  <ChevronRight size={16} color={COLORS.textTertiary} />
                </View>
              </AnimatedPressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40 },
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
  apiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  apiInfo: { flex: 1 },
  apiName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  apiUrl: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  apiMeta: { fontSize: 11, color: COLORS.textTertiary, marginTop: 4 },
  apiActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.surfaceSecondary,
  },
});
