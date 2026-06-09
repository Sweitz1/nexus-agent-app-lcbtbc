import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Animated,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost } from '@/utils/api';
import { COLORS, FONTS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { EmptyState } from '@/components/EmptyState';
import {
  Brain as RawBrain,
  Search as RawSearch,
  Plus as RawPlus,
  ChevronRight as RawChevronRight,
  Tag as RawTag,
} from 'lucide-react-native';
import { withStrippedProps } from '@/utils/stripDevProps';

const Brain = withStrippedProps(RawBrain);
const Search = withStrippedProps(RawSearch);
const Plus = withStrippedProps(RawPlus);
const ChevronRight = withStrippedProps(RawChevronRight);
const Tag = withStrippedProps(RawTag);

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

const TYPE_FILTERS = ['all', 'fact', 'task', 'preference', 'context'];

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function SkeletonRow() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.memoryRow, { opacity }]}>
      <View style={{ gap: 8, flex: 1 }}>
        <View style={{ width: 60, height: 20, borderRadius: 6, backgroundColor: COLORS.surfaceSecondary }} />
        <View style={{ width: '90%', height: 13, borderRadius: 6, backgroundColor: COLORS.surfaceSecondary }} />
        <View style={{ width: '60%', height: 11, borderRadius: 5, backgroundColor: COLORS.surfaceSecondary }} />
      </View>
    </Animated.View>
  );
}

export default function MemoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<MemoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchMemory = useCallback(async () => {
    console.log('[Memory] Fetching memory, query:', query, 'type:', typeFilter);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await apiGet<MemoryItem[]>(`/api/memory${qs}`);
      setItems(Array.isArray(res) ? res : []);
      setError('');
    } catch (err) {
      console.error('[Memory] Fetch error:', err);
      setError('Failed to load memory.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, typeFilter]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchMemory, query ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchMemory]);

  const onRefresh = useCallback(() => {
    console.log('[Memory] Pull to refresh');
    setRefreshing(true);
    fetchMemory();
  }, [fetchMemory]);

  const renderItem = ({ item }: { item: MemoryItem }) => {
    const typeConfig = TYPE_COLORS[item.type] || TYPE_COLORS.default;
    const importanceWidth = Math.min(100, Math.max(0, (item.importance || 0) * 100));
    const relTime = formatRelativeTime(item.created_at);
    const tagsArr = Array.isArray(item.tags) ? item.tags : [];

    return (
      <AnimatedPressable
        style={styles.memoryRow}
        onPress={() => {
          console.log('[Memory] Memory item pressed:', item.id);
          router.push(`/memory/${item.id}`);
        }}
      >
        <View style={styles.memoryTop}>
          <View style={[styles.typeBadge, { backgroundColor: typeConfig.bg }]}>
            <Text style={[styles.typeText, { color: typeConfig.color }]}>{item.type || 'memory'}</Text>
          </View>
          <Text style={styles.memoryTime}>{relTime}</Text>
          <ChevronRight size={14} color={COLORS.textTertiary} />
        </View>
        <Text style={styles.memoryContent} numberOfLines={2}>{item.content}</Text>
        {tagsArr.length > 0 && (
          <View style={styles.tagsRow}>
            <Tag size={11} color={COLORS.textTertiary} />
            {tagsArr.slice(0, 3).map((tag, i) => (
              <Text key={i} style={styles.tag}>{tag}</Text>
            ))}
          </View>
        )}
        {item.importance !== undefined && (
          <View style={styles.importanceBar}>
            <View style={[styles.importanceFill, { width: `${importanceWidth}%` as any }]} />
          </View>
        )}
      </AnimatedPressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Memory</Text>
        <AnimatedPressable
          style={styles.addBtn}
          onPress={() => {
            console.log('[Memory] Add memory pressed');
            router.push('/memory/new');
          }}
        >
          <Plus size={18} color={COLORS.primary} />
        </AnimatedPressable>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Search size={16} color={COLORS.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={q => {
            console.log('[Memory] Search query changed:', q);
            setQuery(q);
          }}
          placeholder="Search memory..."
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Type filters */}
      <FlatList
        horizontal
        data={TYPE_FILTERS}
        keyExtractor={f => f}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContent}
        style={styles.filtersList}
        renderItem={({ item: f }) => (
          <AnimatedPressable
            style={[styles.filterChip, typeFilter === f && styles.filterChipActive]}
            onPress={() => {
              console.log('[Memory] Type filter changed to:', f);
              setTypeFilter(f);
            }}
          >
            <Text style={[styles.filterChipText, typeFilter === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </AnimatedPressable>
        )}
      />

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.listContent}>
          {[0, 1, 2, 3].map(i => <SkeletonRow key={i} />)}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={m => m.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Brain size={28} color={COLORS.primary} />}
              title="No memories yet"
              subtitle="The agent stores facts, preferences, and context here as it works."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  pageTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,255,159,0.3)',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  filtersList: { maxHeight: 44, marginBottom: 12 },
  filtersContent: { paddingHorizontal: 20, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primaryMuted, borderColor: 'rgba(0,255,159,0.4)' },
  filterChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: COLORS.primary },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted,
    marginHorizontal: 20,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  errorText: { color: COLORS.danger, fontSize: 13 },
  listContent: { paddingHorizontal: 20, paddingTop: 4 },
  memoryRow: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  memoryTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  memoryTime: { fontSize: 11, color: COLORS.textTertiary, flex: 1 },
  memoryContent: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tag: {
    fontSize: 11,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.surfaceSecondary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  importanceBar: {
    height: 3,
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  importanceFill: {
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
});
