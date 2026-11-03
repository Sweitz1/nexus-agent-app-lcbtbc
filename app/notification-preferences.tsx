import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import { useNotifications } from '@/contexts/NotificationContext';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { Bell, BellOff, ExternalLink } from 'lucide-react-native';

const BellIcon = withStrippedProps(Bell);
const BellOffIcon = withStrippedProps(BellOff);
const ExternalLinkIcon = withStrippedProps(ExternalLink);

const NOTIFICATION_CATEGORIES = [
  {
    key: 'task_updates',
    label: 'Task Updates',
    description: 'Agent progress, completions, and failures',
    defaultEnabled: true,
  },
  {
    key: 'approvals',
    label: 'Approval Requests',
    description: 'When the agent needs your approval to proceed',
    defaultEnabled: true,
  },
  {
    key: 'memory',
    label: 'Memory Alerts',
    description: 'New memories stored or conflicts detected',
    defaultEnabled: false,
  },
  {
    key: 'system',
    label: 'System Notifications',
    description: 'App updates and important announcements',
    defaultEnabled: true,
  },
];

export default function NotificationPreferencesScreen() {
  const { hasPermission, permissionDenied, isWeb, requestPermission, sendTag, deleteTag } =
    useNotifications();

  const [categories, setCategories] = useState<Record<string, boolean>>(
    Object.fromEntries(
      NOTIFICATION_CATEGORIES.map((cat) => [cat.key, cat.defaultEnabled])
    )
  );

  const handleEnableNotifications = async () => {
    console.log('[NotificationPreferences] Enable notifications pressed');
    if (permissionDenied) {
      Alert.alert(
        'Notifications Disabled',
        'To receive notifications, please enable them in your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              console.log('[NotificationPreferences] Opening device settings');
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
      return;
    }
    const granted = await requestPermission();
    console.log('[NotificationPreferences] Permission request result:', granted);
  };

  const handleCategoryToggle = (key: string, value: boolean) => {
    console.log('[NotificationPreferences] Category toggled:', key, value);
    setCategories((prev) => ({ ...prev, [key]: value }));
    if (value) {
      sendTag(`notify_${key}`, 'true');
    } else {
      deleteTag(`notify_${key}`);
    }
  };

  if (isWeb) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <BellOffIcon size={48} color={COLORS.textMuted} />
          <Text style={styles.webMessage}>
            Push notifications are available in the mobile app.
          </Text>
        </View>
      </View>
    );
  }

  const PermissionIcon = hasPermission ? BellIcon : BellOffIcon;
  const permissionIconColor = hasPermission ? COLORS.primary : COLORS.textSecondary;
  const permissionTitle = hasPermission ? 'Notifications Enabled' : 'Notifications Disabled';
  const permissionDesc = hasPermission
    ? "You'll receive push notifications from Nexus Agent"
    : 'Enable notifications to stay updated on agent activity';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Permission Status Card */}
        <View style={styles.permissionCard}>
          <View style={[styles.permissionIconWrap, { backgroundColor: permissionIconColor + '22' }]}>
            <PermissionIcon size={28} color={permissionIconColor} />
          </View>
          <View style={styles.permissionText}>
            <Text style={styles.permissionTitle}>{permissionTitle}</Text>
            <Text style={styles.permissionDesc}>{permissionDesc}</Text>
          </View>
          {!hasPermission && (
            <TouchableOpacity
              style={styles.enableBtn}
              onPress={handleEnableNotifications}
              activeOpacity={0.8}
            >
              <ExternalLinkIcon size={14} color={COLORS.background} />
              <Text style={styles.enableBtnText}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Notification Categories */}
        {hasPermission && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Notification Types</Text>
            <View style={styles.card}>
              {NOTIFICATION_CATEGORIES.map((category, index) => {
                const isEnabled = categories[category.key] ?? false;
                const isLast = index === NOTIFICATION_CATEGORIES.length - 1;
                return (
                  <View key={category.key}>
                    <View style={styles.categoryRow}>
                      <View style={styles.categoryText}>
                        <Text style={styles.categoryLabel}>{category.label}</Text>
                        <Text style={styles.categoryDesc}>{category.description}</Text>
                      </View>
                      <Switch
                        value={isEnabled}
                        onValueChange={(value) => handleCategoryToggle(category.key, value)}
                        trackColor={{ false: COLORS.border, true: COLORS.primary + '88' }}
                        thumbColor={isEnabled ? COLORS.primary : COLORS.textMuted}
                        ios_backgroundColor={COLORS.border}
                      />
                    </View>
                    {!isLast && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <Text style={styles.hint}>
          Notifications are delivered via OneSignal. You can change these preferences at any time.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    gap: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.xl,
  },
  webMessage: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  permissionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  permissionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: {
    flex: 1,
    gap: 4,
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  permissionDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  enableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  enableBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.background,
  },
  section: {
    gap: SPACING.xs,
  },
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
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  categoryText: {
    flex: 1,
    gap: 2,
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  categoryDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
