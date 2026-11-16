import { useState } from 'react';
import { View } from 'react-native';
import type { ReactNode } from 'react';

import type { Entry, Placement, Progress } from '../api/types';
import { t } from '../i18n';
import { daysSince, formatPercent, formatRange, statusLabel } from '../lib/format';
import { useNav } from '../nav/Navigator';
import { useSession, useUser } from '../state/session';
import { useAsync } from '../state/useAsync';
import { AsyncPage, Avatar, Body, Button, Card, Chip, Empty, Pill, ProgressBar, Row, SectionTitle, Stats } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { colors, statusColors } from '../ui/theme';
import { PlacementScreen } from './PlacementScreen';

const AVATAR_TONES = [
  ['#FFE6DD', '#F2643A'], ['#E4E8FF', '#6C7BF5'], ['#DDF3E8', '#168A5B'], ['#FFF0D2', '#9A6200'],
] as const;

function PlacementCard({ placement, children }: { placement: Placement; children?: ReactNode }) {
  const nav = useNav();
  const open = placement.status === 'open';
  const tone = AVATAR_TONES[(placement.student_name.length + placement.company_name.length) % AVATAR_TONES.length]!;
  return (
    <Card
      onPress={() => nav.push({ name: 'placement', id: placement.id })}
      label={`${placement.student_name}, ${placement.company_name}`}
    >
      <Row gap={12}>
        <Avatar name={placement.student_name} uri={placement.student_avatar} size={48} color={tone[0]} ink={tone[1]} />
        <View style={{ flex: 1 }}>
          <Body bold>{placement.student_name}</Body>
          <Row gap={6}><Icon name="business-outline" size={14} color={colors.muted} /><Body muted>{placement.company_name} · {placement.company_city}</Body></Row>
        </View>
        <Pill label={open ? t('Open') : t('Closed')} fg={open ? colors.ok : colors.muted} bg={open ? colors.okBg : colors.track} />
      </Row>
      <Row gap={6}><Icon name="calendar-outline" size={14} color={colors.muted} /><Body muted>{formatRange(placement.start_date, placement.end_date)}</Body></Row>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------- student

export function StudentHome() {
  const { api } = useSession();
  const user = useUser();
  const nav = useNav();
  const state = useAsync(async () => {
    const mine = await api.allPlacements({ studentId: user.sub });
    return { placement: mine.find((p) => p.status === 'open') ?? mine[0] ?? null };
  }, [api, user.sub, nav.revision]);

  if (state.data?.placement) return <PlacementScreen id={state.data.placement.id} />;
  return (
    <AsyncPage state={state}>
      {() => <Empty title={t('No placement yet')} hint={t('Your coordinator creates your placement. Make sure you joined your school with its code, then pull down to check again.')} />}
    </AsyncPage>
  );
}

// ------------------------------------------------------ company supervisor

export function CompanySupervisorHome() {
  const { api } = useSession();
  const user = useUser();
  const nav = useNav();
  const state = useAsync(async () => {
    const [placements, pending] = await Promise.all([api.allPlacements(), api.allEntries({ status: 'pending' })]);
    const mine = placements.filter((p) => p.company_supervisor_id === user.sub);
    const byId = new Map(mine.map((p) => [p.id, p]));
    // The logbook lists every pending entry; only those of my own placements are mine to review.
    const queue = pending
      .filter((e) => byId.has(e.placement_id))
      .map((entry) => ({ entry, placement: byId.get(entry.placement_id)! }));
    return { mine, queue };
  }, [api, user.sub, nav.revision]);

  return (
    <AsyncPage state={state}>
      {({ mine, queue }) => (
        <>
          <Stats items={[
            { label: t('To review'), value: queue.length, tone: 'accent' },
            { label: t('My interns'), value: mine.length, tone: 'mint' },
          ]} />
          <SectionTitle>{t('To review ({n})', { n: queue.length })}</SectionTitle>
          {queue.length === 0 ? <Empty icon="checkmark-done-outline" title={t('Nothing waiting for your review')} /> : null}
          {queue.map(({ entry, placement }) => (
            <QueueCard key={entry.id} entry={entry} placement={placement} />
          ))}
          <SectionTitle>{t('My interns')}</SectionTitle>
          {mine.length === 0 ? <Empty title={t('No placements assigned to you')} /> : null}
          {mine.map((p) => <PlacementCard key={p.id} placement={p} />)}
        </>
      )}
    </AsyncPage>
  );
}

function QueueCard({ entry, placement }: { entry: Entry; placement: Placement }) {
  const nav = useNav();
  const c = statusColors.pending;
  return (
    <Card onPress={() => nav.push({ name: 'entry', id: entry.id })} label={`${placement.student_name}, ${t('Week {n}', { n: entry.week })}`}>
      <Row gap={12}>
        <Avatar name={placement.student_name} uri={placement.student_avatar} />
        <View style={{ flex: 1 }}>
          <Body bold>{placement.student_name} · {t('Week {n}', { n: entry.week })}</Body>
          <Body muted>{entry.hours} h · {placement.company_name}</Body>
        </View>
        <Pill label={(daysSince(entry.updated_at ?? entry.created_at) ?? 0) >= 3 ? t('Overdue') : statusLabel('pending')} fg={(daysSince(entry.updated_at ?? entry.created_at) ?? 0) >= 3 ? colors.danger : c.fg} bg={(daysSince(entry.updated_at ?? entry.created_at) ?? 0) >= 3 ? colors.dangerBg : c.bg} />
      </Row>
      <Body muted>{entry.tasks.length > 110 ? `${entry.tasks.slice(0, 110)}…` : entry.tasks}</Body>
    </Card>
  );
}

// ------------------------------------------------------ academic supervisor

export function AcademicSupervisorHome() {
  const { api } = useSession();
  const user = useUser();
  const nav = useNav();
  const state = useAsync(async () => {
    const all = await api.allPlacements();
    const mine = all.filter((p) => p.academic_supervisor_id === user.sub);
    const progress = await Promise.all(mine.map((p) => api.progress(p.id)));
    return mine.map((placement, i) => ({ placement, progress: progress[i]! }));
  }, [api, user.sub, nav.revision]);

  return (
    <AsyncPage state={state}>
      {(rows) => (
        <>
          <SectionTitle>{t('Interns you supervise ({n})', { n: rows.length })}</SectionTitle>
          {rows.length === 0 ? <Empty title={t('No placements assigned to you')} /> : null}
          {rows.map(({ placement, progress }) => (
            <PlacementCard key={placement.id} placement={placement}>
              <ProgressLine progress={progress} />
            </PlacementCard>
          ))}
        </>
      )}
    </AsyncPage>
  );
}

function ProgressLine({ progress }: { progress: Progress }) {
  return (
    <View style={{ gap: 6 }}>
      <ProgressBar percent={progress.completion_percent} />
      <Body muted>
        {t('{pct} complete · {p} pending · {r} rejected', { pct: formatPercent(progress.completion_percent), p: progress.pending, r: progress.rejected })}
      </Body>
    </View>
  );
}

// -------------------------------------------------------------- coordinator

type Filter = 'all' | 'open' | 'closed';

interface CoordinatorSignal {
  title: string;
  detail: string;
  icon: 'people' | 'time-outline' | 'document-text-outline' | 'calendar-outline';
  placementId?: string;
  entryId?: string;
  userId?: string;
}

export function CoordinatorHome() {
  const { api } = useSession();
  const user = useUser();
  const nav = useNav();
  const [filter, setFilter] = useState<Filter>('all');
  const state = useAsync(async () => {
    const [placements, entries, students] = await Promise.all([
      api.allPlacements(user.schoolId ? { schoolId: user.schoolId } : {}),
      api.allEntries(),
      user.schoolId ? api.members(user.schoolId, 'student') : Promise.resolve([]),
    ]);
    const visibleIds = new Set(placements.map((placement) => placement.id));
    const schoolEntries = entries.filter((entry) => visibleIds.has(entry.placement_id));
    const open = placements.filter((placement) => placement.status === 'open');
    const placedStudents = new Set(open.map((placement) => placement.student_id));
    const today = new Date().toISOString().slice(0, 10);
    const signals: CoordinatorSignal[] = [];

    for (const student of students) {
      if (!placedStudents.has(student.user_id)) {
        signals.push({
          title: t('Student awaiting placement'),
          detail: [student.name, student.field_of_study, student.specialty].filter(Boolean).join(' · '),
          icon: 'people',
          userId: student.user_id,
        });
      }
    }

    const placementById = new Map(placements.map((placement) => [placement.id, placement]));
    const overdue = schoolEntries.filter((entry) => entry.status === 'pending'
      && Date.now() - new Date(entry.updated_at ?? entry.created_at ?? Date.now()).getTime() >= 3 * 24 * 60 * 60 * 1000);
    for (const entry of overdue) {
      const placement = placementById.get(entry.placement_id);
      if (placement) signals.push({
        title: t('Review overdue'),
        detail: t('{student} · Week {n}', { student: placement.student_name, n: entry.week }),
        icon: 'time-outline',
        placementId: placement.id,
        entryId: entry.id,
      });
    }

    const entryWeeks = new Set(schoolEntries.map((entry) => `${entry.placement_id}:${entry.week}`));
    for (const placement of open) {
      const endingDays = (new Date(`${placement.end_date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime())
        / (24 * 60 * 60 * 1000);
      if (endingDays >= 0 && endingDays <= 7) {
        signals.push({
          title: t('Placement ending soon'),
          detail: t('{student} · {company}', { student: placement.student_name, company: placement.company_name }),
          icon: 'calendar-outline',
          placementId: placement.id,
        });
      }
      let missingWeeks = 0;
      for (let week = 1; week <= placement.total_weeks; week++) {
        const dueDate = new Date(`${placement.start_date}T00:00:00Z`);
        dueDate.setUTCDate(dueDate.getUTCDate() + (week - 1) * 7);
        dueDate.setUTCDate(dueDate.getUTCDate() + 7);
        if (dueDate.toISOString().slice(0, 10) <= today && !entryWeeks.has(`${placement.id}:${week}`)) missingWeeks++;
      }
      if (missingWeeks) {
        signals.push({
          title: t('Weekly entries missing'),
          detail: t('{student} · {n} due', { student: placement.student_name, n: missingWeeks }),
          icon: 'document-text-outline',
          placementId: placement.id,
        });
      }
    }
    return { placements, signals, overdueCount: overdue.length };
  }, [api, user.schoolId, nav.revision]);

  return (
    <AsyncPage state={state}>
      {({ placements, signals, overdueCount }) => {
        const shownPlacements = placements.filter((placement) => filter === 'all' || placement.status === filter);
        return (
        <>
          <Stats items={[
            { label: t('Placements'), value: placements.length },
            { label: t('Open'), value: placements.filter((p) => p.status === 'open').length },
            { label: t('Closed'), value: placements.filter((p) => p.status === 'closed').length },
          ]} />
          <Stats items={[
            { label: t('Students awaiting placement'), value: signals.filter((signal) => signal.userId).length, tone: 'accent' },
            { label: t('Overdue reviews'), value: overdueCount, tone: 'sun' },
          ]} />
          <SectionTitle>{t('Needs attention ({n})', { n: signals.length })}</SectionTitle>
          {signals.length === 0 ? <Empty icon="checkmark-done-outline" title={t('Nothing needs attention')} /> : null}
          {signals.slice(0, 8).map((signal, index) => (
            <Card key={`${signal.title}:${signal.entryId ?? signal.placementId ?? signal.userId}:${index}`}
              onPress={() => {
                if (signal.entryId) nav.push({ name: 'entry', id: signal.entryId });
                else if (signal.placementId) nav.push({ name: 'placement', id: signal.placementId });
                else if (signal.userId) nav.push({ name: 'profile', userId: signal.userId });
              }}>
              <Row gap={10}>
                <Icon name={signal.icon} size={19} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Body bold>{signal.title}</Body>
                  <Body muted>{signal.detail}</Body>
                </View>
                <Icon name="chevron-forward" size={18} color={colors.muted} />
              </Row>
            </Card>
          ))}
          <Button title={t('New placement')} onPress={() => nav.push({ name: 'placementForm' })} />
          <Row>
            {(['all', 'open', 'closed'] as const).map((f) => (
              <Chip key={f} label={f === 'all' ? t('All') : f === 'open' ? t('Open') : t('Closed')} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </Row>
          {shownPlacements.length === 0 ? <Empty title={t('No placements')} hint={t('Create the first one with “New placement”.')} /> : null}
          {shownPlacements.map((p) => <PlacementCard key={p.id} placement={p} />)}
        </>
      );
      }}
    </AsyncPage>
  );
}
