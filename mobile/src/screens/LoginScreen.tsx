import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttachLogClient } from '../api/client';
import { SERVER_LOCKED, SHOW_SERVER_SETTINGS, normalizeServer } from '../api/config';
import { friendlyMessage } from '../api/errors';
import { t } from '../i18n';
import { hasErrors, validateLogin, validateNewPassword, validateRegister } from '../lib/validation';
import type { FieldErrors } from '../lib/validation';
import { useSession } from '../state/session';
import { Button, Card, ErrorBanner, Marked, Notice, Page, TextField, Title } from '../ui/kit';
import { fonts } from '../ui/fonts';
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
  const [address, setAddress] = useState(server);
  const [showServer, setShowServer] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<'name' | 'email' | 'password' | 'code'>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (next: Mode) => { setMode(next); setErrors({}); setFailure(null); };

  const submit = async () => {
    const found = mode === 'login' ? validateLogin(email, password) : validateRegister({ name, email, password, code });
    setErrors(found);
    setFailure(null);
    if (hasErrors(found)) return;
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password, address);
      else await register({ name, email, password, code }, address);
    } catch (e) {
      setFailure(friendlyMessage(e));
      setBusy(false);
    }
  };

  if (mode === 'forgot') {
    return (
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
        <ForgotPassword server={SERVER_LOCKED ? server : normalizeServer(address) || server} onDone={() => go('login')} />
      </View>
    );
  }

  return (
    <Page flush>
      <View style={{ paddingTop: insets.top + 36, paddingBottom: 28, paddingHorizontal: 24, gap: 10 }}>
        <Image source={require('../../assets/splash-icon.png')} style={{ width: 76, height: 76 }} accessibilityLabel="AttachLog logo" />
        <Marked size={38}>AttachLog</Marked>
        <Text style={{ color: colors.muted, fontSize: 16, fontFamily: fonts.display, fontStyle: 'italic', maxWidth: 300 }}>
          {t('Internship logbook for students, schools and companies')}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 16, paddingBottom: 32 }}>
        {notice ? <Notice>{notice}</Notice> : null}
        {failure ? <ErrorBanner message={failure} /> : null}

        <Card>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, fontFamily: fonts.display }}>
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
            <TextField label={t('Code')} value={code} onChangeText={setCode} error={errors.code} autoCapitalize="none"
              hint={t("Students: your school's code. Supervisors and coordinators: the code from your invitation.")} />
          ) : null}
          <Button title={mode === 'login' ? t('Sign in') : t('Create account')} onPress={submit} loading={busy} />
          {mode === 'login' ? (
            <Pressable accessibilityRole="button" onPress={() => go('forgot')} style={{ paddingVertical: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center' }}>{t('Forgot your password?')}</Text>
            </Pressable>
          ) : null}
        </Card>

        <Pressable accessibilityRole="button" onPress={() => go(mode === 'login' ? 'register' : 'login')} style={{ paddingVertical: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>
            {mode === 'login' ? t('New here? Create an account with a code') : t('I already have an account')}
          </Text>
        </Pressable>

        <View style={{ alignItems: 'center' }}><LanguageChips /></View>

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
