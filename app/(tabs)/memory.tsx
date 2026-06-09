import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { Brain, Tag } from 'lucide-react-native';

const BrainIcon = withStrippedProps(Brain);
const TagIcon = withStrippedProps(Tag);

const MEMORIES = [
  { id: '1', content: 'User prefers concise summaries over detailed reports', tags: ['preference', 'output'] },
  { id: '2', content: 'Project uses TypeScript with strict mode enabled', tags: ['tech', 'project'] },
  { id: '3', content: 'Deploy to production every Friday at 5pm', tags: ['schedule', 'deploy'] },
  { id: '4', content: 'API rate limit is 1000 requests per minute', tags: ['api', 'limits'] },
];

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();

  const handleMemoryPress = (memoryId: string) => {
    console.log('[Memory] Memory item pressed:', memoryId);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Memory</Text>
        <Text style={styles.subtitle}>{MEMORIES.length} stored memories</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {MEMORIES.map((memory) => (
          <TouchableOpacity
            key={memory.id}
            style={styles.memoryCard}
            onPress={() => handleMemoryPress(memory.id)}
            activeOpacity={0.7}
          >
            <View style={styles.memoryHeader}>
              <BrainIcon size={16} color={COLORS.primary} />
              <Text style={styles.memoryContent}>{memory.content}</Text>
            </View>
            <View style={styles.tags}>
              {memory.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <TagIcon size={10} color={COLORS.textSecondary} />
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        ))}
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
    gap: 2,
  },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary },
  content: { padding: SPACING.md, gap: SPACING.sm },
  memoryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  memoryHeader: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start' },
  memoryContent: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20 },
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
});
