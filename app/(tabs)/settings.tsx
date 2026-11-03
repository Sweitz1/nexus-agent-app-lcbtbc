import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import {
  User,
  Bell,
  Shield,
  ChevronRight,
  Trash2,
  LogOut,
  Key,
  GitBranch,
  Activity,
  Zap,
  LucideProps,
} from 'lucide-react-native';

const UserIcon = withStrippedProps(User);
const BellIcon = withStrippedProps(Bell);
const ShieldIcon = withStrippedProps(Shield);
const ChevronRightIcon = withStrippedProps(ChevronRight);
const Trash2Icon = withStrippedProps(Trash2);
const LogOutIcon = withStrippedProps(LogOut);
const KeyIcon = withStrippedProps(Key);
const GitBranchIcon = withStrippedProps(GitBranch);
const ActivityIcon = withStrippedProps(Activity);
const ZapIcon = withStrippedProps(Zap);

interface SettingsRowProps {
  icon: React.ComponentType<LucideProps>;
  iconColor?: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
}

function SettingsRow({ icon: Icon, iconColor, label, sublabel, onPress, destructive }: SettingsRowProps) {
  const color = destructive ? COLORS.destructive : (iconColor ?? COLORS.primary);
  const textColor = destructive ? COLORS.destructive : COLORS.text;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, { backgroundColor: color + '22' }]}>
        <Icon size={18} color={color} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: textColor }]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      <ChevronRightIcon size={16} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleSignOutPress = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => {} },
    ]);
  };

  const handleDeleteAccountPress = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {} },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <TouchableOpacity style={styles.profileCard} activeOpacity={0.8}>
          <View style={styles.avatar}>
            <UserIcon size={28} color={COLORS.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Nexus User</Text>
            <Text style={styles.profileEmail}>user@nexusagent.ai</Text>
          </View>
          <ChevronRightIcon size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* Agent Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Agent</Text>
          <View style={styles.card}>
            <SettingsRow
              icon={KeyIcon}
              iconColor='#cc88ff'
              label="Model Providers"
              sublabel="OpenAI, Anthropic, Google, custom"
              onPress={() => router.push('/providers')}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon={ShieldIcon}
              iconColor='#00ccff'
              label="Tool Permissions"
              sublabel="Control what tools the agent can use"
              onPress={() => router.push('/permissions')}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon={ZapIcon}
              iconColor='#ffaa00'
              label="Custom APIs"
              sublabel="Add your own REST APIs as agent tools"
              onPress={() => router.push('/custom-apis')}
            />
          </View>
        </View>

        {/* Integrations */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Integrations</Text>
          <View style={styles.card}>
            <SettingsRow
              icon={GitBranchIcon}
              iconColor={COLORS.text}
              label="GitHub"
              sublabel="Connect your GitHub account"
              onPress={() => router.push('/github')}
            />
          </View>
        </View>

        {/* Monitoring */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Monitoring</Text>
          <View style={styles.card}>
            <SettingsRow
              icon={ActivityIcon}
              iconColor={COLORS.primary}
              label="Activity Logs"
              sublabel="View agent execution history"
              onPress={() => router.push('/logs')}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon={BellIcon}
              iconColor={COLORS.primary}
              label="Notifications"
              sublabel="Manage push notification preferences"
              onPress={() => router.push('/notification-preferences')}
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: COLORS.destructive }]}>Danger Zone</Text>
          <View style={[styles.card, styles.dangerCard]}>
            <SettingsRow
              icon={LogOutIcon}
              label="Sign Out"
              onPress={handleSignOutPress}
              destructive
            />
            <View style={styles.divider} />
            <SettingsRow
              icon={Trash2Icon}
              label="Delete Account"
              sublabel="Permanently delete all data"
              onPress={handleDeleteAccountPress}
              destructive
            />
          </View>
        </View>

        <Text style={styles.version}>Nexus Agent v1.0.0</Text>
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
  },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  content: { padding: SPACING.md, gap: SPACING.lg, paddingBottom: SPACING.xl },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    gap: SPACING.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primaryDim,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  profileEmail: { fontSize: 13, color: COLORS.textSecondary },
  section: { gap: SPACING.xs },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  dangerCard: { borderColor: COLORS.destructive + '33' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContent: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSublabel: { fontSize: 12, color: COLORS.textSecondary },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.md + 36 + SPACING.sm,
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
});
