import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { apiGet } from '@/utils/api';
import { COLORS, FONTS, RADIUS } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Zap,
  Database,
  Cpu,
  Plus,
  Key,
  Shield,
  Activity,
  ChevronRight,
  Clock,
} from 'lucide-react-native';

interface Task {
  id: string;
  goal: string;
  status: string;
  model_provider_id?: string;
  created_at: string;
}

interface MemoryItem {
  id: string;
}

interface Provider {
  id: string;
  name: string;
  enabled: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function SkeletonLine({ width, height = 14 }: { width: number | string; height?: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: COLORS.surfaceSecondary,
        },
        typeof width === 'number' ? { width } : { width: width as `${number}%` },
        { opacity },
      ]}
    />
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fetchData = useCallback(async () => {
    console.log('[Dashboard] Fetching dashboard data');
    try {
      const [tasksRes, memoryRes, providersRes] = await Promise.all([
        apiGet<Task[]>('/api/tasks').catch(() => [] as Task[]),
        apiGet<MemoryItem[]>('/api/memory').catch(() => [] as MemoryItem[]),
        apiGet<Provider[]>('/api/providers').catch(() => [] as Provider[]),
      ]);
      setTasks(Array.isArray(tasksRes) ? tasksRes : []);
      setMemoryCount(Array.isArray(memoryRes) ? memoryRes.length : 0);
      setProviders(Array.isArray(providersRes) ? providersRes : []);
      setError('');
    } catch (err) {
      console.error('[Dashboard] Fetch error:', err);
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }
  }, [loading]);

  const onRefresh = useCallback(() => {
    console.log('[Dashboard] Pull to refresh');
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'planning');
  const recentTasks = tasks.slice(0, 5);
  const connectedProviders = providers.filter(p => p.enabled);

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'Agent';

  const statCards = [
    {
      label: 'Active Tasks',
      value: activeTasks.length,
      Icon: Zap,
      color: COLORS.primary,
      bg: COLORS.primaryMuted,
    },
    {
      label: 'Memory Items',
      value: memoryCount,
      Icon: Database,
      color: COLORS.info,
      bg: COLORS.infoMuted,
    },
    {
      label: 'Providers',
      value: connectedProviders.length,
      Icon: Cpu,
      color: COLORS.warning,
      bg: 'rgba(255,184,0,0.12)',
    },
  ];

  const quickLinks = [
    { label: 'API Keys', icon: Key, route: '/settings/api-keys' as const },
    { label: 'Permissions', icon: Shield, route: '/settings/permissions' as const },
    { label: 'Runtime', icon: Activity, route: '/settings/runtime' as const },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: COLORS.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {firstName}</Text>
          <Text style={styles.subtitle}>What should the agent do today?</Text>
        </View>
        <View style={styles.statusDot} />
      </View>

      {/* CTA */}
      <AnimatedPressable
        style={styles.ctaBtn}
        onPress={() => {
          console.log('[Dashboard] Start New Task pressed');
          router.push('/(tabs)/new-task');
        }}
      >
        <Plus size={20} color={COLORS.background} />
        <Text style={styles.ctaBtnText}>Start New Task</Text>
      </AnimatedPressable>

      {/* Stat cards */}
      <View style={styles.statsRow}>
        {loading
          ? [0, 1, 2].map(i => (
              <View key={i} style={styles.statCard}>
                <SkeletonLine width={32} height={32} />
                <SkeletonLine width={24} height={20} />
                <SkeletonLine width={60} height={11} />
              </View>
            ))
          : statCards.map(card => {
              const { Icon } = card;
              return (
                <Animated.View key={card.label} style={[styles.statCard, { opacity: fadeAnim }]}>
                  <View style={[styles.statIconBox, { backgroundColor: card.bg }]}>
                    <Icon size={18} color={card.color} />
                  </View>
                  <Text style={styles.statValue}>{card.value}</Text>
                  <Text style={styles.statLabel}>{card.label}</Text>
                </Animated.View>
              );
            })}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Recent Tasks */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Tasks</Text>
          <AnimatedPressable
            onPress={() => {
              console.log('[Dashboard] View all tasks pressed');
              router.push('/(tabs)/tasks');
            }}
          >
            <Text style={styles.sectionLink}>View all</Text>
          </AnimatedPressable>
        </View>

        {loading ? (
          [0, 1, 2].map(i => (
            <View key={i} style={[styles.taskRow, { gap: 8 }]}>
              <SkeletonLine width="70%" height={14} />
              <SkeletonLine width={60} height={22} />
            </View>
          ))
        ) : recentTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No tasks yet. Start your first task above.</Text>
          </View>
        ) : (
          recentTasks.map((task, idx) => {
            const relTime = formatRelativeTime(task.created_at);
            return (
              <AnimatedPressable
                key={task.id}
                style={styles.taskRow}
                onPress={() => {
                  console.log('[Dashboard] Task row pressed:', task.id);
                  router.push(`/task/${task.id}`);
                }}
              >
                <View style={styles.taskRowLeft}>
                  <Text style={styles.taskGoal} numberOfLines={1}>{task.goal}</Text>
                  <View style={styles.taskMeta}>
                    <Clock size={11} color={COLORS.textTertiary} />
                    <Text style={styles.taskTime}>{relTime}</Text>
                  </View>
                </View>
                <View style={styles.taskRowRight}>
                  <StatusBadge status={task.status} size="sm" />
                  <ChevronRight size={14} color={COLORS.textTertiary} />
                </View>
              </AnimatedPressable>
            );
          })
        )}
      </View>

      {/* Quick Links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.quickLinksGrid}>
          {quickLinks.map(link => {
            const { icon: LinkIcon } = link;
            return (
              <AnimatedPressable
                key={link.label}
                style={styles.quickLinkCard}
                onPress={() => {
                  console.log('[Dashboard] Quick link pressed:', link.label);
                  router.push(link.route);
                }}
              >
                <LinkIcon size={20} color={COLORS.primary} />
                <Text style={styles.quickLinkLabel}>{link.label}</Text>
              </AnimatedPressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontFamily: FONTS.mono,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    marginTop: 8,
    boxShadow: `0 0 8px ${COLORS.primary}`,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    marginBottom: 24,
  },
  ctaBtnText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    fontFamily: FONTS.mono,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  errorText: { color: COLORS.danger, fontSize: 13 },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  sectionLink: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  taskRowLeft: { flex: 1, marginRight: 10 },
  taskGoal: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  taskTime: { fontSize: 11, color: COLORS.textTertiary },
  taskRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  quickLinksGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  quickLinkCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickLinkLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
});
