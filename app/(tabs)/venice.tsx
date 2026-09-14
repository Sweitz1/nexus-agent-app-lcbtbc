import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  SafeAreaView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import {
  getConfig, listModels, streamChat, makeMessage,
  VeniceConfig, VeniceModel, Message,
} from '@/utils/veniceApi';

export default function VeniceScreen() {
  const [config, setConfig]   = useState<VeniceConfig | null>(null);
  const [models, setModels]   = useState<VeniceModel[]>([]);
  const [model, setModel]     = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    const cfg = await getConfig();
    setConfig(cfg);
    if (cfg.serverUrl && cfg.apiKey) {
      fetchModels(cfg);
    }
  }

  async function fetchModels(cfg: VeniceConfig) {
    setLoadingModels(true);
    try {
      const list = await listModels(cfg);
      setModels(list);
      if (list.length > 0 && !model) setModel(list[0].id);
    } catch (e: any) {
      Alert.alert('Connection Error', e.message || 'Could not reach Venice server');
    } finally {
      setLoadingModels(false);
    }
  }

  async function send() {
    if (!input.trim() || streaming || !config || !model) return;

    const userMsg = makeMessage('user', input.trim());
    const assistantMsg = makeMessage('assistant', '');

    setHistory(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      let full = '';
      for await (const delta of streamChat(config, model, history, userMsg.content)) {
        full += delta;
        setHistory(prev =>
          prev.map(m => m.id === assistantMsg.id ? { ...m, content: full } : m)
        );
        listRef.current?.scrollToEnd({ animated: false });
      }
    } catch (e: any) {
      setHistory(prev =>
        prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: `Error: ${e.message}` }
            : m
        )
      );
    } finally {
      setStreaming(false);
    }
  }

  function clearChat() {
    Alert.alert('Clear Chat', 'Delete this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => setHistory([]) },
    ]);
  }

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        <View style={[styles.avatar, isUser ? styles.avatarUser : styles.avatarAI]}>
          <Text style={[styles.avatarText, isUser && styles.avatarTextUser]}>
            {isUser ? 'You' : 'V'}
          </Text>
        </View>
        <View style={[styles.bubble, isUser && styles.bubbleUser]}>
          {item.content ? (
            <Text style={styles.bubbleText} selectable>{item.content}</Text>
          ) : (
            <View style={styles.thinkingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.thinking}> Thinking…</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, []);

  if (!config) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const needsSetup = !config.serverUrl || !config.apiKey;

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Venice</Text>
          <Text style={styles.headerSub}>Private AI</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Model picker trigger */}
          <TouchableOpacity
            style={styles.modelBtn}
            onPress={() => setShowModelPicker(v => !v)}
            disabled={models.length === 0}
          >
            {loadingModels ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.modelBtnText} numberOfLines={1}>
                {model || 'No model'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={clearChat}>
            <Text style={styles.iconBtnText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/venice-settings')}
          >
            <Text style={styles.iconBtnText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Model picker dropdown */}
      {showModelPicker && (
        <View style={styles.picker}>
          {models.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[styles.pickerItem, m.id === model && styles.pickerItemActive]}
              onPress={() => { setModel(m.id); setShowModelPicker(false); }}
            >
              <Text style={[styles.pickerText, m.id === model && styles.pickerTextActive]}>
                {m.id}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Setup prompt */}
      {needsSetup && (
        <View style={styles.setupBanner}>
          <Text style={styles.setupText}>
            Connect to your Venice server to start chatting.
          </Text>
          <TouchableOpacity
            style={styles.setupBtn}
            onPress={() => router.push('/venice-settings')}
          >
            <Text style={styles.setupBtnText}>Configure Server</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chat */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {history.length === 0 && !needsSetup ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔒</Text>
            <Text style={styles.emptyTitle}>Private & Uncensored</Text>
            <Text style={styles.emptyBody}>
              Your conversations run on your own server.{'\n'}No logs. No cloud. No filters.
            </Text>
            <Text style={styles.emptyModel}>Model: {model || '—'}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={history}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Venice…"
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={4000}
            onSubmitEditing={send}
            editable={!streaming && !needsSetup}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (streaming || !input.trim() || needsSetup) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={streaming || !input.trim() || needsSetup}
          >
            {streaming ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  headerSub: { fontSize: 11, color: COLORS.textMuted },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modelBtn: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 6,
    maxWidth: 160,
  },
  modelBtnText: { color: COLORS.text, fontSize: 12 },
  iconBtn: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 6,
  },
  iconBtnText: { color: COLORS.textSecondary, fontSize: 12 },

  // Model picker
  picker: {
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    maxHeight: 200,
  },
  pickerItem: { padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerItemActive: { backgroundColor: COLORS.primaryDim },
  pickerText: { color: COLORS.text, fontSize: 13 },
  pickerTextActive: { color: COLORS.primary, fontWeight: '600' },

  // Setup banner
  setupBanner: {
    margin: SPACING.md, padding: SPACING.md,
    backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.primaryBorder,
    alignItems: 'center', gap: SPACING.sm,
  },
  setupText: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center' },
  setupBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  setupBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyIcon: { fontSize: 40, marginBottom: SPACING.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  emptyBody: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyModel: { marginTop: SPACING.lg, color: COLORS.textMuted, fontSize: 12 },

  // Chat
  chatList: { padding: SPACING.md, gap: SPACING.sm },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  msgRowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarAI: { backgroundColor: COLORS.primary },
  avatarUser: { backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border },
  avatarText: { color: '#000', fontWeight: '700', fontSize: 12 },
  avatarTextUser: { color: COLORS.textSecondary },
  bubble: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.sm + 2, maxWidth: '90%',
  },
  bubbleUser: { backgroundColor: COLORS.surfaceElevated },
  bubbleText: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center' },
  thinking: { color: COLORS.textMuted, fontSize: 13, fontStyle: 'italic' },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: SPACING.md, backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1, backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    color: COLORS.text, fontSize: 14, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, maxHeight: 120,
  },
  sendBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
    minWidth: 60, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
});
