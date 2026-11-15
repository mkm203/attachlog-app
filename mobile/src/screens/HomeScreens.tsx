import { useState } from 'react';
import { View } from 'react-native';
import type { ReactNode } from 'react';

import type { Entry, Placement, Progress } from '../api/types';
import { t } from '../i18n';
import { formatPercent, formatRange, statusLabel } from '../lib/format';
import { useNav } from '../nav/Navigator';
import { useSession, useUser } from '../state/session';
import { useAsync } from '../state/useAsync';
import { AsyncPage, Avatar, Body, Button, Card, Chip, Empty, Hero, Pill, ProgressBar, Row, SectionTitle, Stats } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { colors, statusColors } from '../ui/theme';
import { PlacementScreen } from './PlacementScreen';

function PlacementCard({ placement, children }: { placement: Placement; children?: ReactNode }) {
  const nav = useNav();
  const open = placement.status === 'open';
  return (
    <Card
      onPress={() => nav.push({ name: 'placement', id: placement.id })}
      label={`${placement.student_name}, ${placement.company_name}`}
    >
      <Row gap={12}>
        <Avatar name={placement.student_name} />
        <View style={{ flex: 1 }}>
          <Body bold>{placement.student_name}</Body>
          <Body muted>{placement.company_name} · {placement.company_city}</Body>
        </View>
        <Icon name="chevron-forward" size={20} color={colors.muted} />
      </Row>
      <Row>
        <Pill label={open ? t('Open') : t('Closed')} fg={open ? colors.ok : colors.muted} bg={open ? colors.okBg : colors.track} />
        <Body muted>{formatRange(placement.start_date, placement.end_date)}</Body>
      </Row>
      {children}
    </Card>
  );
}

function Greeting({ subtitle }: { subtitle?: string }) {
  const user = useUser();
  const first = (user.name ?? '').trim().split(/\s+/)[0] ?? '';
  return <Hero title={first ? t('Hello, {name}', { name: first }) : t('Welcome')} subtitle={subtitle} />;
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
          <Greeting subtitle={queue.length ? t('{n} entries are waiting for your review.', { n: queue.length }) : t('Nothing waiting for your review')} />
          <Stats items={[
            { label: t('To review'), value: queue.length, tone: queue.length ? 'warn' : 'plain' },
            { label: t('My interns'), value: mine.length },
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
        <Avatar name={placement.student_name} />
        <View style={{ flex: 1 }}>
          <Body bold>{placement.student_name} · {t('Week {n}', { n: entry.week })}</Body>
          <Body muted>{entry.hours} h · {placement.company_name}</Body>
        </View>
        <Pill label={statusLabel('pending')} fg={c.fg} bg={c.bg} />
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
          <Greeting subtitle={t('Interns you supervise ({n})', { n: rows.length })} />
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

export function CoordinatorHome() {
  const { api } = useSession();
  const user = useUser();
  const nav = useNav();
  const [filter, setFilter] = useState<Filter>('all');
  const state = useAsync(
    () => api.allPlacements({ ...(filter === 'all' ? {} : { status: filter }), ...(user.schoolId ? { schoolId: user.schoolId } : {}) }),
    [api, filter, user.schoolId, nav.revision],
  );

  return (
    <AsyncPage state={state}>
      {(placements) => (
        <>
          <Greeting subtitle={user.contextLabel ?? undefined} />
          <Stats items={[
            { label: t('Placements'), value: placements.length },
            { label: t('Open'), value: placements.filter((p) => p.status === 'open').length, tone: 'ok' },
            { label: t('Closed'), value: placements.filter((p) => p.status === 'closed').length },
          ]} />
          <Button title={t('New placement')} onPress={() => nav.push({ name: 'placementForm' })} />
          <Row>
            {(['all', 'open', 'closed'] as const).map((f) => (
              <Chip key={f} label={f === 'all' ? t('All') : f === 'open' ? t('Open') : t('Closed')} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </Row>
          {placements.length === 0 ? <Empty title={t('No placements')} hint={t('Create the first one with “New placement”.')} /> : null}
          {placements.map((p) => <PlacementCard key={p.id} placement={p} />)}
        </>
      )}
    </AsyncPage>
  );
}
