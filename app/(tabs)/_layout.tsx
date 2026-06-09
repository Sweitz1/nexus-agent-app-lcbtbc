import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/theme';
import { LayoutDashboard, PlusCircle, ListTodo, Brain, Settings, LucideProps } from 'lucide-react-native';

/**
 * Strips __-prefixed dev/editor metadata props (e.g. __dataContext, __contentSource,
 * __sourceLocation) injected by React's dev mode and the visual editor before they
 * reach SVG DOM elements on web and trigger "React does not recognize prop" warnings.
 */
function SafeIcon(Icon: React.ComponentType<LucideProps>) {
  return function StrippedIcon({ size, color, ...rest }: LucideProps & Record<string, unknown>) {
    const cleanRest = Object.fromEntries(
      Object.entries(rest).filter(([key]) => !key.startsWith('__'))
    ) as LucideProps;
    return <Icon size={size} color={color} {...cleanRest} />;
  };
}

const SafeLayoutDashboard = SafeIcon(LayoutDashboard);
const SafePlusCircle = SafeIcon(PlusCircle);
const SafeListTodo = SafeIcon(ListTodo);
const SafeBrain = SafeIcon(Brain);
const SafeSettings = SafeIcon(Settings);

const TABS = [
  { name: '(home)', label: 'Dashboard', Icon: LayoutDashboard },
  { name: 'new-task', label: 'New Task', Icon: PlusCircle },
  { name: 'tasks', label: 'Tasks', Icon: ListTodo },
  { name: 'memory', label: 'Memory', Icon: Brain },
  { name: 'settings', label: 'Settings', Icon: Settings },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textTertiary,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <SafeLayoutDashboard size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="new-task"
        options={{
          title: 'New Task',
          tabBarIcon: ({ color, size }) => <SafePlusCircle size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => <SafeListTodo size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="memory"
        options={{
          title: 'Memory',
          tabBarIcon: ({ color, size }) => <SafeBrain size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <SafeSettings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
