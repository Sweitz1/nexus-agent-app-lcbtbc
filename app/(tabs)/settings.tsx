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
  HelpCircle,
  ChevronRight,
  Trash2,
  LogOut,
  Key,
  LucideProps,
} from 'lucide-react-native';

const UserIcon = withStrippedProps(User);
const BellIcon = withStrippedProps(Bell);
const ShieldIcon = withStrippedProps(Shield);
const HelpCircleIcon = withStrippedProps(HelpCircle);
const ChevronRightIcon = withStrippedProps(ChevronRight);
const Trash2Icon = withStrippedProps(Trash2);
const LogOutIcon = withStrippedProps(LogOut);
const KeyIcon = withStrippedProps(Key);

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

  const handleProfilePress = () => {
    console.log('[Settings] Profile pressed');
  };

  const handleApiKeysPress = () => {
    console.log('[Settings] API Keys pressed');
  };

  const handlePrivacyPress = () => {
    console.log('[Settings] Privacy & Security pressed');
  };

  const handleHelpPress = () => {
    console.log('[Settings] Help & Support pressed');
  };

  const handleNotificationsPress = () => {
    console.log('[Settings] Notifications pressed — navigating to notification-preferences');
    router.push('/notification-preferences');
  };

  const handleSignOutPress = () => {
    console.log('[Settings] Sign Out pressed');
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => console.log('[Settings] Sign out confirmed'),
      },
    ]);
  };

  const handleDeleteAccountPress = () => {
    console.log('[Settings] Delete Account pressed');
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => console.log('[Settings] Delete account confirmed'),
        },
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
        <TouchableOpacity style={styles.profileCard} onPress={handleProfilePress} activeOpacity={0.8}>
          <View style={styles.avatar}>
            <UserIcon size={28} color={COLORS.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Nexus User</Text>
            <Text style={styles.profileEmail}>user@nexusagent.ai</Text>
          </View>
          <ChevronRightIcon size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* Settings Rows */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.card}>
            <SettingsRow
              icon={KeyIcon}
              iconColor='#cc88ff'
              label="API Keys"
              sublabel="Manage your API credentials"
              onPress={handleApiKeysPress}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon={ShieldIcon}
              iconColor='#00ccff'
              label="Privacy & Security"
              onPress={handlePrivacyPress}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon={HelpCircleIcon}
              iconColor='#ffaa00'
              label="Help & Support"
              onPress={handleHelpPress}
            />
          </View>
        </View>

        {/* Notifications Row */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notifications</Text>
          <View style={styles.card}>
            <SettingsRow
              icon={BellIcon}
              iconColor={COLORS.primary}
              label="Notifications"
              sublabel="Manage push notification preferences"
              onPress={handleNotificationsPress}
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
  dangerCard: {
    borderColor: COLORS.destructive + '33',
  },
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
