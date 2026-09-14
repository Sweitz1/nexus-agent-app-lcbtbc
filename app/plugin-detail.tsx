import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import {
  PLUGIN_REGISTRY, getInstalledPlugins, installPlugin, uninstallPlugin,
  togglePlugin, isInstalled, formatDownloads, InstalledPlugin,
} from '@/utils/plugins';

export default function PluginDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const plugin = PLUGIN_REGISTRY.find(p => p.id === id);

  const [installed, setInstalled]   = useState<InstalledPlugin[]>([]);
  const [busy, setBusy]             = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setInstalled(await getInstalledPlugins());
  }

  if (!plugin) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={{ color: COLORS.textSecondary }}>Plugin not found.</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: COLORS.primary, marginTop: 12 }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const inst = installed.find(p => p.id === plugin.id);
  const instEnabled = inst?.enabled ?? false;

  async function handleInstall() {
    setBusy(true);
    try {
      await installPlugin(plugin);
      await load();
      Alert.alert('Installed', `${plugin.name} is now active.`);
    } catch {
      Alert.alert('Error', 'Installation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUninstall() {
    Alert.alert('Uninstall', `Remove ${plugin.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Uninstall', style: 'destructive',
        onPress: async () => {
          setBusy(true);
          await uninstallPlugin(plugin.id);
          await load();
          setBusy(false);
        },
      },
    ]);
  }

  async function handleToggle(val: boolean) {
    await togglePlugin(plugin.id, val);
    await load();
  }

  const stars = '★'.repeat(Math.round(plugin.rating)) + '☆'.repeat(5 - Math.round(plugin.rating));

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{plugin.name}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Text style={styles.heroIconText}>{plugin.icon}</Text>
          </View>
          <View style={styles.heroInfo}>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroName}>{plugin.name}</Text>
              {plugin.official && (
                <View style={styles.badge}><Text style={styles.badgeText}>Official</Text></View>
              )}
            </View>
            <Text style={styles.heroAuthor}>{plugin.author}</Text>
            <Text style={styles.heroRating}>
              <Text style={{ color: COLORS.warning }}>{stars}</Text>
              {'  '}{plugin.rating} · {formatDownloads(plugin.downloads)} installs
            </Text>
          </View>
        </View>

        {/* 18+ warning */}
        {plugin.category === 'adult' && (
          <View style={styles.adultBanner}>
            <Text style={styles.adultBannerIcon}>🔞</Text>
            <Text style={styles.adultBannerText}>
              This plugin is restricted to adults 18+. You are responsible for complying with local laws. All content is generated on your own server.
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          {!inst ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.installBtn, busy && { opacity: 0.6 }]}
              onPress={handleInstall}
              disabled={busy}
            >
              {busy
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={styles.installBtnText}>Install</Text>}
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Enabled</Text>
                <Switch
                  value={instEnabled}
                  onValueChange={handleToggle}
                  trackColor={{ false: COLORS.border, true: COLORS.primaryDim }}
                  thumbColor={instEnabled ? COLORS.primary : COLORS.textMuted}
                />
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.uninstallBtn]}
                onPress={handleUninstall}
              >
                <Text style={styles.uninstallBtnText}>Uninstall</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Details grid */}
        <View style={styles.grid}>
          {[
            ['Version', `v${plugin.version}`],
            ['Size', plugin.size],
            ['Category', plugin.category],
          ].map(([label, value]) => (
            <View key={label} style={styles.gridCell}>
              <Text style={styles.gridLabel}>{label}</Text>
              <Text style={styles.gridValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.body}>{plugin.longDescription}</Text>
        </View>

        {/* Permissions */}
        {plugin.permissions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Permissions Required</Text>
            {plugin.permissions.map(perm => (
              <View key={perm} style={styles.permRow}>
                <Text style={styles.permIcon}>
                  {{ network: '🌐', storage: '💾', camera: '📷', microphone: '🎤',
                    calendar: '📅', notifications: '🔔', clipboard: '📋',
                    'sandboxed-execution': '⚡', location: '📍', contacts: '👥' }[perm] ?? '🔒'}
                </Text>
                <Text style={styles.permText}>{perm}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Tags */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <View style={styles.tagWrap}>
            {plugin.tags.map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Changelog */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Changelog</Text>
          {plugin.changelog.map(entry => (
            <View key={entry.version} style={styles.changeEntry}>
              <Text style={styles.changeVersion}>v{entry.version}</Text>
              <Text style={styles.changeNotes}>{entry.notes}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1, textAlign: 'center' },
  backBtn: { paddingVertical: 4, minWidth: 60 },
  backText: { color: COLORS.primary, fontSize: 14 },

  scroll: { padding: SPACING.md, gap: SPACING.md },

  hero: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  heroIcon: {
    width: 72, height: 72, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  heroIconText: { fontSize: 36 },
  heroInfo: { flex: 1, gap: 4 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  heroName: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  badge: {
    backgroundColor: COLORS.primaryDim, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: COLORS.primaryBorder,
  },
  badgeText: { fontSize: 10, color: COLORS.primary, fontWeight: '700' },
  heroAuthor: { fontSize: 13, color: COLORS.textSecondary },
  heroRating: { fontSize: 13, color: COLORS.textMuted },

  actions: { gap: SPACING.sm },
  actionBtn: {
    borderRadius: RADIUS.md, padding: SPACING.md,
    alignItems: 'center', justifyContent: 'center',
  },
  installBtn: { backgroundColor: COLORS.primary },
  installBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  uninstallBtn: { borderWidth: 1, borderColor: COLORS.error },
  uninstallBtnText: { color: COLORS.error, fontWeight: '600', fontSize: 14 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  toggleLabel: { fontSize: 15, color: COLORS.text, fontWeight: '600' },

  grid: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  gridCell: { flex: 1, padding: SPACING.md, alignItems: 'center', gap: 4 },
  gridLabel: { fontSize: 11, color: COLORS.textMuted },
  gridValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },

  section: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.sm,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  body: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },

  permRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  permIcon: { fontSize: 18, width: 28 },
  permText: { fontSize: 13, color: COLORS.text, textTransform: 'capitalize' },

  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  tagText: { fontSize: 12, color: COLORS.textSecondary },

  changeEntry: { gap: 2 },
  changeVersion: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  changeNotes: { fontSize: 13, color: COLORS.textSecondary },

  adultBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(255,60,60,0.08)', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: 'rgba(255,60,60,0.3)', padding: SPACING.md,
  },
  adultBannerIcon: { fontSize: 20, marginTop: 1 },
  adultBannerText: { flex: 1, fontSize: 12, color: '#ff6b6b', lineHeight: 18 },
});
