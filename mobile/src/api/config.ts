/**
 * The app talks to one API. In a production build its address comes from EXPO_PUBLIC_API_URL
 * (see eas.json); for local testing people type it on the login screen.
 */
declare const process: { env: Record<string, string | undefined> };
declare const __DEV__: boolean | undefined;

/** The Android emulator reaches the computer running it through 10.0.2.2. */
export const LOCAL_DEFAULT = 'http://10.0.2.2:8000';

export const DEFAULT_SERVER: string = process.env.EXPO_PUBLIC_API_URL?.trim() || LOCAL_DEFAULT;

/** A build that carries its own server address (EXPO_PUBLIC_API_URL) never shows server settings. */
export const SERVER_LOCKED: boolean = !!process.env.EXPO_PUBLIC_API_URL?.trim();

/** Server settings exist only while developing against your own computer. */
export const SHOW_SERVER_SETTINGS: boolean = !SERVER_LOCKED && typeof __DEV__ !== 'undefined' && !!__DEV__;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Turns what people type into a base URL, or '' when nothing usable is left.
 *   https://attachlog-api.onrender.com/  ->  https://attachlog-api.onrender.com
 *   attachlog-api.onrender.com           ->  https://attachlog-api.onrender.com
 *   192.168.1.20                         ->  http://192.168.1.20:8000   (a computer on the Wi-Fi)
 *   192.168.1.20:9000                    ->  http://192.168.1.20:9000
 */
export function normalizeServer(input: string): string {
  let text = input.trim();
  if (!text) return '';
  const scheme = /^(https?):\/\//i.exec(text);
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  text = (text.split('/')[0] ?? '').toLowerCase();
  const m = /^([a-z0-9.-]+)(?::(\d{1,5}))?$/.exec(text);
  if (!m) return '';
  const host = m[1]!;
  const port = m[2];
  const local = IPV4.test(host) || host === 'localhost' || host.endsWith('.local') || !host.includes('.');
  const proto = scheme ? scheme[1]!.toLowerCase() : local ? 'http' : 'https';
  if (port) return `${proto}://${host}:${port}`;
  return local && !scheme ? `${proto}://${host}:8000` : `${proto}://${host}`;
}
