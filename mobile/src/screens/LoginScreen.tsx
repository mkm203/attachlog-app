import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { AttachLogClient } from '../api/client';
import { SERVER_LOCKED, SHOW_SERVER_SETTINGS, normalizeServer } from '../api/config';
import { friendlyMessage } from '../api/errors';
import { t } from '../i18n';
import { hasErrors, validateLogin, validateNewPassword, validateRegister } from '../lib/validation';
import type { FieldErrors } from '../lib/validation';
import { useSession } from '../state/session';
import { Button, Card, ErrorBanner, Notice, Page, TextField, Title } from '../ui/kit';
import { colors } from '../ui/theme';
import { LanguageChips } from '../ui/LanguageChips';
import { Icon } from '../ui/Icon';
import { fonts } from '../ui/fonts';
import { ConnectionCheck } from './ConnectionCheck';

type Mode = 'login' | 'register' | 'forgot';

export function LoginScreen() {
  const { signIn, register, server, notice } = useSession();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [asStudent, setAsStudent] = useState(false);
  const [fieldOfStudy, setFieldOfStudy] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [address, setAddress] = useState(server);
  const [showServer, setShowServer] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<'name' | 'email' | 'password' | 'code'>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const entrance = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const formTransition = useRef(new Animated.Value(1)).current;

  // Wake a sleeping free server while the person types, so the first sign-in is not slow.
  useEffect(() => { void new AttachLogClient({ server }).health(); }, [server]);

  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    }).catch((error: unknown) => {
      console.warn('Could not read the reduced-motion preference', error);
      if (active) setReduceMotion(false);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) {
      entrance.stopAnimation();
      float.stopAnimation();
      formTransition.stopAnimation();
      entrance.setValue(1);
      float.setValue(0);
      formTransition.setValue(1);
      return;
    }
    Animated.spring(entrance, { toValue: 1, speed: 1.1, bounciness: 4, useNativeDriver: true }).start();
    const motion = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2400, useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2400, useNativeDriver: true }),
    ]));
    motion.start();
    return () => motion.stop();
  }, [entrance, float, formTransition, reduceMotion]);

  const go = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFailure(null);
    formTransition.stopAnimation();
    formTransition.setValue(reduceMotion === true ? 1 : 0);
    if (reduceMotion !== true) {
      Animated.spring(formTransition, { toValue: 1, speed: 1.5, bounciness: 2, useNativeDriver: true }).start();
    }
  };

  const submit = async () => {
    const found = mode === 'login' ? validateLogin(email, password) : validateRegister({ name, email, password, code });
    setErrors(found);
    setFailure(null);
    if (hasErrors(found)) return;
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password, address);
      else await register({ name, email, password, code, field_of_study: asStudent ? fieldOfStudy : undefined, specialty: asStudent ? specialty : undefined }, address);
    } catch (e) {
      setFailure(friendlyMessage(e));
      setBusy(false);
    }
  };

  if (mode === 'forgot') {
    return (
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.sheet }}>
        <ForgotPassword server={SERVER_LOCKED ? server : normalizeServer(address) || server} onDone={() => go('login')} />
      </View>
    );
  }

  const heroMotion = {
    opacity: entrance,
    transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  };
  const floatMotion = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <Page flush>
      <View style={{ flex: 1, minHeight: 720, backgroundColor: colors.bg }}>
        <LinearGradient
          colors={['#0D3737', '#176B65', '#277F72']}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={{ paddingTop: insets.top + 22, paddingHorizontal: 26, paddingBottom: 58, minHeight: 365, overflow: 'hidden' }}
        >
          <View pointerEvents="none" style={{ position: 'absolute', width: 210, height: 210, borderRadius: 110, backgroundColor: 'rgba(201,247,218,0.09)', right: -74, top: 18 }} />
          <View pointerEvents="none" style={{ position: 'absolute', width: 150, height: 150, borderRadius: 80, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', right: -30, top: 52 }} />
          <Animated.View style={heroMotion}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 38 }}>
              <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: '#F6F4EA', alignItems: 'center', justifyContent: 'center', ...Platform.select({ android: { elevation: 5 }, default: {} }) }}>
                <Image source={require('../../assets/splash-icon.png')} style={{ width: 48, height: 48 }} accessibilityLabel="AttachLog logo" />
              </View>
              <View>
                <Text style={{ color: '#FFFFFF', fontFamily: fonts.display, fontSize: 23, letterSpacing: -0.7 }}>AttachLog</Text>
                <Text style={{ color: '#B9E6D8', fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.7 }}>{t('FIELDWORK, IN FOCUS')}</Text>
              </View>
            </View>
            <Text style={{ color: '#D5F3E7', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, fontFamily: fonts.bold }}>
              {t('YOUR NEXT CHAPTER STARTS HERE')}
            </Text>
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.display, fontSize: 37, lineHeight: 42, letterSpacing: -1.5, marginTop: 9, maxWidth: 330 }}>
              {t('Make your placement count.')}
            </Text>
            <Text style={{ color: 'rgba(239,255,248,0.78)', fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 315 }}>
              {t('One thoughtful space for your work, your people, and every bit of progress.')}
            </Text>
            <Animated.View style={{
              position: 'absolute', right: 4, bottom: -34, width: 54, height: 54, borderRadius: 19,
              backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center', justifyContent: 'center', transform: [{ translateY: floatMotion }, { rotate: '9deg' }],
            }}>
              <Icon name="book-outline" size={26} color="#E5F8ED" />
            </Animated.View>
            <Animated.View style={{
              position: 'absolute', right: 64, bottom: 20, width: 38, height: 38, borderRadius: 14,
              backgroundColor: '#F6A17A', alignItems: 'center', justifyContent: 'center',
              transform: [{ translateY: Animated.multiply(floatMotion, -0.6) }, { rotate: '-13deg' }],
            }}>
              <Icon name="pencil-outline" size={20} color="#5A3529" />
            </Animated.View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 }}>
              <View style={{ width: 28, height: 2, backgroundColor: '#F6A17A', borderRadius: 1 }} />
              <Text style={{ color: '#D5F3E7', fontFamily: fonts.medium, fontSize: 12 }}>
                {t('Learn. Contribute. Grow.')}
              </Text>
            </View>
          </Animated.View>
        </LinearGradient>

        <Animated.View style={{
          flex: 1, marginTop: -30, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 26, gap: 17,
          backgroundColor: colors.sheet, borderTopLeftRadius: 30, borderTopRightRadius: 30,
          ...Platform.select({ ios: { shadowColor: '#102F31', shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: -8 } }, android: { elevation: 8 }, default: {} }),
          opacity: formTransition,
          transform: [{ translateY: formTransition.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 4, backgroundColor: colors.border, marginTop: -8, marginBottom: 1 }} />
          {notice ? <Notice>{notice}</Notice> : null}
          {failure ? <ErrorBanner message={failure} /> : null}

          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.primary, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.5 }}>
              {mode === 'login' ? t('GOOD TO SEE YOU') : t('JOIN THE COMMUNITY')}
            </Text>
            <Text style={{ fontSize: 27, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.8 }}>
              {mode === 'login' ? t('Welcome back') : t('Create your account')}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.body }}>
              {mode === 'login' ? t('Pick up where your placement journey left off.') : t('A few details, then you’re ready to get started.')}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border }}>
            {(['login', 'register'] as const).map((next) => {
              const selected = mode === next;
              return (
                <Pressable key={next} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => go(next)}
                  style={{
                    flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: selected ? colors.card : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                    ...(selected ? { shadowColor: '#173438', shadowOpacity: 0.08, shadowRadius: 5,
                      shadowOffset: { width: 0, height: 2 }, elevation: 2 } : {}),
                  }}>
                  <Text style={{ color: selected ? colors.primary : colors.muted, fontWeight: '700', fontSize: 14, fontFamily: fonts.bold }}>
                    {next === 'login' ? t('Sign in') : t('Create account')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ gap: 14 }}>
            {mode === 'register' ? (
              <TextField label={t('Full name')} value={name} onChangeText={setName} error={errors.name} autoCapitalize="words" />
            ) : null}
            <TextField label={t('Email')} value={email} onChangeText={setEmail} error={errors.email}
              autoCapitalize="none" keyboardType="email-address" />
            <TextField label={t('Password')} value={password} onChangeText={setPassword} error={errors.password}
              secureTextEntry autoCapitalize="none" hint={mode === 'register' ? t('At least 8 characters.') : undefined} />
            {mode === 'register' ? (
              <>
                <TextField label={t('Code')} value={code} onChangeText={setCode} error={errors.code} autoCapitalize="none"
                  hint={t("Students: your school's code. Supervisors and coordinators: the code from your invitation.")} />
                <Pressable accessibilityRole="button" accessibilityState={{ selected: asStudent }} onPress={() => setAsStudent((v) => !v)}
                  style={{ padding: 14, borderRadius: 18, borderWidth: 1.5, borderColor: asStudent ? colors.primary : colors.border, backgroundColor: asStudent ? colors.primarySoft : colors.cardAlt, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name={asStudent ? 'checkmark-done-outline' : 'school-outline'} size={19} color={asStudent ? colors.primary : colors.muted} />
                    <Text style={{ color: asStudent ? colors.primary : colors.text, fontWeight: '700', fontSize: 15, fontFamily: fonts.bold }}>
                      {asStudent ? t('Signing up as student') : t('Sign up as student')}
                    </Text>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginLeft: 27, fontFamily: fonts.body }}>{t('Add your field of study and specialty to help your coordinator place you.')}</Text>
                </Pressable>
                {asStudent ? (
                  <>
                    <TextField label={t('Field of study')} value={fieldOfStudy} onChangeText={setFieldOfStudy} autoCapitalize="words" hint={t('e.g. Computer Science, Nursing')} />
                    <TextField label={t('Specialty / option')} value={specialty} onChangeText={setSpecialty} autoCapitalize="words" hint={t('e.g. Software Engineering, Pediatrics')} />
                  </>
                ) : null}
              </>
            ) : null}
            <Button title={mode === 'login' ? t('Sign in') : t('Create account')} onPress={submit} loading={busy} />
            {mode === 'login' ? (
              <Pressable accessibilityRole="button" onPress={() => go('forgot')} style={{ minHeight: 34, justifyContent: 'center' }}>
                <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center', fontFamily: fonts.medium }}>{t('Forgot your password?')}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={{ alignItems: 'center', paddingTop: 2 }}><LanguageChips /></View>

          {SHOW_SERVER_SETTINGS ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => setShowServer((v) => !v)} style={{ paddingVertical: 4 }}>
                <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', fontFamily: fonts.medium }}>
                  {showServer ? t('Hide server settings') : t('Server settings')}
                </Text>
              </Pressable>
              {showServer ? (
                <Card>
                  <TextField label={t('Server address')} value={address} onChangeText={setAddress} autoCapitalize="none"
                    hint={t('Only change this if you were given a different server address.')} />
                  <ConnectionCheck server={normalizeServer(address) || server} />
                </Card>
              ) : null}
            </>
          ) : null}
        </Animated.View>
      </View>
    </Page>
  );
}

