import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import type { Member, Placement, PlacementInput } from '../api/types';
import { t } from '../i18n';
import { formatDate } from '../lib/format';
import {
  hasErrors, isEmail, isIsoDate, validateEvaluation, validateSupervisors, weeksBetween,
} from '../lib/validation';
import type { FieldErrors } from '../lib/validation';
import { useNav } from '../nav/Navigator';
import { useSession, useUser } from '../state/session';
import { useAsync } from '../state/useAsync';
import { DateField } from '../ui/DateField';
import { Avatar, Body, Button, Card, Chip, ErrorBanner, Notice, Page, Row, SectionTitle, TextField } from '../ui/kit';
import { colors } from '../ui/theme';

type MultiPlacementForm = {
  student_ids: string[];
  supervisor_by_student: Record<string, string>;
  company_name: string;
  company_city: string;
  company_supervisor_email: string;
  start_date: string;
  end_date: string;
};

const EMPTY: MultiPlacementForm = {
  student_ids: [], supervisor_by_student: {}, company_name: '', company_city: '',
  company_supervisor_email: '', start_date: '', end_date: '',
};

function groupLabel(m: Member): string {
  const field = (m.field_of_study || '').trim();
  const spec = (m.specialty || '').trim();
  if (field && spec) return `${field} · ${spec}`;
  return field || spec || t('Other / not specified');
}

/** Pick one person from the school's members: a search box and a short list of matches. */
function SupervisorPicker({ label, value, onChange, error }: {
  label: string; value: string; onChange: (id: string) => void; error?: string;
}) {
  const { api } = useSession();
  const user = useUser();
  const [query, setQuery] = useState('');
  const state = useAsync(
    () => (user.schoolId ? api.members(user.schoolId, 'academic_supervisor') : Promise.resolve([] as Member[])),
    [api, user.schoolId],
  );
  const people = state.data ?? [];
  const chosen = people.find((m) => m.user_id === value);
  const q = query.trim().toLowerCase();
  const shown = people.filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)).slice(0, 8);

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
            <Body muted>{t('No academic supervisors yet. Invite one from the School tab.')}</Body>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {shown.map((m) => <Chip key={m.user_id} label={m.name} selected={false} onPress={() => onChange(m.user_id)} />)}
          </View>
        </>
      )}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </View>
  );
}

