import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { t } from '../i18n';
import { fromIso, startingDate, toIso } from '../lib/dates';
import { formatDate } from '../lib/format';
import { colors } from './theme';

/**
 * A date chosen with the phone's own calendar. `value` and `onChange` use "YYYY-MM-DD".
 * `min` and `max` grey out the days that are not allowed (for example outside the school's term).
 */
export function DateField({ label, value, onChange, error, hint, min, max }: {
  label: string; value: string; onChange: (iso: string) => void; error?: string; hint?: string; min?: string; max?: string;
}) {
  const [showing, setShowing] = useState(false);
  const minimumDate = min ? fromIso(min) ?? undefined : undefined;
  const maximumDate = max ? fromIso(max) ?? undefined : undefined;

  const open = () => {
    const current = startingDate(value, min, max);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current, mode: 'date', minimumDate, maximumDate,
        onChange: (event, picked) => { if (event.type === 'set' && picked) onChange(toIso(picked)); },
      });
    } else {
      setShowing((s) => !s);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDate(value) : t('Choose a date')}`}
        onPress={open}
        style={{
          minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: error ? colors.danger : colors.border,
          backgroundColor: colors.card, paddingHorizontal: 12, justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 16, color: value ? colors.text : colors.muted }}>
          {value ? formatDate(value) : t('Choose a date')}
        </Text>
      </Pressable>
      {showing && Platform.OS !== 'android' ? (
        <DateTimePicker
          value={startingDate(value, min, max)} mode="date" display="inline"
          minimumDate={minimumDate} maximumDate={maximumDate}
          onChange={(_event, picked) => { if (picked) onChange(toIso(picked)); }}
        />
      ) : null}
      {error ? <Text style={{ color: colors.danger, fontSize: 14 }}>{error}</Text> : null}
      {!error && hint ? <Text style={{ color: colors.muted, fontSize: 14 }}>{hint}</Text> : null}
    </View>
  );
}
