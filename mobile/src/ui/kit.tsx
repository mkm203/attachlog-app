import { t } from '../i18n';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';

import { friendlyMessage } from '../api/errors';
import type { AsyncState } from '../state/useAsync';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { colors, radius, shadow, space } from './theme';

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
      style={({ pressed }: { pressed: boolean }) => [styles.card, pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }]}
    >
      {children}
    </Pressable>
  );
}

export function Row({ children, gap = space.sm }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>{children}</View>;
}

/** A scrolling page with the standard gutter and keyboard handling. */
export function Page({ children, onRefresh, refreshing, flush }: {
  children: ReactNode; onRefresh?: () => void; refreshing?: boolean; flush?: boolean;
}) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={flush ? { paddingBottom: space.lg } : styles.page}
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

export function Empty({ title, hint, icon = 'document-text-outline' }: { title: string; hint?: string; icon?: IconName }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon name={icon} size={30} color={colors.primary} /></View>
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
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: fg }} />
      <Text style={{ color: fg, fontSize: 13, fontWeight: '700' }}>{label}</Text>
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
      <View style={{ width: `${clamped}%`, height: '100%', backgroundColor: color, borderRadius: 8 }} />
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
        filled && shadow,
        { backgroundColor: bg, borderColor: filled ? bg : colors.border, opacity: off ? 0.55 : pressed ? 0.88 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 16, fontWeight: '700' }}>{title}</Text>}
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
  const [focused, setFocused] = useState(false);
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          multiline && { minHeight: 110 },
          !editable && { backgroundColor: colors.track },
          focused && { borderColor: colors.primary, backgroundColor: colors.card },
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

// ------------------------------------------------------------- showpieces

/** Round badge with initials, for people. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

/** A row of big numbers, for the top of a home screen. */
export function Stats({ items }: { items: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'plain' }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {items.map((it) => (
        <View key={it.label} style={styles.stat}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: it.tone === 'warn' ? colors.warn : it.tone === 'ok' ? colors.ok : colors.primary }}>{it.value}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }} numberOfLines={1}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** A greeting band at the top of a page. */
export function Hero({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.hero}>
      <Text style={{ color: colors.onPrimary, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 }}>{title}</Text>
      {subtitle ? <Text style={{ color: '#CFE8E3', fontSize: 15 }}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: space.md, gap: 2, borderWidth: 1, borderColor: colors.border, ...shadow },
  hero: { backgroundColor: colors.primary, borderRadius: radius + 4, padding: space.lg, gap: 4, ...shadow },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  section: { fontSize: 13, fontWeight: '800', color: colors.muted, marginTop: space.md, letterSpacing: 1, textTransform: 'uppercase' },
  body: { fontSize: 16, color: colors.text, lineHeight: 22 },
  card: {
    backgroundColor: colors.card, borderRadius: radius, padding: space.md, gap: space.sm,
    borderWidth: 1, borderColor: colors.border, ...shadow,
  },
  page: { padding: space.md, gap: space.md, paddingBottom: space.lg * 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg, paddingHorizontal: space.md },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  errorBanner: { backgroundColor: colors.dangerBg, borderRadius: 14, padding: space.md },
  notice: { backgroundColor: colors.warnBg, borderRadius: 14, padding: space.md },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  track: { height: 12, borderRadius: 8, backgroundColor: colors.track, overflow: 'hidden' },
  button: {
    minHeight: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  label: { fontSize: 14, fontWeight: '700', color: colors.text },
  input: {
    minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#F8FBFA',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text,
  },
  chip: {
    minHeight: 38, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
});
