import "react-native-reanimated";
import React, { useEffect } from "react";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColorScheme, Alert } from "react-native";
import { useNetworkState } from "expo-network";
import {
  DarkTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { WidgetProvider } from "@/contexts/WidgetContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { COLORS } from "@/constants/theme";

const DevErrorBoundary = __DEV__
  ? ErrorBoundary
  : ({ children }: { children: React.ReactNode }) => <>{children}</>;

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

const NexusDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    primary: COLORS.primary,
    background: COLORS.background,
    card: COLORS.surface,
    text: COLORS.text,
    border: COLORS.border,
    notification: COLORS.danger,
  },
};

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuthScreen = segments[0] === 'auth-screen';
    const inAuthPopup = segments[0] === 'auth-popup';
    const inAuthCallback = segments[0] === 'auth-callback';
    const inAuthFlow = inAuthScreen || inAuthPopup || inAuthCallback;

    if (!user && !inAuthFlow) {
      console.log('[Nav] No user, redirecting to auth-screen');
      router.replace('/auth-screen');
    } else if (user && inAuthScreen) {
      console.log('[Nav] User authenticated, redirecting to tabs');
      router.replace('/(tabs)/(home)');
    }
  }, [user, loading, segments]);

  return <>{children}</>;
}

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const networkState = useNetworkState();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  React.useEffect(() => {
    if (
      !networkState.isConnected &&
      networkState.isInternetReachable === false
    ) {
      Alert.alert(
        "You are offline",
        "Check your connection. Agent tasks require internet access."
      );
    }
  }, [networkState.isConnected, networkState.isInternetReachable]);

  return (
    <ThemeProvider value={NexusDarkTheme}>
      <SafeAreaProvider>
        <WidgetProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <NavigationGuard>
              <Stack>
                <Stack.Screen name="auth-screen" options={{ headerShown: false }} />
                <Stack.Screen name="auth-popup" options={{ headerShown: false }} />
                <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="task/[id]"
                  options={{
                    headerShown: true,
                    title: 'Task',
                    headerStyle: { backgroundColor: COLORS.surface },
                    headerTintColor: COLORS.text,
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
                <Stack.Screen
                  name="settings/api-keys"
                  options={{
                    headerShown: true,
                    title: 'API Keys',
                    headerStyle: { backgroundColor: COLORS.surface },
                    headerTintColor: COLORS.text,
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
                <Stack.Screen
                  name="settings/custom-apis"
                  options={{
                    headerShown: true,
                    title: 'Custom APIs',
                    headerStyle: { backgroundColor: COLORS.surface },
                    headerTintColor: COLORS.text,
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
                <Stack.Screen
                  name="settings/permissions"
                  options={{
                    headerShown: true,
                    title: 'Permissions',
                    headerStyle: { backgroundColor: COLORS.surface },
                    headerTintColor: COLORS.text,
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
                <Stack.Screen
                  name="settings/github"
                  options={{
                    headerShown: true,
                    title: 'GitHub',
                    headerStyle: { backgroundColor: COLORS.surface },
                    headerTintColor: COLORS.text,
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
                <Stack.Screen
                  name="settings/safety"
                  options={{
                    headerShown: true,
                    title: 'Safety Settings',
                    headerStyle: { backgroundColor: COLORS.surface },
                    headerTintColor: COLORS.text,
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
                <Stack.Screen
                  name="settings/runtime"
                  options={{
                    headerShown: true,
                    title: 'Runtime Status',
                    headerStyle: { backgroundColor: COLORS.surface },
                    headerTintColor: COLORS.text,
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
                <Stack.Screen
                  name="settings/logs"
                  options={{
                    headerShown: true,
                    title: 'Logs',
                    headerStyle: { backgroundColor: COLORS.surface },
                    headerTintColor: COLORS.text,
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
                <Stack.Screen
                  name="custom-api/[id]"
                  options={{
                    headerShown: true,
                    title: 'Custom API',
                    headerStyle: { backgroundColor: COLORS.surface },
                    headerTintColor: COLORS.text,
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
                <Stack.Screen
                  name="memory/[id]"
                  options={{
                    headerShown: true,
                    title: 'Memory',
                    headerStyle: { backgroundColor: COLORS.surface },
                    headerTintColor: COLORS.text,
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
              </Stack>
            </NavigationGuard>
            <SystemBars style="light" />
          </GestureHandlerRootView>
        </WidgetProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <DevErrorBoundary>
      <StatusBar style="light" animated />
      <AuthProvider>
        <RootLayoutInner />
      </AuthProvider>
    </DevErrorBoundary>
  );
}
