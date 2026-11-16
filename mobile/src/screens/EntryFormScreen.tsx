import { useState } from 'react';

import type { Entry } from '../api/types';
import { t } from '../i18n';
import { hasErrors, validateEntry } from '../lib/validation';
import type { EntryForm } from '../lib/validation';
import type { FieldErrors } from '../lib/validation';
import { useNav } from '../nav/Navigator';
import { useSession } from '../state/session';
import { Body, Button, Card, ErrorBanner, Page, TextField } from '../ui/kit';

/** Submit a new week, or revise a pending / rejected one (a revised entry goes back to pending). */
export function EntryFormScreen({ placementId, totalWeeks, week, entry }: {
  placementId: string; totalWeeks: number; week?: number; entry?: Entry;
}) {
  const { api } = useSession();
  const nav = useNav();
  const [form, setForm] = useState<EntryForm>({
    week: String(entry?.week ?? week ?? ''),
    tasks: entry?.tasks ?? '',
    hours: entry ? String(entry.hours) : '',
    reflection: entry?.reflection ?? '',
    skills: entry?.skills ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors<keyof EntryForm>>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof EntryForm) => (text: string) => setForm((f) => ({ ...f, [key]: text }));
  const weekLocked = entry !== undefined || week !== undefined;

  const submit = async () => {
    const found = validateEntry(form, totalWeeks, !entry);
    setErrors(found);
    setFailure(null);
    if (hasErrors(found)) return;
    setBusy(true);
    try {
      const body = {
        tasks: form.tasks.trim(), hours: Number(form.hours),
        reflection: form.reflection.trim() || null, skills: form.skills.trim() || null,
      };
      if (entry) await api.updateEntry(entry.id, body);
      else await api.createEntry(placementId, { week: Number(form.week), ...body });
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
        <TextField
          label={t('Week')}
          value={form.week}
          onChangeText={set('week')}
          error={errors.week}
          keyboardType="number-pad"
          editable={!weekLocked}
          hint={t('This placement has {n} weeks.', { n: totalWeeks })}
        />
        <TextField
          label={t('What did you do this week?')}
          value={form.tasks}
          onChangeText={set('tasks')}
          error={errors.tasks}
          multiline
          maxLength={2000}
          autoCapitalize="sentences"
        />
        <TextField
          label={t('Hours worked')}
          value={form.hours}
          onChangeText={set('hours')}
          error={errors.hours}
          keyboardType="number-pad"
          hint={t('Between 1 and 60.')}
        />
        <TextField
          label={t('Reflection')}
          value={form.reflection}
          onChangeText={set('reflection')}
          error={errors.reflection}
          multiline
          maxLength={2000}
          hint={t('What did you learn or find challenging? (optional)')}
          autoCapitalize="sentences"
        />
        <TextField
          label={t('Skills')}
          value={form.skills}
          onChangeText={set('skills')}
          error={errors.skills}
          maxLength={400}
          hint={t('Comma-separated tags, e.g. communication, debugging')}
          autoCapitalize="none"
        />
        {entry?.status === 'rejected' ? <Body muted>{t('Saving sends this entry back to your supervisor.')}</Body> : null}
        <Button title={entry ? t('Save changes') : t('Submit week')} onPress={submit} loading={busy} />
      </Card>
    </Page>
  );
}
