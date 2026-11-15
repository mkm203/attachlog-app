import { t } from '../i18n';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';

import { friendlyMessage } from '../api/errors';
import type { AsyncState } from '../state/useAsync';
import { colors, radius, space } from './theme';

// ------------------------------------------------------------------ text

export function Title({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.title}>{children}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.section}>{children}</Text>;
}

export function Body({ children, muted, bold }: { children: ReactNode; muted?: boolean; bold?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }, bold && { fontWeight: '600' }]}>{children}</Text>;
}

// ---------------------------------------------------------------- layout

export function Card({ children, onPress, label }: { children: ReactNode; onPress?: () => void; label?: string }) {
  if (!onPress) return <View style={styles.card}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

export function Row({ children, gap = space.sm }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>{children}</View>;
}

/** A scrolling page with the standard gutter and keyboard handling. */
export function Page({ children, onRefresh, refreshing }: {
  children: ReactNode; onRefresh?: () => void; refreshing?: boolean;
}) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Loading, error-with-retry and pull-to-refresh around data that comes from useAsync. */
export function AsyncPage<T>({ state, children }: { state: AsyncState<T>; children: (data: T) => ReactNode }) {
  if (state.data === null && state.loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (state.data === null) {
    return (
      <Page>
        <ErrorBanner error={state.error} />
        <Button title={t('Try again')} onPress={state.reload} />
      </Page>
    );
  }
  return (
    <Page onRefresh={state.reload} refreshing={state.loading}>
      {state.error ? <ErrorBanner error={state.error} /> : null}
      {children(state.data)}
    </Page>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={[styles.body, { fontWeight: '600', textAlign: 'center' }]}>{title}</Text>
      {hint ? <Text style={[styles.body, { color: colors.muted, textAlign: 'center' }]}>{hint}</Text> : null}
    </View>
  );
}

// -------------------------------------------------------------- feedback

export function ErrorBanner({ error, message }: { error?: unknown; message?: string }) {
  const text = message ?? friendlyMessage(error);
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Text style={{ color: colors.danger, fontSize: 15 }}>{text}</Text>
    </View>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <View style={styles.notice}>
      <Text style={{ color: colors.warn, fontSize: 15 }}>{children}</Text>
    </View>
  );
}

export function Pill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ percent, color = colors.primary }: { percent: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={styles.track}
    >
      <View style={{ width: `${clamped}%`, height: '100%', backgroundColor: color, borderRadius: 6 }} />
    </View>
  );
}

// ----------------------------------------------------------------- input

type ButtonVariant = 'primary' | 'danger' | 'ghost';

export function Button({ title, onPress, variant = 'primary', loading, disabled }: {
  title: string; onPress: () => void; variant?: ButtonVariant; loading?: boolean; disabled?: boolean;
}) {
  const off = !!disabled || !!loading;
  const filled = variant !== 'ghost';
  const bg = variant === 'danger' ? colors.danger : variant === 'primary' ? colors.primary : 'transparent';
  const fg = filled ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.button,
        { backgroundColor: bg, borderColor: filled ? bg : colors.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>}
    </Pressable>
  );
}

export function TextField({ label, value, onChangeText, error, hint, multiline, editable = true, ...rest }: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  hint?: string;
  multiline?: boolean;
  editable?: boolean;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'numeric' | 'number-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  maxLength?: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        autoCorrect={false}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          multiline && { minHeight: 110 },
          !editable && { backgroundColor: colors.track },
          !!error && { borderColor: colors.danger },
        ]}
        {...rest}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 14 }}>{error}</Text> : null}
      {!error && hint ? <Text style={{ color: colors.muted, fontSize: 14 }}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  section: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: space.sm },
  body: { fontSize: 16, color: colors.text, lineHeight: 22 },
  card: {
    backgroundColor: colors.card, borderRadius: radius, padding: space.md, gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  page: { padding: space.md, gap: space.md, paddingBottom: space.lg * 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  errorBanner: { backgroundColor: colors.dangerBg, borderRadius: 10, padding: space.md },
  notice: { backgroundColor: colors.warnBg, borderRadius: 10, padding: space.md },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  track: { height: 10, borderRadius: 6, backgroundColor: colors.track, overflow: 'hidden' },
  button: {
    minHeight: 48, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text,
  },
  chip: {
    minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
});
