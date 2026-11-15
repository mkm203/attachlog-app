import { useState } from 'react';
import { Alert, View } from 'react-native';

import type { Member, Placement, PlacementInput } from '../api/types';
import { t } from '../i18n';
import { formatDate } from '../lib/format';
import {
  hasErrors, isIsoDate, validateEvaluation, validatePlacement, validateSupervisors, weeksBetween,
} from '../lib/validation';
import type { FieldErrors, PlacementForm } from '../lib/validation';
import { useNav } from '../nav/Navigator';
import { useSession, useUser } from '../state/session';
import { useAsync } from '../state/useAsync';
import { DateField } from '../ui/DateField';
import { Body, Button, Card, Chip, ErrorBanner, Page, Row, TextField } from '../ui/kit';

const EMPTY: PlacementForm = {
  student_id: '', academic_supervisor_id: '', company_name: '', company_city: '',
  company_supervisor_email: '', start_date: '', end_date: '',
};

/** Pick one person from the school's members: a search box and a short list of matches. */
function PersonPicker({ label, role, value, onChange, error }: {
  label: string; role: 'student' | 'academic_supervisor'; value: string; onChange: (id: string) => void; error?: string;
}) {
  const { api } = useSession();
  const user = useUser();
  const [query, setQuery] = useState('');
  const state = useAsync(
    () => (user.schoolId ? api.members(user.schoolId, role) : Promise.resolve([] as Member[])),
    [api, user.schoolId, role],
  );
  const people = state.data ?? [];
  const chosen = people.find((m) => m.user_id === value);
  const q = query.trim().toLowerCase();
  const shown = people.filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)).slice(0, 6);

  return (
    <View style={{ gap: 6 }}>
      <Body bold>{label}</Body>
      {chosen ? (
        <Row>
          <Chip label={`${chosen.name} ✓`} selected onPress={() => onChange('')} />
          <Body muted>{t('tap to change')}</Body>
        </Row>
      ) : (
        <>
          <TextField label={t('Search by name or email')} value={query} onChangeText={setQuery} autoCapitalize="none" />
          {state.loading && !state.data ? <Body muted>{t('Loading…')}</Body> : null}
          {!state.loading && people.length === 0 ? (
            <Body muted>{role === 'student' ? t('No students have joined yet. Share your join code from the School tab.') : t('No academic supervisors yet. Invite one from the School tab.')}</Body>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {shown.map((m) => <Chip key={m.user_id} label={m.name} selected={false} onPress={() => onChange(m.user_id)} />)}
          </View>
        </>
      )}
      {error ? <Body>{error}</Body> : null}
    </View>
  );
}

/** Coordinator: create a placement. The server also checks the dates against the school's term. */
export function PlacementFormScreen() {
  const { api } = useSession();
  const user = useUser();
  const nav = useNav();
  const [form, setForm] = useState<PlacementForm>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<keyof PlacementForm>>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof PlacementForm) => (text: string) => setForm((f) => ({ ...f, [key]: text }));
  // the school's term limits the calendar, so only dates the server will accept can be picked
  const school = useAsync(
    () => (user.schoolId ? api.school(user.schoolId) : Promise.resolve(null)),
    [api, user.schoolId],
  );
  const term = school.data?.school;
  const datesOk = isIsoDate(form.start_date.trim()) && isIsoDate(form.end_date.trim())
    && form.end_date.trim() > form.start_date.trim();

  const submit = async () => {
    const found = validatePlacement(form);
    setErrors(found);
    setFailure(null);
    if (hasErrors(found)) return;
    setBusy(true);
    try {
      const input: PlacementInput = {
        ...(user.schoolId ? { school_id: user.schoolId } : {}),
        student_id: form.student_id,
        academic_supervisor_id: form.academic_supervisor_id,
        company_name: form.company_name.trim(),
        company_city: form.company_city.trim(),
        company_supervisor_email: form.company_supervisor_email.trim().toLowerCase(),
        start_date: form.start_date.trim(),
        end_date: form.end_date.trim(),
      };
      await api.createPlacement(input);
      nav.refresh();
      nav.pop();
    } catch (e) {
      setFailure(e);
      setBusy(false);
    }
  };

  return (
    <Page>
      {failure ? <ErrorBanner error={failure} /> : null}
      <Card>
        <PersonPicker label={t('Student')} role="student" value={form.student_id} onChange={set('student_id')} error={errors.student_id} />
        <PersonPicker label={t('Academic supervisor')} role="academic_supervisor" value={form.academic_supervisor_id}
          onChange={set('academic_supervisor_id')} error={errors.academic_supervisor_id} />
        <TextField label={t('Company')} value={form.company_name} onChangeText={set('company_name')}
          error={errors.company_name} autoCapitalize="words" />
        <TextField label={t('City')} value={form.company_city} onChangeText={set('company_city')}
          error={errors.company_city} autoCapitalize="words" />
        <TextField label={t("Company supervisor's email")} value={form.company_supervisor_email}
          onChangeText={set('company_supervisor_email')} error={errors.company_supervisor_email}
          autoCapitalize="none" keyboardType="email-address"
          hint={t('If they have no account yet, you get a code to send them.')} />
        <DateField label={t('Start date')} value={form.start_date} onChange={set('start_date')}
          error={errors.start_date} min={term?.term_start} max={term?.term_end} />
        <DateField label={t('End date')} value={form.end_date} onChange={set('end_date')}
          error={errors.end_date} min={form.start_date || term?.term_start} max={term?.term_end}
          hint={datesOk ? t('{n} weeks', { n: weeksBetween(form.start_date.trim(), form.end_date.trim()) }) : term ? t('The term runs {a} to {b}.', { a: formatDate(term.term_start), b: formatDate(term.term_end) }) : undefined} />
        <Button title={t('Create placement')} onPress={submit} loading={busy} />
      </Card>
    </Page>
  );
}

