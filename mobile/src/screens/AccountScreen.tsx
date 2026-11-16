import { useState } from 'react';
import { View } from 'react-native';

import { SHOW_SERVER_SETTINGS, normalizeServer } from '../api/config';
import { friendlyMessage } from '../api/errors';
import { t } from '../i18n';
import { hasErrors, validateNewPassword } from '../lib/validation';
import type { FieldErrors } from '../lib/validation';
import { contextLabel } from '../state/account';
import { useSession, useUser } from '../state/session';
import { useTheme } from '../state/theme';
import type { ThemePreference } from '../state/theme';
import { LanguageChips } from '../ui/LanguageChips';
import { Body, Button, Card, Chip, ErrorBanner, Notice, Page, SectionTitle, TextField, Title } from '../ui/kit';
import { ConnectionCheck } from './ConnectionCheck';

export function AccountScreen() {
  const user = useUser();
  const theme = useTheme();
  const { api, server, setServer, signOut, switchContext, updateMe } = useSession();
  const [address, setAddress] = useState(server);
  const [saved, setSaved] = useState(false);

  const [code, setCode] = useState('');
  const [joinMsg, setJoinMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [joining, setJoining] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [pwErrors, setPwErrors] = useState<FieldErrors<'password' | 'repeat'>>({});
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [changing, setChanging] = useState(false);

  const save = async () => {
    await setServer(address);
    setAddress(normalizeServer(address) || server);
    setSaved(true);
  };

  const join = async () => {
    setJoinMsg(null);
    setJoining(true);
    try {
      updateMe(await api.redeem(code.trim()));
      setCode('');
      setJoinMsg({ ok: true, text: t('Done. The new role is in the list above.') });
    } catch (e) {
      setJoinMsg({ ok: false, text: friendlyMessage(e) });
    }
    setJoining(false);
  };

  const changePassword = async () => {
    setPwMsg(null);
    const found = validateNewPassword(next, repeat);
    setPwErrors(found);
    if (hasErrors(found)) return;
    setChanging(true);
    try {
      await api.changePassword(current, next);
      setCurrent(''); setNext(''); setRepeat('');
      setPwMsg({ ok: true, text: t('Password changed.') });
    } catch (e) {
      setPwMsg({ ok: false, text: friendlyMessage(e) });
    }
    setChanging(false);
  };

  return (
    <Page>
      <Card>
        <Title>{user.name}</Title>
        <Body muted>{user.email}</Body>
        {user.contextLabel ? <Body bold>{user.contextLabel}</Body> : null}
      </Card>

      {user.contexts.length > 1 ? (
        <>
          <SectionTitle>{t('Act as')}</SectionTitle>
          <Card>
            <Body muted>{t('You have several roles. Pick the one to use now.')}</Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {user.contexts.map((m) => (
                <Chip key={m.id} selected={m.id === user.activeId} onPress={() => switchContext(m.id)}
                  label={contextLabel(m)} />
              ))}
            </View>
          </Card>
        </>
      ) : null}

      <SectionTitle>{t('Join with a code')}</SectionTitle>
      <Card>
        <Body muted>{t('Got an invitation, or a code from another school? Enter it to add that role to this account.')}</Body>
        {joinMsg ? (joinMsg.ok ? <Notice>{joinMsg.text}</Notice> : <ErrorBanner message={joinMsg.text} />) : null}
        <TextField label={t('Code')} value={code} onChangeText={setCode} autoCapitalize="none" />
        <Button title={t('Join')} variant="ghost" onPress={join} loading={joining} disabled={code.trim().length < 4} />
      </Card>

      <SectionTitle>{t('Password')}</SectionTitle>
      <Card>
        {pwMsg ? (pwMsg.ok ? <Notice>{pwMsg.text}</Notice> : <ErrorBanner message={pwMsg.text} />) : null}
        <TextField label={t('Current password')} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
        <TextField label={t('New password')} value={next} onChangeText={setNext} error={pwErrors.password} secureTextEntry autoCapitalize="none" />
        <TextField label={t('Repeat new password')} value={repeat} onChangeText={setRepeat} error={pwErrors.repeat} secureTextEntry autoCapitalize="none" />
        <Button title={t('Change password')} variant="ghost" onPress={changePassword} loading={changing} disabled={!current || !next} />
      </Card>

      <SectionTitle>{t('Appearance')}</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['system', 'light', 'dark'] as ThemePreference[]).map((p) => (
            <Chip key={p} selected={theme.preference === p} onPress={() => theme.choose(p)}
              label={p === 'system' ? t('System') : p === 'light' ? t('Light') : t('Dark')} />
          ))}
        </View>
      </Card>

      <SectionTitle>{t('Language')}</SectionTitle>
      <Card>
        <LanguageChips />
      </Card>

      {SHOW_SERVER_SETTINGS ? (
        <>
      <SectionTitle>{t('Server')}</SectionTitle>
      <Card>
        <TextField label={t('Server address')} value={address} onChangeText={(t) => { setAddress(t); setSaved(false); }}
          autoCapitalize="none" hint={saved ? t('Saved. Pull down on any list to reload.') : t('Only change this if you were given a different address.')} />
        <Button title={t('Save address')} variant="ghost" onPress={save} disabled={normalizeServer(address) === server} />
        <ConnectionCheck server={normalizeServer(address) || server} />
      </Card>
        </>
      ) : null}

      <View style={{ marginTop: 8 }}>
        <Button title={t('Sign out')} variant="danger" onPress={() => signOut()} />
      </View>
    </Page>
  );
}
