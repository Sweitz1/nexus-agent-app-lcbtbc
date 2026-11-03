import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { withStrippedProps } from '@/utils/stripDevProps';
import { github } from '@/utils/api';
import { ArrowLeft, GitBranch, CheckCircle2, XCircle, LinkIcon } from 'lucide-react-native';

const ArrowLeftIcon = withStrippedProps(ArrowLeft);
const GitBranchIcon = withStrippedProps(GitBranch);
const CheckCircle2Icon = withStrippedProps(CheckCircle2);
const XCircleIcon = withStrippedProps(XCircle);
const LinkIcon2 = withStrippedProps(LinkIcon);

export default function GitHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [pat, setPat] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [cloneResult, setCloneResult] = useState<Array<{ path: string; type: string }> | null>(null);
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    github.status().then((s) => {
      setConnected(s.connected);
      setUsername(s.username || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleConnect = async () => {
    if (!pat.trim()) {
      Alert.alert('Required', 'Enter your GitHub Personal Access Token');
      return;
    }
    setConnecting(true);
    try {
      const result = await github.connect(pat.trim());
      setConnected(true);
      setUsername(result.username);
      setPat('');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
    setConnecting(false);
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect GitHub', 'Remove your GitHub access token?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setDisconnecting(true);
          try {
            await github.disconnect();
            setConnected(false);
            setUsername('');
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
          setDisconnecting(false);
        },
      },
    ]);
  };

  const handleClone = async () => {
    if (!repoOwner.trim() || !repoName.trim()) {
      Alert.alert('Required', 'Enter owner and repository name');
      return;
    }
    setCloning(true);
    try {
      const result = await github.clone(repoOwner.trim(), repoName.trim());
      setCloneResult(result.files);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
    setCloning(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeftIcon size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>GitHub</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Connection status */}
        <View style={[styles.statusCard, { borderColor: connected ? COLORS.primaryBorder : COLORS.border }]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: connected ? COLORS.primary : COLORS.textMuted }]} />
            <Text style={styles.statusLabel}>{connected ? 'Connected' : 'Not connected'}</Text>
            {connected && <CheckCircle2Icon size={16} color={COLORS.primary} />}
          </View>
          {connected && username && (
            <View style={styles.userRow}>
              <GitBranchIcon size={14} color={COLORS.textSecondary} />
              <Text style={styles.username}>@{username}</Text>
            </View>
          )}
        </View>

        {!connected ? (
          <View style={styles.connectCard}>
            <Text style={styles.connectTitle}>Connect GitHub Account</Text>
            <Text style={styles.connectDesc}>
              Create a Personal Access Token with repo permissions at GitHub Settings → Developer settings → Personal access tokens
            </Text>
            <View style={styles.field}>
              <Text style={styles.label}>Personal Access Token</Text>
              <TextInput
                style={styles.input}
                value={pat}
                onChangeText={setPat}
                placeholder="ghp_..."
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity
              style={[styles.connectBtn, connecting && styles.btnDisabled]}
              onPress={handleConnect}
              disabled={connecting}
              activeOpacity={0.8}
            >
              {connecting
                ? <ActivityIndicator color={COLORS.background} />
                : <><LinkIcon2 size={16} color={COLORS.background} /><Text style={styles.connectBtnText}>Connect</Text></>
              }
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Repo browser */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Browse Repository</Text>
              <View style={styles.repoRow}>
                <TextInput
                  style={[styles.input, styles.repoInput]}
                  value={repoOwner}
                  onChangeText={setRepoOwner}
                  placeholder="owner"
                  placeholderTextColor={COLORS.textMuted}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                <Text style={styles.slash}>/</Text>
                <TextInput
                  style={[styles.input, styles.repoInput]}
                  value={repoName}
                  onChangeText={setRepoName}
                  placeholder="repo"
                  placeholderTextColor={COLORS.textMuted}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              <TouchableOpacity
                style={[styles.cloneBtn, cloning && styles.btnDisabled]}
                onPress={handleClone}
                disabled={cloning}
                activeOpacity={0.8}
              >
                {cloning
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Text style={styles.cloneBtnText}>Browse File Tree</Text>
                }
              </TouchableOpacity>
            </View>

            {cloneResult && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{cloneResult.length} files</Text>
                <View style={styles.fileList}>
                  {cloneResult.slice(0, 50).map((f) => (
                    <View key={f.path} style={styles.fileRow}>
                      <Text style={styles.fileType}>{f.type === 'tree' ? '📁' : '📄'}</Text>
                      <Text style={styles.filePath} numberOfLines={1}>{f.path}</Text>
                    </View>
                  ))}
                  {cloneResult.length > 50 && (
                    <Text style={styles.moreText}>+{cloneResult.length - 50} more files</Text>
                  )}
                </View>
              </View>
            )}

            {/* Disconnect */}
            <TouchableOpacity
              style={[styles.disconnectBtn, disconnecting && styles.btnDisabled]}
              onPress={handleDisconnect}
              disabled={disconnecting}
              activeOpacity={0.8}
            >
              {disconnecting
                ? <ActivityIndicator size="small" color={COLORS.error} />
                : <><XCircleIcon size={16} color={COLORS.error} /><Text style={styles.disconnectBtnText}>Disconnect GitHub</Text></>
              }
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: COLORS.text },
  content: { padding: SPACING.md, gap: SPACING.md, paddingBottom: SPACING.xxl },
  statusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    gap: SPACING.xs,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginLeft: SPACING.md },
  username: { fontSize: 13, color: COLORS.textSecondary },
  connectCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  connectTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  connectDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  field: { gap: SPACING.xs },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 14,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    minHeight: 48,
  },
  connectBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.background },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  repoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  repoInput: { flex: 1 },
  slash: { fontSize: 18, color: COLORS.textMuted, fontWeight: '300' },
  cloneBtn: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  cloneBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  fileList: { gap: 2 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 3 },
  fileType: { fontSize: 12 },
  filePath: { flex: 1, fontSize: 12, color: COLORS.text, fontFamily: 'SpaceMono' },
  moreText: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', paddingTop: SPACING.xs },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.error + '44',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.error + '11',
    minHeight: 48,
  },
  disconnectBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.error },
  btnDisabled: { opacity: 0.6 },
});
