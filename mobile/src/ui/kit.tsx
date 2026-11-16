import { t } from '../i18n';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';

import { friendlyMessage } from '../api/errors';
import type { AsyncState } from '../state/useAsync';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { colors, lift, radius, space } from './theme';

// The styles are built from the live colours; `useStyles()` below rebuilds them when the theme changes
// (the whole tree is drawn again on a theme change, see state/theme.tsx).
let cache: { key: string; styles: ReturnType<typeof build> } | null = null;
function useStyles() {
  const key = `${colors.bg}|${colors.card}`;
  if (!cache || cache.key !== key) cache = { key, styles: build() };
  return cache.styles;
}

// ------------------------------------------------------------------ text

export function Title({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={useStyles().title}>{children}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={useStyles().section}>{children}</Text>;
}

export function Body({ children, muted, bold, style }: {
  children: ReactNode; muted?: boolean; bold?: boolean; style?: StyleProp<TextStyle>;
}) {
  return <Text style={[useStyles().body, muted && { color: colors.muted }, bold && { fontWeight: '700' }, style]}>{children}</Text>;
}

// ---------------------------------------------------------------- layout

export function Card({ children, onPress, label }: { children: ReactNode; onPress?: () => void; label?: string }) {
  const styles = useStyles();
  if (!onPress) return <View style={styles.card}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.card, pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] }]}
    >
      {children}
    </Pressable>
  );
}

/** A coloured tile like the subject cards: a saturated rounded block with an icon and a label. */
export function Tile({ title, subtitle, color, icon, onPress, children }: {
  title: string; subtitle?: string; color: string; icon?: IconName; onPress?: () => void; children?: ReactNode;
}) {
  const styles = useStyles();
  const inner = (
    <>
      <View style={styles.tileDeco} />
      {icon ? <View style={styles.tileIcon}><Icon name={icon} size={20} color="#FFFFFF" /></View> : null}
      <View style={{ gap: 2 }}>
        <Text style={styles.tileTitle}>{title}</Text>
        {subtitle ? <Text style={styles.tileSub}>{subtitle}</Text> : null}
      </View>
      {children}
    </>
  );
  if (!onPress) return <View style={[styles.tile, { backgroundColor: color }]}>{inner}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.tile, { backgroundColor: color }, pressed && { opacity: 0.92 }]}>
      {inner}
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
  const styles = useStyles();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={flush ? { paddingBottom: space.lg } : styles.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Loading, error-with-retry and pull-to-refresh around data that comes from useAsync. */
export function AsyncPage<T>({ state, children }: { state: AsyncState<T>; children: (data: T) => ReactNode }) {
  const styles = useStyles();
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
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon name={icon} size={30} color={colors.accent} /></View>
      <Text style={[styles.body, { fontWeight: '700', textAlign: 'center' }]}>{title}</Text>
      {hint ? <Text style={[styles.body, { color: colors.muted, textAlign: 'center' }]}>{hint}</Text> : null}
    </View>
  );
}

/** The dark-green band at the top of a screen, with soft rings behind the content. */
export function HeroBand({ children, top = 0, bottom = 28 }: { children: ReactNode; top?: number; bottom?: number }) {
  const styles = useStyles();
  return (
    <View style={[styles.hero, { paddingTop: top + space.md, paddingBottom: bottom }]}>
      <View style={styles.ringBig} />
      <View style={styles.ringSmall} />
      {children}
    </View>
  );
}

// -------------------------------------------------------------- feedback

export function ErrorBanner({ error, message }: { error?: unknown; message?: string }) {
  const text = message ?? friendlyMessage(error);
  return (
    <View accessibilityRole="alert" style={useStyles().errorBanner}>
      <Text style={{ color: colors.danger, fontSize: 15 }}>{text}</Text>
    </View>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <View style={useStyles().notice}>
      <Text style={{ color: colors.warn, fontSize: 15 }}>{children}</Text>
    </View>
  );
}

