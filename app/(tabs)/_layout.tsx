import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/theme';
import {
  LayoutDashboard as RawLayoutDashboard,
  PlusCircle as RawPlusCircle,
  ListTodo as RawListTodo,
  Brain as RawBrain,
  Settings as RawSettings,
} from 'lucide-react-native';
import { withStrippedProps } from '@/utils/stripDevProps';

const LayoutDashboard = withStrippedProps(RawLayoutDashboard);
const PlusCircle = withStrippedProps(RawPlusCircle);
const ListTodo = withStrippedProps(RawListTodo);
const Brain = withStrippedProps(RawBrain);
const Settings = withStrippedProps(RawSettings);

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
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="new-task"
        options={{
          title: 'New Task',
          tabBarIcon: ({ color, size }) => <PlusCircle size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => <ListTodo size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="memory"
        options={{
          title: 'Memory',
          tabBarIcon: ({ color, size }) => <Brain size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