/** Multi-select students grouped by field of study / specialty for easy batch assignment. */
function StudentGroupPicker({ selected, onChange, supervisorByStudent, onAssignSupervisor, error, assignmentError }: {
  selected: string[];
  onChange: (ids: string[]) => void;
  supervisorByStudent: Record<string, string>;
  onAssignSupervisor: (studentIds: string[], supervisorId: string) => void;
  error?: string;
  assignmentError?: string;
}) {
  const { api } = useSession();
  const user = useUser();
  const [query, setQuery] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const state = useAsync(
    () => (user.schoolId ? api.members(user.schoolId, 'student') : Promise.resolve([] as Member[])),
    [api, user.schoolId],
  );
  const people = state.data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = people.filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.field_of_study || '').toLowerCase().includes(q) || (m.specialty || '').toLowerCase().includes(q));
  const groups = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const m of filtered) {
      const k = groupLabel(m);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const selectedPeople = people.filter((m) => selected.includes(m.user_id));

  return (
    <View style={{ gap: 8 }}>
      <Body bold>{t('Students')}</Body>
      <Body muted>{t('Students are grouped by field of study and specialty. Select one or more to create placements in one go.')}</Body>
      <TextField label={t('Search students or fields')} value={query} onChangeText={setQuery} autoCapitalize="none" />
      {state.loading && !state.data ? <Body muted>{t('Loading…')}</Body> : null}
      {!state.loading && people.length === 0 ? (
        <Body muted>{t('No students have joined yet. Share your join code from the School tab.')}</Body>
      ) : null}
      {selectedPeople.length ? (
        <View style={{ gap: 6 }}>
          <Body bold>{t('{n} selected', { n: selectedPeople.length })}</Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {selectedPeople.map((m) => <Chip key={m.user_id} label={`${m.name} ✓`} selected onPress={() => toggle(m.user_id)} />)}
          </View>
        </View>
      ) : null}
      {groups.map(([label, members]) => {
        const open = openGroup === label || !!q;
        const allSelected = members.every((m) => selected.includes(m.user_id));
        const selectedInGroup = members.filter((m) => selected.includes(m.user_id));
        const firstSupervisor = selectedInGroup.length ? supervisorByStudent[selectedInGroup[0]!.user_id] : undefined;
        const sameSupervisor = !!firstSupervisor
          && selectedInGroup.every((m) => supervisorByStudent[m.user_id] === firstSupervisor);
        return (
          <Card key={label}>
            <Row>
              <View style={{ flex: 1 }}>
                <Body bold>{label}</Body>
                <Body muted>{t('{n} students', { n: members.length })}</Body>
              </View>
              <Chip label={open ? t('Hide') : t('Show')} selected={open} onPress={() => setOpenGroup(open ? null : label)} />
            </Row>
            {open ? (
              <View style={{ gap: 8 }}>
                <Button title={allSelected ? t('Clear group') : t('Select all in group')} variant="ghost"
                  onPress={() => {
                    if (allSelected) onChange(selected.filter((id) => !members.some((m) => m.user_id === id)));
                    else onChange(Array.from(new Set([...selected, ...members.map((m) => m.user_id)])));
                  }} />
                {members.map((m) => (
                  <Card key={m.user_id} onPress={() => toggle(m.user_id)} label={m.name}>
                    <Row gap={10}>
                      <Avatar name={m.name} uri={m.avatar} size={40} />
                      <View style={{ flex: 1 }}>
                        <Body bold>{m.name}</Body>
                        <Body muted>{[m.field_of_study, m.specialty].filter(Boolean).join(' · ') || m.email}</Body>
                      </View>
                      <View><Body bold>{selected.includes(m.user_id) ? '✓' : '+'}</Body></View>
                    </Row>
                  </Card>
                ))}
                {selectedInGroup.length ? (
                  <>
                    {!sameSupervisor && selectedInGroup.some((m) => supervisorByStudent[m.user_id]) ? (
                      <Body muted>{t('Students in this group have different supervisors.')}</Body>
                    ) : null}
                    <SupervisorPicker
                      label={t('Academic supervisor for {n} selected students', { n: selectedInGroup.length })}
                      value={sameSupervisor ? firstSupervisor : ''}
                      onChange={(supervisorId) => onAssignSupervisor(selectedInGroup.map((m) => m.user_id), supervisorId)}
                    />
                  </>
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {assignmentError ? <Body style={{ color: colors.danger }}>{assignmentError}</Body> : null}
    </View>
  );
}

function validateMulti(form: MultiPlacementForm): FieldErrors<keyof MultiPlacementForm> {
  const errors: FieldErrors<keyof MultiPlacementForm> = {};
  if (!form.student_ids.length) errors.student_ids = t('Choose at least one student.');
  if (form.student_ids.some((id) => !form.supervisor_by_student[id])) {
    errors.supervisor_by_student = t('Choose an academic supervisor for each student group.');
  }
  if (!form.company_name.trim()) errors.company_name = t('Enter the company name.');
  if (!form.company_city.trim()) errors.company_city = t('Enter the company city.');
  if (!isEmail(form.company_supervisor_email)) errors.company_supervisor_email = t("Enter the supervisor's email address.");
  if (!isIsoDate(form.start_date.trim())) errors.start_date = t('Choose the start date.');
  if (!isIsoDate(form.end_date.trim())) errors.end_date = t('Choose the end date.');
  if (!errors.start_date && !errors.end_date && form.end_date.trim() <= form.start_date.trim()) {
    errors.end_date = t('The end date must be after the start date.');
  }
  return errors;
}

/** Coordinator: create placement(s). Supports selecting multiple students for batch assignment. */
export function PlacementFormScreen() {
  const { api } = useSession();
  const user = useUser();
  const nav = useNav();
  const [form, setForm] = useState<MultiPlacementForm>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<keyof MultiPlacementForm>>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof MultiPlacementForm) => (text: string) => setForm((f) => ({ ...f, [key]: text as any }));
  const school = useAsync(
    () => (user.schoolId ? api.school(user.schoolId) : Promise.resolve(null)),
    [api, user.schoolId],
  );
  const term = school.data?.school;
  const datesOk = isIsoDate(form.start_date.trim()) && isIsoDate(form.end_date.trim())
    && form.end_date.trim() > form.start_date.trim();

  const submit = async () => {
    const found = validateMulti(form);
    setErrors(found);
    setFailure(null);
    setNotice(null);
    if (hasErrors(found)) return;
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const student_id of form.student_ids) {
      try {
        const input: PlacementInput = {
          ...(user.schoolId ? { school_id: user.schoolId } : {}),
          student_id,
          academic_supervisor_id: form.supervisor_by_student[student_id]!,
          company_name: form.company_name.trim(),
          company_city: form.company_city.trim(),
          company_supervisor_email: form.company_supervisor_email.trim().toLowerCase(),
          start_date: form.start_date.trim(),
          end_date: form.end_date.trim(),
        };
        await api.createPlacement(input);
        ok += 1;
      } catch (e) {
        failed.push(student_id);
      }
    }
    nav.refresh();
    if (failed.length === 0) {
      nav.pop();
    } else {
      setBusy(false);
      setNotice(t('{ok} placements created, {fail} failed. You can adjust and try again for the remaining students.', { ok, fail: failed.length }));
      setForm((f) => ({ ...f, student_ids: failed }));
      if (ok === 0) setFailure(new Error(t('Could not create placements. Check the details and try again.')));
    }
  };

  return (
    <Page>
      {failure ? <ErrorBanner error={failure} /> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      <StudentGroupPicker
        selected={form.student_ids}
        onChange={(ids) => setForm((f) => ({ ...f, student_ids: ids }))}
        supervisorByStudent={form.supervisor_by_student}
        onAssignSupervisor={(ids, supervisorId) => setForm((f) => {
          const supervisor_by_student = { ...f.supervisor_by_student };
          ids.forEach((id) => { supervisor_by_student[id] = supervisorId; });
          return { ...f, supervisor_by_student };
        })}
        error={errors.student_ids as string | undefined}
        assignmentError={errors.supervisor_by_student as string | undefined}
      />
      <Card>
        <TextField label={t('Company')} value={form.company_name} onChangeText={set('company_name')}
          error={errors.company_name as string | undefined} autoCapitalize="words" />
        <TextField label={t('City')} value={form.company_city} onChangeText={set('company_city')}
          error={errors.company_city as string | undefined} autoCapitalize="words" />
        <TextField label={t("Company supervisor's email")} value={form.company_supervisor_email}
          onChangeText={set('company_supervisor_email')} error={errors.company_supervisor_email as string | undefined}
          autoCapitalize="none" keyboardType="email-address"
          hint={t('If they have no account yet, you get a code to send them.')} />
        <DateField label={t('Start date')} value={form.start_date} onChange={set('start_date')}
          error={errors.start_date as string | undefined} min={term?.term_start} max={term?.term_end} />
        <DateField label={t('End date')} value={form.end_date} onChange={set('end_date')}
          error={errors.end_date as string | undefined} min={form.start_date || term?.term_start} max={term?.term_end}
          hint={datesOk ? t('{n} weeks', { n: weeksBetween(form.start_date.trim(), form.end_date.trim()) }) : term ? t('The term runs {a} to {b}.', { a: formatDate(term.term_start), b: formatDate(term.term_end) }) : undefined} />
        <Button title={form.student_ids.length > 1 ? t('Create {n} placements', { n: form.student_ids.length }) : t('Create placement')} onPress={submit} loading={busy} />
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
        <SupervisorPicker label={t('Academic supervisor')} value={academic} onChange={setAcademic}
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
