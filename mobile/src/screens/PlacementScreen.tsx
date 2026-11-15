import { Pressable, Text, View } from 'react-native';

import type { Entry, Placement, Progress } from '../api/types';
import {
  countByStatus, entriesByWeek, formatPercent, formatRange, nextFreeWeek, statusLabel,
} from '../lib/format';
import { t } from '../i18n';
import { useNav } from '../nav/Navigator';
import { useSession, useUser } from '../state/session';
import { useAsync } from '../state/useAsync';
import { reviewerName } from './EntryScreen';
import { AsyncPage, Avatar, Body, Marked, Button, Card, Pill, ProgressBar, Row, SectionTitle, Title } from '../ui/kit';
import { fonts } from '../ui/fonts';
import { colors, statusColors } from '../ui/theme';

interface Loaded {
  placement: Placement;
  entries: Entry[];
  progress: Progress;
}

/** One placement: facts, completion, the week grid, reviewer comments and the actions for the role. */
export function PlacementScreen({ id }: { id: string }) {
  const { api } = useSession();
  const nav = useNav();
  const state = useAsync<Loaded>(async () => {
    const [placement, entries, progress] = await Promise.all([
      api.getPlacement(id), api.allEntries({ placementId: id }), api.progress(id),
    ]);
    return { placement, entries, progress };
  }, [api, id, nav.revision]);

  return <AsyncPage state={state}>{(data) => <PlacementBody data={data} />}</AsyncPage>;
}

function PlacementBody({ data }: { data: Loaded }) {
  const { placement, entries, progress } = data;
  const user = useUser();
  const nav = useNav();
  const counts = countByStatus(entries);
  const byWeek = entriesByWeek(entries);
  const open = placement.status === 'open';
  const next = nextFreeWeek(entries, placement.total_weeks);
  const isStudent = user.role === 'student';

  const openWeek = (week: number) => {
    const entry = byWeek.get(week);
    if (entry) nav.push({ name: 'entry', id: entry.id });
    else if (isStudent && open) {
      nav.push({ name: 'entryForm', placementId: placement.id, totalWeeks: placement.total_weeks, week });
    }
  };

  return (
    <>
      <Card>
        <Row gap={12}>
          <Avatar name={placement.student_name} size={52} />
          <View style={{ flex: 1 }}>
            <Title>{placement.student_name}</Title>
            <Body muted>{placement.company_name} · {placement.company_city}</Body>
          </View>
          <Pill
            label={open ? t('Open') : t('Closed')}
            fg={open ? colors.ok : colors.muted}
            bg={open ? colors.okBg : colors.track}
          />
        </Row>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <Fact label={t('Dates')} value={`${formatRange(placement.start_date, placement.end_date)} · ${t('{n} weeks', { n: placement.total_weeks })}`} />
        <Fact label={t('Academic supervisor')} value={placement.academic_supervisor_name} />
        <Fact label={t('Company supervisor')}
          value={placement.company_supervisor_name ?? `${placement.company_supervisor_email} ${t('(has not joined yet)')}`} />
      </Card>

      <Card>
        <Row>
          <Marked size={36} mono>{formatPercent(progress.completion_percent)}</Marked>
          <Body muted>{t('complete')}</Body>
        </Row>
        <ProgressBar percent={progress.completion_percent} />
        <Body muted>
          {t('{a} of {total} weeks approved · {p} pending · {r} rejected', { a: counts.approved, total: placement.total_weeks, p: counts.pending, r: counts.rejected })}
        </Body>
        {isStudent && open && next !== null ? (
          <Button title={t('Log week {n}', { n: next })} onPress={() => nav.push({
            name: 'entryForm', placementId: placement.id, totalWeeks: placement.total_weeks, week: next,
          })}
          />
        ) : null}
      </Card>

      <SectionTitle>{t('Weeks')}</SectionTitle>
      <WeekGrid total={placement.total_weeks} byWeek={byWeek} onPress={openWeek} />
      <Row gap={12}>
        {(['approved', 'pending', 'rejected'] as const).map((s) => (
          <Row key={s} gap={4}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: statusColors[s].fg }} />
            <Text style={{ color: colors.muted, fontSize: 13 }}>{statusLabel(s)}</Text>
          </Row>
        ))}
      </Row>

      {progress.comments.length ? (
        <>
          <SectionTitle>{t('Supervisor comments')}</SectionTitle>
          {progress.comments.map((c, i) => (
            <Card key={`${c.week}-${i}`}>
              <Row>
                <Body bold>{t('Week {n}', { n: c.week })}</Body>
                <Pill
                  label={statusLabel(c.decision === 'approved' ? 'approved' : 'rejected')}
                  fg={c.decision === 'approved' ? colors.ok : colors.danger}
                  bg={c.decision === 'approved' ? colors.okBg : colors.dangerBg}
                />
              </Row>
              <Body>{c.comment}</Body>
              <Body muted>{reviewerName(placement, c.reviewer_id)}</Body>
            </Card>
          ))}
        </>
      ) : null}

      {!open ? (
        <Card>
          <Title>{t('Final evaluation')}</Title>
          <Marked size={32} mono>{`${placement.final_score ?? '–'} / 20`}</Marked>
          {placement.final_comment ? <Body>{placement.final_comment}</Body> : null}
        </Card>
      ) : null}

      {user.role === 'coordinator' && open ? (
        <View style={{ gap: 8 }}>
          <Button title={t('Change supervisors')} variant="ghost" onPress={() => nav.push({ name: 'supervisorsForm', placement })} />
          <Button title={t('Close placement and evaluate')} variant="danger" onPress={() => nav.push({ name: 'closeForm', placement })} />
        </View>
      ) : null}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Body>{value}</Body>
    </View>
  );
}

function WeekGrid({ total, byWeek, onPress }: {
  total: number; byWeek: Map<number, Entry>; onPress: (week: number) => void;
}) {
  const weeks = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {weeks.map((week) => {
        const entry = byWeek.get(week);
        const st = entry?.status;
        const fill = st === 'approved' ? colors.primary : st === 'pending' ? colors.highlight : st === 'rejected' ? colors.dangerBg : 'transparent';
        const ink = st === 'approved' ? colors.onPrimary : st === 'rejected' ? colors.danger : st === 'pending' ? colors.text : colors.muted;
        const line = st === 'approved' ? colors.primaryDark : st === 'rejected' ? colors.danger : st === 'pending' ? colors.warn : colors.border;
        return (
          <Pressable
            key={week}
            accessibilityRole="button"
            accessibilityLabel={`${t('Week {n}', { n: week })}, ${entry ? statusLabel(entry.status) : t('no entry')}`}
            onPress={() => onPress(week)}
            style={{
              width: 52, height: 52, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              backgroundColor: fill, borderWidth: 1.5, borderColor: line, borderStyle: entry ? 'solid' : 'dashed',
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '800', color: ink, fontFamily: fonts.mono }}>{week}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
