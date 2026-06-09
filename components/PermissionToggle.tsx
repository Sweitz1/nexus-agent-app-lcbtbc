import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/theme';

interface PermissionToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
}

export function PermissionToggle({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: PermissionToggleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textGroup}>
        <Text style={styles.label}>{label}</Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: COLORS.surfaceTertiary, true: COLORS.primaryMuted }}
        thumbColor={value ? COLORS.primary : COLORS.textTertiary}
        ios_backgroundColor={COLORS.surfaceTertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  textGroup: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  description: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
});
