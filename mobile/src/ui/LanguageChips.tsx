import { View } from 'react-native';

import { useLanguage } from '../state/language';
import { Chip } from './kit';

/** English / Français, remembered on the phone. */
export function LanguageChips() {
  const { language, choose } = useLanguage();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Chip label="English" selected={language === 'en'} onPress={() => choose('en')} />
      <Chip label="Français" selected={language === 'fr'} onPress={() => choose('fr')} />
    </View>
  );
}
