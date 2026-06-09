import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { COLORS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { withStrippedProps } from '@/utils/stripDevProps';
import {
  Key as RawKey,
  Globe as RawGlobe,
  Github as RawGithub,
  Shield as RawShield,
  AlertTriangle as RawAlertTriangle,
  Activity as RawActivity,
  FileText as RawFileText,
  ChevronRight as RawChevronRight,
  LogOut as RawLogOut,
  User as RawUser,
} from 'lucide-react-native';
import Constants from 'expo-constants';

const Key = withStrippedProps(RawKey);
const Globe = withStrippedProps(RawGlobe);
const Github = withStrippedProps(RawGithub);
const Shield = withStrippedProps(RawShield);
const AlertTriangle = withStrippedProps(RawAlertTriangle);
const Activity = withStrippedProps(RawActivity);
const FileText = withStrippedProps(RawFileText);
const ChevronRight = withStrippedProps(RawChevronRight);
const LogOut = withStrippedProps(RawLogOut);
const User = withStrippedProps(RawUser);

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

interface SettingsLink {
  label: string;
  description: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  route: string;
  color: string;
}

const SETTINGS_LINKS: SettingsLink[] = [
  {
    label: 'API Keys',
    description: 'Manage model providers',
    icon: Key,
    route: '/settings/api-keys',
    color: COLORS.primary,
  },
  {
    label: 'Custom APIs',
    description: 'Configure external REST APIs',
    icon: Globe,
    route: '/settings/custom-apis',
    color: COLORS.info,
  },
  {
    label: 'GitHub',
    description: 'Connect your GitHub account',
    icon: Github,
    route: '/settings/github',
    color: COLORS.text,
  },
  {
    label: 'Permissions',
    description: 'Control what the agent can do',
    icon: Shield,
    route: '/settings/permissions',
    color: COLORS.warning,
  },
  {
    label: 'Safety',
    description: 'Always-confirm rules',
    icon: AlertTriangle,
    route: '/settings/safety',
    color: COLORS.danger,
  },
  {
    label: 'Runtime Status',
    description: 'Available tools and version',
    icon: Activity,
    route: '/settings/runtime',
    color: COLORS.toolResult,
  },
  {
    label: 'Logs',
    description: 'View agent execution logs',
    icon: FileText,
    route: '/settings/logs',
    color: COLORS.textSecondary,
  },
];

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleSignOut = async () => {
    console.log('[Settings] Sign out pressed');
    await signOut();
    router.replace('/auth-screen');
  };

  const userEmail = user?.email || '';
  const userName = user?.name || userEmail.split('@')[0] || 'User';
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 },
      ]}
    >
      <Text style={styles.pageTitle}>Settings</Text>

      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{userInitial}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{userName}</Text>
          <Text style={styles.profileEmail}>{userEmail}</Text>
        </View>
        <AnimatedPressable style={styles.signOutBtn} onPress={handleSignOut}>
          <LogOut size={16} color={COLORS.danger} />
          <Text style={styles.signOutText}>Sign out</Text>
        </AnimatedPressable>
      </View>

      {/* Configuration section */}
      <Text style={styles.sectionLabel}>Configuration</Text>
      <View style={styles.settingsGroup}>
        {SETTINGS_LINKS.map((link, idx) => {
          const { icon: LinkIcon } = link;
          const isLast = idx === SETTINGS_LINKS.length - 1;
          return (
            <AnimatedPressable
              key={link.label}
              style={[styles.settingsRow, !isLast && styles.settingsRowBorder]}
              onPress={() => {
                console.log('[Settings] Nav to:', link.label);
                router.push(link.route as any);
              }}
            >
              <View style={[styles.settingsIconBox, { backgroundColor: `${link.color}18` }]}>
                <LinkIcon size={18} color={link.color} />
              </View>
              <View style={styles.settingsTextGroup}>
                <Text style={styles.settingsLabel}>{link.label}</Text>
                <Text style={styles.settingsDesc}>{link.description}</Text>
              </View>
              <ChevronRight size={16} color={COLORS.textTertiary} />
            </AnimatedPressable>
          );
        })}
      </View>

      {/* App version */}
      <View style={styles.versionRow}>
        <Text style={styles.versionText}>Nexus Agent</Text>
        <Text style={styles.versionNum}>v{APP_VERSION}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 20 },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,255,159,0.3)',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  profileEmail: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.dangerMuted,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.25)',
  },
  signOutText: { fontSize: 12, color: COLORS.danger, fontWeight: '700' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textTertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  settingsGroup: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 28,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  settingsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingsIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsTextGroup: { flex: 1 },
  settingsLabel: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  settingsDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  versionText: { fontSize: 13, color: COLORS.textTertiary },
  versionNum: { fontSize: 13, color: COLORS.textTertiary },
});
