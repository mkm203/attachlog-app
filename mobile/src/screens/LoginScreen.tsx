import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttachLogClient } from '../api/client';
import { SERVER_LOCKED, SHOW_SERVER_SETTINGS, normalizeServer } from '../api/config';
import { friendlyMessage } from '../api/errors';
import { t } from '../i18n';
import { hasErrors, validateLogin, validateNewPassword, validateRegister } from '../lib/validation';
import type { FieldErrors } from '../lib/validation';
import { useSession } from '../state/session';
import { Button, Card, ErrorBanner, HeroBand, Notice, Page, TextField, Title } from '../ui/kit';
import { colors } from '../ui/theme';
import { LanguageChips } from '../ui/LanguageChips';
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

  // Wake a sleeping free server while the person types, so the first sign-in is not slow.
  useEffect(() => { void new AttachLogClient({ server }).health(); }, [server]);

  const go = (next: Mode) => { setMode(next); setErrors({}); setFailure(null); };

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

  return (
    <Page flush>
      <HeroBand top={insets.top + 12} bottom={56}>
        <View style={{ gap: 12, alignItems: 'flex-start' }}>
          <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Image source={require('../../assets/splash-icon.png')} style={{ width: 56, height: 56 }} accessibilityLabel="AttachLog logo" />
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: -0.8 }}>AttachLog</Text>
          <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 16, maxWidth: 300 }}>
            {t('Internship logbook for students, schools and companies')}
          </Text>
        </View>
      </HeroBand>

      <View style={{ marginTop: -28, backgroundColor: colors.sheet, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 24, gap: 16, paddingBottom: 32 }}>
        {notice ? <Notice>{notice}</Notice> : null}
        {failure ? <ErrorBanner message={failure} /> : null}

        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>
            {mode === 'login' ? t('Sign in') : t('Create account')}
          </Text>
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
              <Pressable accessibilityRole="button" onPress={() => setAsStudent((v) => !v)}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: asStudent ? colors.accent : colors.border, backgroundColor: asStudent ? colors.accentSoft : colors.cardAlt }}>
                <Text style={{ color: asStudent ? colors.accent : colors.text, fontWeight: '700', fontSize: 15 }}>
                  {asStudent ? `✓ ${t('Signing up as student')}` : t('Sign up as student')}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{t('Add your field of study and specialty to help your coordinator place you.')}</Text>
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
            <Pressable accessibilityRole="button" onPress={() => go('forgot')} style={{ paddingVertical: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center' }}>{t('Forgot your password?')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable accessibilityRole="button" onPress={() => go(mode === 'login' ? 'register' : 'login')} style={{ paddingVertical: 8 }}>
          <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '800', textAlign: 'center' }}>
            {mode === 'login' ? t('New here? Create an account with a code') : t('I already have an account')}
          </Text>
        </Pressable>

        <View style={{ alignItems: 'center' }}><LanguageChips /></View>

        <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>
          {server.replace(/^https?:\/\//, '')}
        </Text>

        {SHOW_SERVER_SETTINGS ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => setShowServer((v) => !v)} style={{ paddingVertical: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center' }}>
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
