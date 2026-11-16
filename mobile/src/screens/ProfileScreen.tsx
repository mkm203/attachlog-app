import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

import { friendlyMessage } from '../api/errors';
import { t } from '../i18n';
import { isEmail } from '../lib/validation';
import { roleLabel } from '../lib/format';
import type { ProfilePerson } from '../nav/Navigator';
import { useNav } from '../nav/Navigator';
import { useSession, useUser } from '../state/session';
import { Avatar, Body, Button, Card, ErrorBanner, Notice, Page, SectionTitle, TextField, Title } from '../ui/kit';
import { colors } from '../ui/theme';

export function ProfileScreen({ userId, person }: { userId?: string; person?: ProfilePerson }) {
  const me = useUser();
  const isMe = !userId || userId === me.sub;
  if (isMe) return <MyProfile />;
  return <ReadOnlyProfile person={person ?? { name: t('Profile') }} />;
}

function ReadOnlyProfile({ person }: { person: ProfilePerson }) {
  const nav = useNav();
  return (
    <Page>
      <Card>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Avatar name={person.name} uri={person.avatar} size={84} />
          <Title>{person.name}</Title>
          {person.role ? <Body muted>{roleLabel(person.role as any)}</Body> : null}
          {person.email ? <Body muted>{person.email}</Body> : null}
        </View>
      </Card>
      {(person.phone || person.field_of_study || person.specialty || person.teaching_field || person.bio) ? (
        <Card>
          {person.phone ? <Fact label={t('Contact')} value={person.phone} /> : null}
          {person.field_of_study ? <Fact label={t('Field of study')} value={person.field_of_study} /> : null}
          {person.specialty ? <Fact label={t('Specialty')} value={person.specialty} /> : null}
          {person.teaching_field ? <Fact label={t('Teaching field')} value={person.teaching_field} /> : null}
          {person.bio ? <Fact label={t('About')} value={person.bio} /> : null}
        </Card>
      ) : <Body muted>{t('No additional profile details yet.')}</Body>}
      <Button title={t('Back')} variant="ghost" onPress={nav.pop} />
    </Page>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>{label}</Text>
      <Body>{value}</Body>
    </View>
  );
}

