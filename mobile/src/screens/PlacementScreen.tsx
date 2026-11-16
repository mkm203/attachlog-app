import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import type { Entry, Placement, Progress } from '../api/types';
import {
  countByStatus, entriesByWeek, formatPercent, formatRange, nextFreeWeek, statusLabel,
} from '../lib/format';
import { placementReportHtml } from '../lib/placementReport';
import { t } from '../i18n';
import { useNav } from '../nav/Navigator';
import { useSession, useUser } from '../state/session';
import { useAsync } from '../state/useAsync';
import { reviewerName } from './EntryScreen';
import { AsyncPage, Avatar, Body, Marked, Button, Card, ErrorBanner, Pill, ProgressBar, Row, SectionTitle, Title } from '../ui/kit';
import { colors } from '../ui/theme';

interface Loaded {
  placement: Placement;
  entries: Entry[];
  progress: Progress;
  activity: import('../api/types').AuditEvent[];
}

/** One placement: facts, completion, the week grid, reviewer comments and the actions for the role. */
export function PlacementScreen({ id }: { id: string }) {
  const { api } = useSession();
  const nav = useNav();
  const state = useAsync<Loaded>(async () => {
    const [placement, entries, progress, activity] = await Promise.all([
      api.getPlacement(id), api.allEntries({ placementId: id }), api.progress(id), api.activity(id),
    ]);
    return { placement, entries, progress, activity };
  }, [api, id, nav.revision]);

  return <AsyncPage state={state}>{(data) => <PlacementBody data={data} />}</AsyncPage>;
}

function PlacementBody({ data }: { data: Loaded }) {
  const { placement, entries, progress, activity } = data;
  const { api } = useSession();
  const user = useUser();
  const nav = useNav();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
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

  const exportReport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const report = await api.getPlacementReport(placement.id);
      const html = placementReportHtml(report);
      if (Platform.OS === 'android') {
        await Print.printAsync({ html });
        return;
      }
      const pdf = await Print.printToFileAsync({ html });
      if (!await Sharing.isAvailableAsync()) {
        throw new Error(t('PDF sharing is not available on this device.'));
      }
      await Sharing.shareAsync(pdf.uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('Download placement PDF'),
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      setExportError(error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {exportError ? <ErrorBanner error={exportError} /> : null}
      <Card>
        <Row gap={12}>
          <Avatar name={placement.student_name} uri={placement.student_avatar} size={52} />
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
        <PersonFact label={t('Academic supervisor')} name={placement.academic_supervisor_name}
          avatar={placement.academic_supervisor_avatar} />
        <PersonFact label={t('Company supervisor')}
          name={placement.company_supervisor_name ?? `${placement.company_supervisor_email} ${t('(has not joined yet)')}`}
          avatar={placement.company_supervisor_avatar} />
      </Card>

      <Card>
        <Row>
          <Marked size={40} color={colors.accent}>{formatPercent(progress.completion_percent)}</Marked>
          <Body muted>{t('complete')}</Body>
        </Row>
        <ProgressBar percent={progress.completion_percent} />
        <Body muted>
          {t('{a} of {total} weeks approved · {p} pending · {r} rejected', { a: counts.approved, total: placement.total_weeks, p: counts.pending, r: counts.rejected })}
        </Body>
        <Body muted>{t('{n} hours logged', { n: progress.total_hours ?? 0 })}</Body>
        {progress.skills?.length ? <Body muted>{`${t('Skills')}: ${progress.skills.join(', ')}`}</Body> : null}
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
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s === 'approved' ? colors.mint : s === 'pending' ? colors.sun : colors.danger }} />
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
          <Marked size={34} color={colors.accent}>{`${placement.final_score ?? '–'} / 20`}</Marked>
          {placement.final_comment ? <Body>{placement.final_comment}</Body> : null}
        </Card>
      ) : null}

      {activity.length ? (
        <>
          <SectionTitle>{t('Recent activity')}</SectionTitle>
          {activity.slice(0, 8).map((a) => (
            <Card key={a.id}>
              <Body bold>{actionLabel(a.action)}</Body>
              {a.detail ? <Body muted>{a.detail}</Body> : null}
            </Card>
          ))}
        </>
      ) : null}

      {user.role === 'coordinator' && open ? (
        <View style={{ gap: 8 }}>
          <Button title={t('Change supervisors')} variant="ghost" onPress={() => nav.push({ name: 'supervisorsForm', placement })} />
          <Button title={t('Close placement and evaluate')} variant="danger" onPress={() => nav.push({ name: 'closeForm', placement })} />
        </View>
      ) : null}
      {user.role === 'coordinator' && !open ? (
        <Button title={t('Export placement PDF')} onPress={exportReport} loading={exporting} />
      ) : null}
    </>
  );
}

function actionLabel(action: string): string {
  switch (action) {
    case 'entry_submitted': return t('Entry submitted');
    case 'entry_revised': return t('Entry revised');
    case 'entry_approved': return t('Entry approved');
    case 'entry_rejected': return t('Entry rejected');
    case 'placement_closed': return t('Placement closed');
    case 'supervisors_changed': return t('Supervisors changed');
    case 'entry_academic_feedback': return t('Academic feedback');
    default: return action;
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>{label}</Text>
      <Body>{value}</Body>
    </View>
  );
}

function PersonFact({ label, name, avatar }: { label: string; name: string; avatar: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>{label}</Text>
      <Row gap={8}><Avatar name={name} uri={avatar} size={34} /><Body>{name}</Body></Row>
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
        const fill = st === 'approved' ? colors.mint : st === 'pending' ? colors.sun : st === 'rejected' ? colors.danger : colors.cardAlt;
        const ink = st === 'pending' ? '#2B1D00' : st ? '#FFFFFF' : colors.muted;
        return (
          <Pressable
            key={week}
            accessibilityRole="button"
            accessibilityLabel={`${t('Week {n}', { n: week })}, ${entry ? statusLabel(entry.status) : t('no entry')}`}
            onPress={() => onPress(week)}
            style={{ width: 54, height: 62, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: fill }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800', color: ink }}>{week}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
