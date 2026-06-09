/**
 * OneSignal Push Notification Context (Anonymous Mode)
 *
 * Provides push notification management for Expo + React Native apps.
 * Reads OneSignal App ID from app.json (expo.extra) automatically.
 *
 * NOTE: Running in anonymous mode - notifications won't be linked to a user ID.
 * To enable user targeting:
 * 1. Set up authentication with setup_auth
 * 2. Re-run setup_onesignal to upgrade this file
 *
 * SETUP:
 * 1. Wrap your app with <NotificationProvider>
 * 2. Run: npx expo install onesignal-expo-plugin react-native-onesignal && npx expo prebuild
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import { OneSignal, NotificationWillDisplayEvent } from "react-native-onesignal";
import Constants from "expo-constants";

// Read App ID from app.json (expo.extra)
const extra = Constants.expoConfig?.extra || {};
const ONESIGNAL_APP_ID = extra.oneSignalAppId || "";

// Check if running on web
const isWeb = Platform.OS === "web";

interface NotificationContextType {
  /** Whether the user has granted notification permission */
  hasPermission: boolean;
  /** Whether permission has been requested but not yet granted */
  permissionDenied: boolean;
  /** Loading state during initialization */
  loading: boolean;
  /** Whether running on web (notifications not available) */
  isWeb: boolean;
  /** Request notification permission from the user */
  requestPermission: () => Promise<boolean>;
  /** Set a tag for user segmentation */
  sendTag: (key: string, value: string) => void;
  /** Remove a tag */
  deleteTag: (key: string) => void;
  /** Last received notification data */
  lastNotification: Record<string, unknown> | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [hasPermission, setHasPermission] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastNotification, setLastNotification] = useState<Record<string, unknown> | null>(null);

  // Initialize OneSignal on mount
  useEffect(() => {
    if (isWeb) {
      setLoading(false);
      return;
    }

    if (!ONESIGNAL_APP_ID) {
      console.warn(
        "[OneSignal] App ID not provided. " +
        "Please add oneSignalAppId to app.json extra."
      );
      setLoading(false);
      return;
    }

    try {
      // Initialize OneSignal
      OneSignal.initialize(ONESIGNAL_APP_ID);

      if (__DEV__) {
        console.log("[OneSignal] Initialized with App ID:", ONESIGNAL_APP_ID.substring(0, 8) + "...");
      }

      // Check current permission status
      const permissionStatus = OneSignal.Notifications.hasPermission();
      setHasPermission(permissionStatus);

      // Listen for notification events
      const foregroundHandler = (event: NotificationWillDisplayEvent) => {
        // Display the notification
        event.getNotification().display();

        const notification = event.getNotification();
        setLastNotification({
          title: notification.title,
          body: notification.body,
          additionalData: notification.additionalData,
        });
      };
      OneSignal.Notifications.addEventListener("foregroundWillDisplay", foregroundHandler);

      // Listen for permission changes
      const permissionHandler = (granted: boolean) => {
        setHasPermission(granted);
        setPermissionDenied(!granted);
      };
      OneSignal.Notifications.addEventListener("permissionChange", permissionHandler);

      return () => {
        OneSignal.Notifications.removeEventListener("foregroundWillDisplay", foregroundHandler);
        OneSignal.Notifications.removeEventListener("permissionChange", permissionHandler);
      };
    } catch (error) {
      console.error("[OneSignal] Failed to initialize:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (isWeb) return false;

    try {
      const granted = await OneSignal.Notifications.requestPermission(true);
      setHasPermission(granted);
      setPermissionDenied(!granted);
      return granted;
    } catch (error) {
      console.error("[OneSignal] Permission request failed:", error);
      return false;
    }
  }, []);

  const sendTag = useCallback((key: string, value: string) => {
    if (isWeb) return;
    try {
      OneSignal.User.addTag(key, value);
    } catch (error) {
      console.error("[OneSignal] Failed to send tag:", error);
    }
  }, []);

  const deleteTag = useCallback((key: string) => {
    if (isWeb) return;
    try {
      OneSignal.User.removeTag(key);
    } catch (error) {
      console.error("[OneSignal] Failed to delete tag:", error);
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        hasPermission,
        permissionDenied,
        loading,
        isWeb,
        requestPermission,
        sendTag,
        deleteTag,
        lastNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access notification state and methods.
 *
 * @example
 * const { hasPermission, requestPermission } = useNotifications();
 *
 * if (!hasPermission) {
 *   return <Button onPress={requestPermission}>Enable Notifications</Button>;
 * }
 */
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotifications must be used within NotificationProvider"
    );
  }
  return context;
}
