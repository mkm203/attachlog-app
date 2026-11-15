import * as SecureStore from 'expo-secure-store';

/** SecureStore keeps the token in the Keychain / Keystore; memory is only a fallback. */
const memory = new Map<string, string>();

export async function getItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  memory.set(key, value);
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    /* kept in memory for this run */
  }
}

export async function removeItem(key: string): Promise<void> {
  memory.delete(key);
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* nothing to remove */
  }
}
