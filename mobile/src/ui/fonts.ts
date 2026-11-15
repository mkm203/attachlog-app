import { Platform } from 'react-native';

/** Built-in faces only (nothing to install): a book serif for titles, a typewriter face for numbers. */
export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }) as string,
  mono: Platform.select({ ios: 'Courier New', android: 'monospace', default: "'Courier New', monospace" }) as string,
};
