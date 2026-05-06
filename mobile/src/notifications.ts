// APNs push registration for incoming direct calls (tier-a alert push).
// Asks for permission, registers an INCOMING_CALL category with Answer/Decline
// actions, fetches the native APNs device token (hex), and posts it to the
// AuthApi. The actual ringing UI still comes from the SignalR hub once the
// app is in the foreground — the notification is just what wakes the user up.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export interface RegisteredPush { token: string; platform: 'ios' | 'android'; }

let setup = false;

export async function setupNotificationCategories() {
  if (setup) return;
  setup = true;
  try {
    await Notifications.setNotificationCategoryAsync('INCOMING_CALL', [
      { identifier: 'ANSWER',  buttonTitle: 'Answer',  options: { opensAppToForeground: true } },
      { identifier: 'DECLINE', buttonTitle: 'Decline', options: { opensAppToForeground: false, isDestructive: true } },
    ]);
  } catch (e) {
    console.warn('[notif] category setup failed', e);
  }
}

export async function registerForPushNotifications(): Promise<RegisteredPush | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== 'granted') {
    const r = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: true },
    });
    status = r.status;
  }
  if (status !== 'granted') return null;

  await setupNotificationCategories();

  // getDevicePushTokenAsync returns the raw native token — APNs hex on iOS,
  // FCM string on Android. We send these straight to our own server (no Expo
  // push relay).
  try {
    const t = await Notifications.getDevicePushTokenAsync();
    if (!t?.data) return null;
    return { token: String(t.data), platform: Platform.OS as 'ios' | 'android' };
  } catch (e) {
    console.warn('[notif] getDevicePushTokenAsync failed', e);
    return null;
  }
}

// Foreground display: when a call notification arrives while the app is open,
// suppress the OS banner — the in-app IncomingCallModal will handle it.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const isCall = n.request.content.categoryIdentifier === 'INCOMING_CALL';
    return {
      shouldShowBanner: !isCall,
      shouldShowList:   !isCall,
      shouldPlaySound:  !isCall,
      shouldSetBadge:   false,
    };
  },
});
