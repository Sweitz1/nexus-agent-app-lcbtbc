import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { memory, type Memory } from '@/utils/api';
import { Brain, Tag, Trash2, Search } from 'lucide-react-native';

const BrainIcon = withStrippedProps(Brain);
const TagIcon = withStrippedProps(Tag);
const Trash2Icon = withStrippedProps(Trash2);
const SearchIcon = withStrippedProps(Search);

const MEMORY_TYPE_COLORS: Record<string, string> = {
  short_term: '#ffaa00',
  long_term: '#00ccff',
  task: COLORS.primary,
  project: '#cc88ff',
  conversation: '#ff8844',
  tool_result: '#44ffcc',
  user_preference: '#ff4488',
};

const TYPE_FILTERS = ['all', 'task', 'long_term', 'short_term', 'user_preference', 'project', 'tool_result'];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const [memoryList, setMemoryList] = useState<Memory[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await memory.list(typeFilter !== 'all' ? { type: typeFilter } : undefined);
      setMemoryList(result);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleDelete = (mem: Memory) => {
    Alert.alert('Delete Memory', 'Remove this memory permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await memory.delete(mem.id);
            setMemoryList((prev) => prev.filter((m) => m.id !== mem.id));
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  };

  const filtered = memoryList.filter((m) =>
    search.trim() === '' || m.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Memory</Text>
        <Text style={styles.subtitle}>{memoryList.length} memories</Text>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <SearchIcon size={16} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search memories..."
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      {/* Type filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {TYPE_FILTERS.map((f) => {
          const color = f === 'all' ? COLORS.primary : (MEMORY_TYPE_COLORS[f] ?? COLORS.textSecondary);
          const active = typeFilter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, active && { borderColor: color, backgroundColor: color + '22' }]}
              onPress={() => setTypeFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, active && { color }]}>
                {f.replace(/_/g, ' ')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, filtered.length === 0 && styles.contentEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <BrainIcon size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No memories</Text>
              <Text style={styles.emptyText}>Agent memories appear here as tasks complete</Text>
            </View>
          ) : (
            filtered.map((mem) => {
              const typeColor = MEMORY_TYPE_COLORS[mem.memory_type] ?? COLORS.textSecondary;
              return (
                <View key={mem.id} style={styles.memoryCard}>
                  <View style={styles.memoryTop}>
                    <View style={[styles.typeBadge, { borderColor: typeColor + '44', backgroundColor: typeColor + '18' }]}>
                      <BrainIcon size={10} color={typeColor} />
                      <Text style={[styles.typeText, { color: typeColor }]}>
                        {mem.memory_type.replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <Text style={styles.timeText}>{timeAgo(mem.created_at)}</Text>
                    <TouchableOpacity onPress={() => handleDelete(mem)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Trash2Icon size={14} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.memoryContent}>{mem.content}</Text>
                  {mem.tags.length > 0 && (
                    <View style={styles.tags}>
                      {mem.tags.map((tag) => (
                        <View key={tag} style={styles.tag}>
                          <TagIcon size={10} color={COLORS.textSecondary} />
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>
                      Importance: {parseFloat(mem.importance_score).toFixed(1)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    paddingTop: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14 },
  filters: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  filterChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500', textTransform: 'capitalize' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: SPACING.md, gap: SPACING.sm },
  contentEmpty: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.xxl },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  memoryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  memoryTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  timeText: { flex: 1, fontSize: 11, color: COLORS.textMuted },
  memoryContent: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryDim,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  tagText: { fontSize: 11, color: COLORS.primary, fontWeight: '500' },
  metaRow: { flexDirection: 'row' },
  metaText: { fontSize: 11, color: COLORS.textMuted },
});