/** A soft status chip. */
export function Pill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[useStyles().pill, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ percent, color = colors.accent }: { percent: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={useStyles().track}
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
  const styles = useStyles();
  const off = !!disabled || !!loading;
  const filled = variant !== 'ghost';
  const bg = variant === 'danger' ? colors.danger : variant === 'primary' ? colors.primary : colors.primarySoft;
  const fg = filled ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.button, filled && lift(0.7),
        { backgroundColor: bg, opacity: off ? 0.55 : pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
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
  const styles = useStyles();
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
          !editable && { opacity: 0.7 },
          focused && { borderColor: colors.accent, backgroundColor: colors.card },
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
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}
    >
      <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------- showpieces

/** Round badge with initials or a profile photo, for people. */
export function Avatar({ name, uri, size = 44, color = colors.primarySoft, ink = colors.primary, onPress }: {
  name: string; uri?: string | null; size?: number; color?: string; ink?: string; onPress?: () => void;
}) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
  const inner = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: ink, fontWeight: '800', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('Profile')} onPress={onPress}>
      {inner}
    </Pressable>
  );
}

/** A big number, kept for the progress and score. */
export function Marked({ children, size, color = colors.text }: { children: ReactNode; size: number; color?: string; mono?: boolean }) {
  return <Text style={{ fontSize: size, fontWeight: '800', color, letterSpacing: -0.5 }}>{children}</Text>;
}

type Tone = 'accent' | 'mint' | 'peri' | 'sun';
const toneColor = (tone: Tone) => ({ accent: colors.accent, mint: colors.mint, peri: colors.peri, sun: colors.sun })[tone];

/** Totals as a row of coloured tiles. */
export function Stats({ items }: { items: { label: string; value: string | number; tone?: Tone; icon?: IconName }[] }) {
  const styles = useStyles();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {items.map((it, i) => (
        <View key={it.label} style={[styles.stat, { backgroundColor: toneColor(it.tone ?? (['accent', 'mint', 'peri'] as const)[i % 3]!) }]}>
          <Text style={{ fontSize: 30, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1 }}>{it.value}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.92)' }} numberOfLines={1}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Kept for the screens that greet the person inside the page. */
export function Hero({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>{title}</Text>
      {subtitle ? <Text style={{ color: colors.muted, fontSize: 15 }}>{subtitle}</Text> : null}
    </View>
  );
}

/** Plain surface; the screens used to draw ruled paper here. */
export function Paper() { return null; }

function build() {
  return StyleSheet.create({
    title: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
    section: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: space.sm, letterSpacing: -0.3 },
    body: { fontSize: 16, color: colors.text, lineHeight: 22 },
    card: {
      backgroundColor: colors.card, borderRadius: radius, padding: space.md, gap: space.sm,
      borderWidth: 1, borderColor: colors.border, ...lift(0.6),
    },
    tile: { flex: 1, minHeight: 120, borderRadius: radius, padding: space.md, justifyContent: 'space-between', overflow: 'hidden' },
    tileDeco: { position: 'absolute', right: -24, top: -24, width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.18)' },
    tileIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.24)', alignItems: 'center', justifyContent: 'center' },
    tileTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
    tileSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },
    page: { padding: space.md, gap: space.md, paddingBottom: space.lg * 2 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg, paddingHorizontal: space.md },
    emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
    hero: { backgroundColor: colors.hero, paddingHorizontal: space.md, overflow: 'hidden' },
    ringBig: { position: 'absolute', right: -70, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: colors.heroDeco },
    ringSmall: { position: 'absolute', left: -40, bottom: -50, width: 140, height: 140, borderRadius: 70, backgroundColor: colors.heroDeco },
    errorBanner: { backgroundColor: colors.dangerBg, borderRadius: 16, padding: space.md },
    notice: { backgroundColor: colors.warnBg, borderRadius: 16, padding: space.md },
    pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
    track: { height: 12, borderRadius: 8, backgroundColor: colors.track, overflow: 'hidden' },
    button: { minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
    label: { fontSize: 14, fontWeight: '700', color: colors.text },
    input: {
      minHeight: 54, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.cardAlt,
      paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.text,
    },
    chip: {
      minHeight: 38, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border,
      backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
    },
    stat: { flex: 1, borderRadius: 18, padding: space.md, gap: 2 },
  });
}
