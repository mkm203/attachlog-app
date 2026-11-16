import { Ionicons } from '@expo/vector-icons';

/** Ionicons ships with Expo. Names: https://ionic.io/ionicons */
export type IconName =
  | 'home' | 'home-outline' | 'school' | 'school-outline' | 'person-circle' | 'person-circle-outline'
  | 'book' | 'people' | 'document-text-outline' | 'checkmark-done-outline' | 'chevron-forward' | 'chevron-back'
  | 'business-outline' | 'calendar-outline' | 'add' | 'time-outline' | 'close-circle-outline'
  | 'notifications' | 'notifications-outline' | 'book-outline' | 'pencil-outline' | 'calculator-outline'
  | 'flask-outline' | 'ribbon-outline' | 'bookmark-outline' | 'bulb-outline'
  | 'color-palette-outline';

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}