/** Coordinator: change the supervisors of an open placement. */
export function SupervisorsFormScreen({ placement }: { placement: Placement }) {
  const { api } = useSession();
  const nav = useNav();
  const [academic, setAcademic] = useState(placement.academic_supervisor_id);
  const [company, setCompany] = useState(placement.company_supervisor_email);
  const [errors, setErrors] = useState<FieldErrors<'academic' | 'company'>>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const found = validateSupervisors(academic, company);
    setErrors(found);
    setFailure(null);
    if (hasErrors(found)) return;
    setBusy(true);
    try {
      await api.updateSupervisors(placement.id, {
        academic_supervisor_id: academic, company_supervisor_email: company.trim().toLowerCase(),
      });
      nav.refresh();
      nav.pop();
    } catch (e) {
      setFailure(e);
      setBusy(false);
    }
  };

  return (
    <Page>
      {failure ? <ErrorBanner error={failure} /> : null}
      <Card>
        <Body muted>{placement.student_name} · {placement.company_name}</Body>
        <PersonPicker label={t('Academic supervisor')} role="academic_supervisor" value={academic} onChange={setAcademic}
          error={errors.academic} />
        <TextField label={t("Company supervisor's email")} value={company} onChangeText={setCompany} error={errors.company}
          autoCapitalize="none" keyboardType="email-address"
          hint={t('A supervisor without an account yet is linked as soon as they join with their invitation code.')} />
        <Button title={t('Save supervisors')} onPress={submit} loading={busy} />
      </Card>
    </Page>
  );
}

/** Coordinator: close the placement and record the final evaluation (score out of 20 and a comment). */
export function CloseFormScreen({ placement }: { placement: Placement }) {
  const { api } = useSession();
  const nav = useNav();
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'score' | 'comment'>>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const close = async () => {
    setBusy(true);
    try {
      await api.closePlacement(placement.id, { score: Number(score), comment: comment.trim() });
      nav.refresh();
      nav.pop();
    } catch (e) {
      setFailure(e);
      setBusy(false);
    }
  };

  const submit = () => {
    const found = validateEvaluation(score, comment);
    setErrors(found);
    setFailure(null);
    if (hasErrors(found)) return;
    Alert.alert(
      t('Close this placement?'),
      t('No more entries can be added and the evaluation cannot be changed.'),
      [{ text: t('Cancel'), style: 'cancel' }, { text: t('Close placement'), style: 'destructive', onPress: close }],
    );
  };

  return (
    <Page>
      {failure ? <ErrorBanner error={failure} /> : null}
      <Card>
        <Body muted>{placement.student_name} · {placement.company_name}</Body>
        <TextField label={t('Final score (out of 20)')} value={score} onChangeText={setScore} error={errors.score}
          keyboardType="number-pad" />
        <TextField label={t('Evaluation comment')} value={comment} onChangeText={setComment} error={errors.comment}
          multiline maxLength={1000} autoCapitalize="sentences" />
        <Button title={t('Close placement')} variant="danger" onPress={submit} loading={busy} />
      </Card>
    </Page>
  );
}