function MyProfile() {
  const { api, updateMe } = useSession();
  const user = useUser();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [field, setField] = useState(user.field_of_study ?? '');
  const [specialty, setSpecialty] = useState(user.specialty ?? '');
  const [teaching, setTeaching] = useState(user.teaching_field ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [avatar, setAvatar] = useState<string | null>(user.avatar ?? null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailChangePending, setEmailChangePending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const isStudent = user.role === 'student' || user.contexts.some((m) => m.role === 'student');
  const isAcademic = user.role === 'academic_supervisor' || user.contexts.some((m) => m.role === 'academic_supervisor');
  const isCompany = user.role === 'company_supervisor' || user.contexts.some((m) => m.role === 'company_supervisor');

  const save = async () => {
    setMsg(null);
    if (name.trim().length < 2) { setMsg({ ok: false, text: t('Enter your full name.') }); return; }
    setBusy(true);
    try {
      const me = await api.updateProfile({
        name: name.trim(),
        phone: phone.trim() || null,
        field_of_study: field.trim() || null,
        specialty: specialty.trim() || null,
        teaching_field: teaching.trim() || null,
        bio: bio.trim() || null,
        avatar,
      });
      updateMe(me);
      setMsg({ ok: true, text: t('Profile saved.') });
    } catch (e) {
      setMsg({ ok: false, text: friendlyMessage(e) });
    }
    setBusy(false);
  };

  const choosePhoto = async () => {
    setMsg(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.45,
      });
      if (result.canceled) return;
      const photo = result.assets[0];
      if (!photo) {
        setMsg({ ok: false, text: t('Could not read the selected photo.') });
        return;
      }
      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 256 } }],
        { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!resized.base64) {
        setMsg({ ok: false, text: t('Could not read the selected photo.') });
        return;
      }
      const dataUri = `data:image/jpeg;base64,${resized.base64}`;
      if (dataUri.length > 500000) {
        setMsg({ ok: false, text: t('That photo is too large. Choose a smaller image.') });
        return;
      }
      setAvatar(dataUri);
    } catch (e) {
      setMsg({ ok: false, text: friendlyMessage(e) });
    }
  };

  const sendEmailCode = async () => {
    setMsg(null);
    if (!currentPassword) {
      setMsg({ ok: false, text: t('Enter your current password to change your email.') });
      return;
    }
    if (!isEmail(newEmail)) {
      setMsg({ ok: false, text: t('Enter a valid email address.') });
      return;
    }
    setBusy(true);
    try {
      await api.requestEmailChange(currentPassword, newEmail.trim());
      setEmailChangePending(true);
      setMsg({ ok: true, text: t('A verification code was sent to your new email address.') });
    } catch (e) {
      setMsg({ ok: false, text: friendlyMessage(e) });
    }
    setBusy(false);
  };

  const confirmEmail = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const me = await api.confirmEmailChange(emailCode.trim());
      updateMe(me);
      setEmailChangePending(false);
      setCurrentPassword('');
      setNewEmail('');
      setEmailCode('');
      setMsg({ ok: true, text: t('Email address updated.') });
    } catch (e) {
      setMsg({ ok: false, text: friendlyMessage(e) });
    }
    setBusy(false);
  };

  return (
    <Page>
      <Card>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Avatar name={name || user.name} uri={avatar} size={96} />
          <Title>{t('Your profile')}</Title>
          <Body muted>{user.email}</Body>
          <Body muted>{t('Change your login email below after verifying the new address.')}</Body>
        </View>
      </Card>

      {msg ? (msg.ok ? <Notice>{msg.text}</Notice> : <ErrorBanner message={msg.text} />) : null}

      <SectionTitle>{t('Profile')}</SectionTitle>
      <Card>
        <TextField label={t('Full name')} value={name} onChangeText={setName} autoCapitalize="words" />
        <TextField label={t('Contact (phone)')} value={phone} onChangeText={setPhone} keyboardType="default" autoCapitalize="none" />
        {isStudent ? (
          <>
            <TextField label={t('Field of study')} value={field} onChangeText={setField} autoCapitalize="words" />
            <TextField label={t('Specialty / option')} value={specialty} onChangeText={setSpecialty} autoCapitalize="words" />
          </>
        ) : null}
        {isAcademic ? (
          <TextField label={t('Teaching field')} value={teaching} onChangeText={setTeaching} autoCapitalize="words" />
        ) : null}
        <TextField label={t('About')} value={bio} onChangeText={setBio} multiline maxLength={2000} autoCapitalize="sentences"
          hint={isCompany ? t('Company supervisors can share role or department details here.') : undefined} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title={t('Choose photo')} variant="ghost" onPress={choosePhoto} />
          <Button title={avatar ? t('Remove photo') : t('Use initials')} variant="ghost" onPress={() => setAvatar(null)} />
        </View>
        <Body muted>{t('Choose a photo or use your initials. Photos are cropped to a square.')}</Body>
        <Button title={t('Save profile')} onPress={save} loading={busy} />
      </Card>

      <SectionTitle>{t('Login email')}</SectionTitle>
      <Card>
        {!emailChangePending ? (
          <>
            <TextField label={t('Current password')} value={currentPassword} onChangeText={setCurrentPassword}
              secureTextEntry autoCapitalize="none" />
            <TextField label={t('New email')} value={newEmail} onChangeText={setNewEmail}
              keyboardType="email-address" autoCapitalize="none" />
            <Button title={t('Send verification code')} onPress={sendEmailCode} loading={busy} />
          </>
        ) : (
          <>
            <TextField label={t('Verification code')} value={emailCode} onChangeText={setEmailCode}
              keyboardType="number-pad" maxLength={6} />
            <Button title={t('Verify and change email')} onPress={confirmEmail} loading={busy} />
            <Button title={t('Cancel email change')} variant="ghost" onPress={() => {
              setEmailChangePending(false);
              setCurrentPassword('');
              setNewEmail('');
              setEmailCode('');
            }} />
          </>
        )}
      </Card>
    </Page>
  );
}
