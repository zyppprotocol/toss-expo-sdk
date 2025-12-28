import AsyncStorage from '@react-native-async-storage/async-storage';

const INTENTS_KEY = 'TOSS_PENDING_INTENTS';

export async function storePendingIntent(intent: any) {
  const current = JSON.parse((await AsyncStorage.getItem(INTENTS_KEY)) || '[]');
  current.push(intent);
  await AsyncStorage.setItem(INTENTS_KEY, JSON.stringify(current));
}

export async function getPendingIntents() {
  return JSON.parse((await AsyncStorage.getItem(INTENTS_KEY)) || '[]');
}

export async function clearPendingIntents() {
  await AsyncStorage.removeItem(INTENTS_KEY);
}
