import React from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { useNotifications } from '@/contexts/NotificationContext';
import { withStrippedProps } from '@/utils/stripDevProps';
import { Bell, BellOff } from 'lucide-react-native';
import { COLORS, RADIUS } from '@/constants/theme';

const BellIcon = withStrippedProps(Bell);
const BellOffIcon = withStrippedProps(BellOff);

interface NotificationBellProps {
  variant?: 'default' | 'compact';
  size?: number;
}

export function NotificationBell({ variant = 'default', size = 24 }: NotificationBellProps) {
  const { hasPermission, permissionDenied, loading, isWeb, requestPermission } =
    useNotifications();

  if (loading || isWeb) return null;

  const handlePress = async () => {
    console.log('[NotificationBell] Bell pressed — hasPermission:', hasPermission, 'permissionDenied:', permissionDenied);

    if (hasPermission) {
      return;
    }

    if (permissionDenied) {
      Alert.alert(
        'Notifications Disabled',
        'To receive notifications, please enable them in your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              console.log('[NotificationBell] Opening device settings');
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

    console.log('[NotificationBell] Requesting notification permission');
    const granted = await requestPermission();
    console.log('[NotificationBell] Permission granted:', granted);
  };

  const iconColor = hasPermission ? COLORS.primary : COLORS.textSecondary;
  const IconComponent = hasPermission ? BellIcon : BellOffIcon;

  if (variant === 'compact') {
    return (
      <TouchableOpacity onPress={handlePress} style={styles.compactButton} activeOpacity={0.7}>
        <IconComponent size={size} color={iconColor} />
        {!hasPermission && <View style={styles.badge} />}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} style={styles.button} activeOpacity={0.7}>
      <View style={styles.bellContainer}>
        <IconComponent size={size} color={iconColor} />
        {!hasPermission && <View style={styles.badge} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  compactButton: {
    padding: 6,
  },
  bellContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.error,
    borderRadius: 5,
    width: 8,
    height: 8,
    borderWidth: 1.5,
    borderColor: COLORS.background,
  },
});

export default NotificationBell;
