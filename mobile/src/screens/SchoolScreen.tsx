import { useState } from 'react';
import { Share, View } from 'react-native';

import type { Grant, Member } from '../api/types';
import { friendlyMessage } from '../api/errors';
import { t } from '../i18n';
import { formatDate } from '../lib/format';
import { isEmail } from '../lib/validation';
import { useNav } from '../nav/Navigator';
import { useSession, useUser } from '../state/session';
import { useAsync } from '../state/useAsync';
import { AsyncPage, Avatar, Body, Button, Card, Empty, ErrorBanner, Notice, Row, SectionTitle, TextField, Title } from '../ui/kit';


/** Coordinator: the school's join code, invitations for academic supervisors, and who has joined. */
export function SchoolScreen() {
  const { api } = useSession();
  const user = useUser();
  const nav = useNav();
  const state = useAsync(
    () => (user.schoolId ? api.school(user.schoolId) : Promise.reject(new Error('No school selected'))),
    [api, user.schoolId, nav.revision],
  );

  return (
    <AsyncPage state={state}>
      {({ school, members, invites }) => {
        const staff = members.filter((m) => m.role === 'academic_supervisor');
        const students = members.filter((m) => m.role === 'student');
        const coordinators = members.filter((m) => m.role === 'coordinator');
        return (
          <>
            <Card>
              <Title>{school.name}</Title>
              <Body muted>{school.city} · {t('term {a} to {b}', { a: formatDate(school.term_start), b: formatDate(school.term_end) })}</Body>
            </Card>

            <SectionTitle>{t('Student join code')}</SectionTitle>
            <Card>
              <Body muted>{t('Give this code to your students. They choose “Create an account” in the app and type it in.')}</Body>
              <Code value={school.join_code} />
              <Button title={t('Share the code')} variant="ghost"
                onPress={() => void Share.share({ message: t('Join {school} on AttachLog: install the app, choose “Create an account” and use the code {code}.', { school: school.name, code: school.join_code }) })} />
            </Card>

            <InviteForm schoolId={school.id} onDone={nav.refresh} />

            {invites.length ? (
              <>
                <SectionTitle>{t('Waiting for an account ({n})', { n: invites.length })}</SectionTitle>
                {invites.map((i) => (
                  <Card key={i.code}>
                    <Body bold>{i.email}</Body>
                    <Code value={i.code} />
                    <Body muted>{t('Expires {date}', { date: formatDate(i.expires_at) })}</Body>
                  </Card>
                ))}
              </>
            ) : null}

            <SectionTitle>{t('Academic supervisors ({n})', { n: staff.length })}</SectionTitle>
            {staff.length === 0 ? <Empty title={t('None yet')} hint={t('Invite them above.')} /> : <People list={staff} />}
            <SectionTitle>{t('Students ({n})', { n: students.length })}</SectionTitle>
            {students.length === 0 ? <Empty title={t('No students yet')} hint={t('Share the join code.')} /> : <People list={students} />}
            <SectionTitle>{t('Coordinators ({n})', { n: coordinators.length })}</SectionTitle>
            <People list={coordinators} />
          </>
        );
      }}
    </AsyncPage>
  );
}

function People({ list }: { list: Member[] }) {
  return (
    <Card>
      {list.map((m) => (
        <View key={m.user_id + m.role} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Avatar name={m.name} uri={m.avatar} size={40} />
          <View style={{ flex: 1 }}>
            <Body bold>{m.name}</Body>
            <Body muted>{m.email}</Body>
            {m.role === 'student' && (m.field_of_study || m.specialty) ? (
              <Body muted>{[m.field_of_study, m.specialty].filter(Boolean).join(' · ')}</Body>
            ) : null}
            {m.role === 'academic_supervisor' && m.teaching_field ? <Body muted>{m.teaching_field}</Body> : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

function Code({ value }: { value: string }) {
  return (
    <Row>
      <View style={{ backgroundColor: '#FFF6DD', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#F5B83D' }}>
        <Body bold>{value}</Body>
      </View>
    </Row>
  );
}

function InviteForm({ schoolId, onDone }: { schoolId: string; onDone: () => void }) {
  const { api } = useSession();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Grant | null>(null);
  const [busy, setBusy] = useState(false);

  const invite = async () => {
    setError(null);
    setResult(null);
    if (!isEmail(email)) { setError(t('Enter a valid email address.')); return; }
    setBusy(true);
    try {
      const grant = await api.inviteAcademicSupervisor(schoolId, email.trim());
      setResult(grant);
      setEmail('');
      onDone();
    } catch (e) {
      setError(friendlyMessage(e));
    }
    setBusy(false);
  };

  return (
    <>
      <SectionTitle>{t('Invite an academic supervisor')}</SectionTitle>
      <Card>
        {error ? <ErrorBanner message={error} /> : null}
        {result?.status === 'member' ? <Notice>{t('{email} already had an account and was added.', { email: result.email })}</Notice> : null}
        {result?.invite ? (
          <View style={{ gap: 6 }}>
            <Notice>
              {result.email_sent
                ? t('Invitation created for {email}. It was also sent by email.', { email: result.email })
                : t('Invitation created for {email}. Send them this code yourself:', { email: result.email })}
            </Notice>
            <Code value={result.invite.code} />
            <Button title={t('Share the code')} variant="ghost"
              onPress={() => void Share.share({ message: t('You are invited to AttachLog as an academic supervisor. Install the app, choose “Create an account”, use the email {email} and this code: {code}', { email: result.email, code: result.invite!.code }) })} />
          </View>
        ) : null}
        <TextField label={t('Email address')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
          hint={t('They create their account with the code, using this same address.')} />
        <Button title={t('Invite')} onPress={invite} loading={busy} />
      </Card>
    </>
  );
}

