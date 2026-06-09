import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost, apiDelete } from '@/utils/api';
import { COLORS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Github as RawGithub, CheckCircle as RawCheckCircle, XCircle as RawXCircle } from 'lucide-react-native';
import { withStrippedProps } from '@/utils/stripDevProps';

const Github = withStrippedProps(RawGithub);
const CheckCircle = withStrippedProps(RawCheckCircle);
const XCircle = withStrippedProps(RawXCircle);

interface GitHubStatus {
  connected: boolean;
  username?: string;
}

export default function GitHubScreen() {
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pat, setPat] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    console.log('[GitHub] Fetching GitHub status');
    try {
      const res = await apiGet<GitHubStatus>('/api/github/status');
      setStatus(res);
      setError('');
    } catch (err) {
      console.error('[GitHub] Fetch error:', err);
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async () => {
    if (!pat.trim()) {
      setError('Please enter a Personal Access Token.');
      return;
    }
    setConnecting(true);
    setError('');
    console.log('[GitHub] Connect pressed');
    try {
      await apiPost('/api/github/connect', { token: pat.trim() });
      setPat('');
      await fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect GitHub.';
      setError(msg);
      console.error('[GitHub] Connect error:', msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    console.log('[GitHub] Disconnect pressed');
    try {
      await apiDelete('/api/github/disconnect');
      await fetchStatus();
    } catch (err) {
      console.error('[GitHub] Disconnect error:', err);
      setError('Failed to disconnect.');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
    >
      {/* Status card */}
      <View style={styles.statusCard}>
        <Github size={28} color={status?.connected ? COLORS.primary : COLORS.textSecondary} />
        <View style={styles.statusInfo}>
          <Text style={styles.statusTitle}>
            {status?.connected ? 'Connected' : 'Not connected'}
          </Text>
          {status?.connected && status.username ? (
            <Text style={styles.statusUsername}>@{status.username}</Text>
          ) : (
            <Text style={styles.statusDesc}>Connect your GitHub account to let the agent read and write code.</Text>
          )}
        </View>
        {status?.connected ? (
          <CheckCircle size={20} color={COLORS.success} />
        ) : (
          <XCircle size={20} color={COLORS.textTertiary} />
        )}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {status?.connected ? (
        <AnimatedPressable
          style={[styles.disconnectBtn, disconnecting && { opacity: 0.6 }]}
          onPress={handleDisconnect}
          disabled={disconnecting}
        >
          {disconnecting ? (
            <ActivityIndicator color={COLORS.danger} size="small" />
          ) : (
            <Text style={styles.disconnectBtnText}>Disconnect GitHub</Text>
          )}
        </AnimatedPressable>
      ) : (
        <View style={styles.connectForm}>
          <Text style={styles.formLabel}>Personal Access Token</Text>
          <TextInput
            style={styles.formInput}
            value={pat}
            onChangeText={setPat}
            placeholder="ghp_..."
            placeholderTextColor={COLORS.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.formHint}>
            Create a token at github.com/settings/tokens with repo and read:user scopes.
          </Text>
          <AnimatedPressable
            style={[styles.connectBtn, connecting && { opacity: 0.6 }]}
            onPress={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color={COLORS.background} size="small" />
            ) : (
              <Text style={styles.connectBtnText}>Connect GitHub</Text>
            )}
          </AnimatedPressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  statusInfo: { flex: 1 },
  statusTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  statusUsername: { fontSize: 13, color: COLORS.primary, marginTop: 2 },
  statusDesc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, lineHeight: 18 },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  errorText: { color: COLORS.danger, fontSize: 13 },
  connectForm: { gap: 12 },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  formInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formHint: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  connectBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  connectBtnText: { color: COLORS.background, fontSize: 15, fontWeight: '800' },
  disconnectBtn: {
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  disconnectBtnText: { color: COLORS.danger, fontSize: 15, fontWeight: '700' },
});
