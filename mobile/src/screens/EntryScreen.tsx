import { useState } from 'react';
import { View } from 'react-native';

import type { Decision, Entry, Placement, Review } from '../api/types';
import { t } from '../i18n';
import { daysSince, formatDate, statusLabel } from '../lib/format';
import { hasErrors, validateReview } from '../lib/validation';
import type { FieldErrors } from '../lib/validation';
import { useNav } from '../nav/Navigator';
import { useSession, useUser } from '../state/session';
import { useAsync } from '../state/useAsync';
import { AsyncPage, Avatar, Body, Button, Card, ErrorBanner, Pill, Row, SectionTitle, TextField, Title } from '../ui/kit';
import { colors, statusColors } from '../ui/theme';

interface Loaded {
  entry: Entry;
  reviews: Review[];
  placement: Placement;
}

export function EntryScreen({ id }: { id: string }) {
  const { api } = useSession();
  const nav = useNav();
  const state = useAsync<Loaded>(async () => {
    const entry = await api.getEntry(id);
    const [reviews, placement] = await Promise.all([api.listReviews(id), api.getPlacement(entry.placement_id)]);
    return { entry, reviews, placement };
  }, [api, id, nav.revision]);

  return <AsyncPage state={state}>{(data) => <EntryBody data={data} />}</AsyncPage>;
}

/** Reviews store the reviewer's id; the placement knows the names of its supervisors. */
export function reviewerName(placement: Placement, reviewerId: string): string {
  if (reviewerId === placement.company_supervisor_id) return placement.company_supervisor_name ?? t('Company supervisor');
  if (reviewerId === placement.academic_supervisor_id) return placement.academic_supervisor_name;
  return t('Supervisor');
}

function EntryBody({ data }: { data: Loaded }) {
  const { entry, reviews, placement } = data;
  const user = useUser();
  const nav = useNav();
  const c = statusColors[entry.status];

  const canRevise = user.role === 'student' && entry.student_id === user.sub
    && entry.status !== 'approved' && placement.status === 'open';
  const canReview = user.role === 'company_supervisor' && placement.company_supervisor_id === user.sub
    && entry.status === 'pending';
  const canFeedback = user.role === 'academic_supervisor' && placement.academic_supervisor_id === user.sub
    && entry.status === 'approved' && !reviews.some((r) => r.reviewer_id === user.sub);

  return (
    <>
      <Card>
        <Row gap={12}>
          <Avatar name={placement.student_name} />
          <View style={{ flex: 1 }}>
            <Title>{t('Week {n}', { n: entry.week })}</Title>
            <Body muted>{placement.student_name} · {placement.company_name}</Body>
          </View>
          <Pill label={statusLabel(entry.status)} fg={c.fg} bg={c.bg} />
        </Row>
        <Body bold>{t('{n} hours', { n: entry.hours })}</Body>
        <Body>{entry.tasks}</Body>
        {entry.reflection ? <><Body bold>{t('Reflection')}</Body><Body>{entry.reflection}</Body></> : null}
        {entry.skills ? <><Body bold>{t('Skills')}</Body><Body muted>{entry.skills}</Body></> : null}
        {entry.status === 'pending' ? (() => {
          const d = daysSince(entry.updated_at ?? entry.created_at);
          return d !== null ? <Body muted>{d >= 3 ? t('Waiting for review ({n} days) — follow up if needed', { n: d }) : t('Waiting for review ({n} days)', { n: d })}</Body> : null;
        })() : null}
        {entry.status === 'approved' ? <Body muted>{t('Approved entries are locked.')}</Body> : null}
      </Card>

      {canRevise ? (
        <Button
          title={entry.status === 'rejected' ? t('Revise and resubmit') : t('Edit entry')}
          onPress={() => nav.push({
            name: 'entryForm', placementId: placement.id, totalWeeks: placement.total_weeks, week: entry.week, entry,
          })}
        />
      ) : null}

      {canReview ? <ReviewPanel entryId={entry.id} /> : null}
      {canFeedback ? <FeedbackPanel entryId={entry.id} /> : null}

      <SectionTitle>{t('Review history')}</SectionTitle>
      {reviews.length === 0 ? <Body muted>{t('No review yet.')}</Body> : null}
      {reviews.map((r) => {
        const isAcademic = r.reviewer_id === placement.academic_supervisor_id && r.reviewer_id !== placement.company_supervisor_id;
        const label = isAcademic ? t('Academic feedback') : statusLabel(r.decision);
        return (
        <Card key={r.id}>
          <Row>
            <Pill
              label={label}
              fg={r.decision === 'approved' ? colors.ok : colors.danger}
              bg={r.decision === 'approved' ? colors.okBg : colors.dangerBg}
            />
            <Body muted>{reviewerName(placement, r.reviewer_id)} · {formatDate(r.created_at)}</Body>
          </Row>
          {r.comment ? <Body>{r.comment}</Body> : null}
        </Card>
      );})}
    </>
  );
}

function FeedbackPanel({ entryId }: { entryId: string }) {
  const { api } = useSession();
  const nav = useNav();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setFailure(null);
    if (!comment.trim()) { setError(t('Write your feedback.')); return; }
    setError(null);
    setBusy(true);
    try {
      await api.submitFeedback(entryId, comment);
      nav.refresh();
      nav.pop();
    } catch (e) {
      setFailure(e);
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionTitle>{t('Academic feedback')}</SectionTitle>
      {failure ? <ErrorBanner error={failure} /> : null}
      <TextField label={t('Feedback')} value={comment} onChangeText={setComment} error={error ?? undefined} multiline maxLength={1000}
        hint={t('Visible to the student and supervisors after company approval.')} />
      <Button title={t('Send feedback')} onPress={submit} loading={busy} />
    </Card>
  );
}

function ReviewPanel({ entryId }: { entryId: string }) {
  const { api } = useSession();
  const nav = useNav();
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'comment'>>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState<Decision | null>(null);

  const submit = async (decision: Decision) => {
    const found = validateReview(decision, comment);
    setErrors(found);
    setFailure(null);
    if (hasErrors(found)) return;
    setBusy(decision);
    try {
      await api.reviewEntry(entryId, decision, comment);
      nav.refresh();
      nav.pop();
    } catch (e) {
      setFailure(e);
      setBusy(null);
    }
  };

  return (
    <Card>
      <SectionTitle>{t('Your review')}</SectionTitle>
      {failure ? <ErrorBanner error={failure} /> : null}
      <TextField
        label={t('Comment')}
        value={comment}
        onChangeText={setComment}
        error={errors.comment}
        multiline
        hint={t('Required when you reject.')}
        maxLength={1000}
      />
      <Button title={t('Approve')} onPress={() => submit('approved')} loading={busy === 'approved'} disabled={busy !== null} />
      <Button title={t('Reject')} variant="danger" onPress={() => submit('rejected')} loading={busy === 'rejected'} disabled={busy !== null} />
    </Card>
  );
}