/** Email a 6-digit code, then choose a new password with it. */
function ForgotPassword({ server, onDone }: { server: string; onDone: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'password' | 'repeat' | 'email'>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const client = new AttachLogClient({ server });

  const send = async () => {
    setFailure(null);
    if (!email.includes('@')) { setErrors({ email: t('Enter your email address.') }); return; }
    setErrors({});
    setBusy(true);
    try {
      await client.forgotPassword(email.trim());
      setInfo(t('If this address has an account, a 6-digit code was sent. If nothing arrives, ask your coordinator or the administrator for a temporary password.'));
      setStep('code');
    } catch (e) { setFailure(friendlyMessage(e)); }
    setBusy(false);
  };

  const reset = async () => {
    setFailure(null);
    const found = validateNewPassword(password, repeat);
    setErrors(found);
    if (hasErrors(found)) return;
    setBusy(true);
    try {
      await client.resetPassword(email.trim(), code.trim(), password);
      onDone();
    } catch (e) { setFailure(friendlyMessage(e)); setBusy(false); }
  };

  return (
    <Page>
      <Title>{t('Reset your password')}</Title>
      {info ? <Notice>{info}</Notice> : null}
      {failure ? <ErrorBanner message={failure} /> : null}
      <Card>
        <TextField label={t('Email')} value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none"
          keyboardType="email-address" editable={step === 'email'} />
        {step === 'code' ? (
          <>
            <TextField label={t('6-digit code')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            <TextField label={t('New password')} value={password} onChangeText={setPassword} error={errors.password}
              secureTextEntry autoCapitalize="none" />
            <TextField label={t('Repeat new password')} value={repeat} onChangeText={setRepeat} error={errors.repeat}
              secureTextEntry autoCapitalize="none" />
          </>
        ) : null}
        <Button title={step === 'email' ? t('Send me a code') : t('Save new password')} onPress={step === 'email' ? send : reset} loading={busy} />
      </Card>
      <Button title={t('Back to sign in')} variant="ghost" onPress={onDone} />
    </Page>
  );
}
