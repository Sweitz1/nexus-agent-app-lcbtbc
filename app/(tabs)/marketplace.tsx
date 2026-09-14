import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { withStrippedProps } from '@/utils/stripDevProps';
import { Search, X } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import {
  PLUGIN_REGISTRY, CATEGORIES, getInstalledPlugins, installPlugin,
  isInstalled, formatDownloads, Plugin, InstalledPlugin, PluginCategory,
} from '@/utils/plugins';

const SearchIcon = withStrippedProps(Search);
const XIcon = withStrippedProps(X);

export default function MarketplaceScreen() {
  const [installed, setInstalled]   = useState<InstalledPlugin[]>([]);
  const [query, setQuery]           = useState('');
  const [category, setCategory]     = useState<PluginCategory | 'all'>('all');
  const [installing, setInstalling] = useState<string | null>(null);
  const [tab, setTab]               = useState<'browse' | 'installed'>('browse');

  useEffect(() => { loadInstalled(); }, []);

  async function loadInstalled() {
    setInstalled(await getInstalledPlugins());
  }

  async function handleInstall(plugin: Plugin) {
    setInstalling(plugin.id);
    try {
      await installPlugin(plugin);
      await loadInstalled();
      Alert.alert('Installed', `${plugin.name} is ready to use.`);
    } catch {
      Alert.alert('Error', 'Could not install plugin.');
    } finally {
      setInstalling(null);
    }
  }

  const filtered = useMemo(() => {
    let list = PLUGIN_REGISTRY;
    if (category !== 'all') list = list.filter(p => p.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.includes(q))
      );
    }
    return list;
  }, [query, category]);

  const featured = useMemo(
    () => PLUGIN_REGISTRY.filter(p => p.featured),
    [],
  );

  const renderPlugin = useCallback(({ item }: { item: Plugin }) => {
    const inst = isInstalled(item.id, installed);
    const busy = installing === item.id;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push({ pathname: '/plugin-detail', params: { id: item.id } })}
        activeOpacity={0.8}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardIconWrap}>
            <Text style={styles.cardIcon}>{item.icon}</Text>
          </View>
          <View style={styles.cardMeta}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              {item.official && <View style={styles.officialBadge}><Text style={styles.officialText}>Official</Text></View>}
              {item.new && <View style={styles.newBadge}><Text style={styles.newText}>New</Text></View>}
            </View>
            <Text style={styles.cardAuthor}>{item.author} · v{item.version}</Text>
          </View>
          <TouchableOpacity
            style={[styles.installBtn, inst && styles.installedBtn]}
            onPress={() => !inst && handleInstall(item)}
            disabled={inst || busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={[styles.installBtnText, inst && styles.installedBtnText]}>
                {inst ? '✓' : 'Get'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardStat}>{'⭐'.repeat(Math.round(item.rating))} {item.rating}</Text>
          <Text style={styles.cardStat}>↓ {formatDownloads(item.downloads)}</Text>
          <Text style={styles.cardStat}>{item.size}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [installed, installing]);

  const renderInstalled = useCallback(({ item }: { item: InstalledPlugin }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: '/plugin-detail', params: { id: item.id } })}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardIconWrap}>
          <Text style={styles.cardIcon}>{item.icon}</Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardAuthor}>{item.author} · v{item.version}</Text>
        </View>
        <View style={[styles.installBtn, item.enabled ? styles.installedBtn : styles.disabledBtn]}>
          <Text style={[styles.installBtnText, item.enabled ? styles.installedBtnText : styles.disabledBtnText]}>
            {item.enabled ? 'On' : 'Off'}
          </Text>
        </View>
      </View>
      <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
    </TouchableOpacity>
  ), []);

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Plugin Marketplace</Text>
        <Text style={styles.headerSub}>{PLUGIN_REGISTRY.length} plugins available</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['browse', 'installed'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
              {t === 'browse' ? 'Browse' : `Installed (${installed.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'browse' ? (
        <>
          {/* Search */}
          <View style={styles.searchWrap}>
            <SearchIcon size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search plugins…"
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <XIcon size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category filter */}
          <FlatList
            horizontal
            data={CATEGORIES}
            keyExtractor={c => c.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catList}
            renderItem={({ item: cat }) => (
              <TouchableOpacity
                style={[styles.catChip, category === cat.id && styles.catChipActive]}
                onPress={() => setCategory(cat.id as PluginCategory | 'all')}
              >
                <Text style={styles.catChipText}>{cat.icon} {cat.label}</Text>
              </TouchableOpacity>
            )}
          />

          <FlatList
            data={filtered}
            keyExtractor={p => p.id}
            renderItem={renderPlugin}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              !query && category === 'all' ? (
                <View style={styles.featuredSection}>
                  <Text style={styles.sectionLabel}>⭐ Featured</Text>
                  <FlatList
                    horizontal
                    data={featured}
                    keyExtractor={p => p.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
                    renderItem={({ item }) => {
                      const inst = isInstalled(item.id, installed);
                      return (
                        <TouchableOpacity
                          style={styles.featuredCard}
                          onPress={() => router.push({ pathname: '/plugin-detail', params: { id: item.id } })}
                        >
                          <Text style={styles.featuredIcon}>{item.icon}</Text>
                          <Text style={styles.featuredName}>{item.name}</Text>
                          <Text style={styles.featuredDesc} numberOfLines={2}>{item.description}</Text>
                          <TouchableOpacity
                            style={[styles.featuredGetBtn, inst && styles.installedBtn]}
                            onPress={() => !inst && handleInstall(item)}
                            disabled={inst}
                          >
                            <Text style={[styles.featuredGetText, inst && styles.installedBtnText]}>
                              {inst ? '✓ Installed' : 'Get'}
                            </Text>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    }}
                  />
                  <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>All Plugins</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyText}>No plugins match "{query}"</Text>
              </View>
            }
          />
        </>
      ) : (
        <FlatList
          data={installed}
          keyExtractor={p => p.id}
          renderItem={renderInstalled}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🧩</Text>
              <Text style={styles.emptyText}>No plugins installed yet</Text>
              <TouchableOpacity style={styles.browseBtn} onPress={() => setTab('browse')}>
                <Text style={styles.browseBtnText}>Browse Plugins</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  header: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  headerSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  tabBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginRight: SPACING.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: COLORS.primary },
  tabBtnText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  tabBtnTextActive: { color: COLORS.primary },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, margin: SPACING.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14 },

  catList: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, gap: 8 },
  catChip: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.surface,
  },
  catChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryDim },
  catChipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500' },

  list: { padding: SPACING.md, gap: 12 },

  featuredSection: { marginBottom: SPACING.sm },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: SPACING.sm },

  featuredCard: {
    width: 160, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: SPACING.md,
  },
  featuredIcon: { fontSize: 28, marginBottom: 6 },
  featuredName: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  featuredDesc: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17, marginBottom: 10, flex: 1 },
  featuredGetBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.sm,
    paddingVertical: 6, alignItems: 'center',
  },
  featuredGetText: { color: '#000', fontWeight: '700', fontSize: 12 },

  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    gap: SPACING.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardIcon: { fontSize: 22 },
  cardMeta: { flex: 1, gap: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardName: { fontSize: 14, fontWeight: '700', color: COLORS.text, flexShrink: 1 },
  cardAuthor: { fontSize: 11, color: COLORS.textMuted },
  officialBadge: {
    backgroundColor: 'rgba(0,255,159,0.12)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1, borderColor: COLORS.primaryBorder,
  },
  officialText: { fontSize: 10, color: COLORS.primary, fontWeight: '600' },
  newBadge: {
    backgroundColor: 'rgba(255,170,0,0.12)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1, borderColor: 'rgba(255,170,0,0.3)',
  },
  newText: { fontSize: 10, color: COLORS.warning, fontWeight: '600' },
  installBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.sm,
    paddingHorizontal: 14, paddingVertical: 6, minWidth: 48, alignItems: 'center',
  },
  installedBtn: { backgroundColor: COLORS.primaryDim, borderWidth: 1, borderColor: COLORS.primaryBorder },
  disabledBtn: { backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border },
  installBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  installedBtnText: { color: COLORS.primary },
  disabledBtnText: { color: COLORS.textMuted },
  cardDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  cardFooter: { flexDirection: 'row', gap: 14 },
  cardStat: { fontSize: 11, color: COLORS.textMuted },

  empty: { paddingTop: 60, alignItems: 'center', gap: SPACING.sm },
  emptyIcon: { fontSize: 36 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
  browseBtn: {
    marginTop: SPACING.sm, backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  browseBtnText: { color: '#000', fontWeight: '700' },
});
