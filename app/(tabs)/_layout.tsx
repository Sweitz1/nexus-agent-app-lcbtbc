import { Tabs } from 'expo-router';
import { withStrippedProps } from '@/utils/stripDevProps';
import {
  LayoutDashboard,
  Plus,
  ListTodo,
  Brain,
  Settings,
} from 'lucide-react-native';
import { COLORS } from '@/constants/theme';

const DashboardIcon = withStrippedProps(LayoutDashboard);
const PlusIcon = withStrippedProps(Plus);
const TasksIcon = withStrippedProps(ListTodo);
const MemoryIcon = withStrippedProps(Brain);
const SettingsIcon = withStrippedProps(Settings);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0d0d12',
          borderTopColor: '#1e1e28',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <DashboardIcon size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="new-task"
        options={{
          title: 'New Task',
          tabBarIcon: ({ color, size }) => <PlusIcon size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => <TasksIcon size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="memory"
        options={{
          title: 'Memory',
          tabBarIcon: ({ color, size }) => <MemoryIcon size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsIcon size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
