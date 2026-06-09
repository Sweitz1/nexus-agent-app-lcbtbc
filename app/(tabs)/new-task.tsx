import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { Zap } from 'lucide-react-native';

const ZapIcon = withStrippedProps(Zap);

export default function NewTaskScreen() {
  const insets = useSafeAreaInsets();
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');

  const handleSubmit = () => {
    console.log('[NewTask] Submit task pressed:', { title: taskTitle, description: taskDescription });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>New Task</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.field}>
          <Text style={styles.label}>Task Title</Text>
          <TextInput
            style={styles.input}
            value={taskTitle}
            onChangeText={setTaskTitle}
            placeholder="What should the agent do?"
            placeholderTextColor={COLORS.textMuted}
            onFocus={() => console.log('[NewTask] Title input focused')}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={taskDescription}
            onChangeText={setTaskDescription}
            placeholder="Provide more context..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={4}
            onFocus={() => console.log('[NewTask] Description input focused')}
          />
        </View>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.8}>
          <ZapIcon size={18} color={COLORS.background} />
          <Text style={styles.submitText}>Run Agent</Text>
        </TouchableOpacity>
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
  content: { padding: SPACING.md, gap: SPACING.lg },
  field: { gap: SPACING.xs },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  submitText: { fontSize: 16, fontWeight: '700', color: COLORS.background },
});
