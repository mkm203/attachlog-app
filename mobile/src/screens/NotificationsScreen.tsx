import { useState } from 'react';
import { View } from 'react-native';

import type { AppNotification } from '../api/types';
import { t } from '../i18n';
import { formatDate } from '../lib/format';
import { useNav } from '../nav/Navigator';
import { useSession } from '../state/session';
import { useAsync } from '../state/useAsync';
import { AsyncPage, Body, Button, Card, Empty, ErrorBanner, Row, SectionTitle } from '../ui/kit';

export function NotificationsScreen() {
  const { api } = useSession();
  const nav = useNav();
  const [actionError, setActionError] = useState<unknown>(null);
  const state = useAsync(() => api.notifications(), [api, nav.revision]);

  const open = async (item: AppNotification) => {
    setActionError(null);
    try {
      await api.markNotificationRead(item.id);
      nav.refresh();
      if (item.entry_id) nav.push({ name: 'entry', id: item.entry_id });
      else if (item.placement_id) nav.push({ name: 'placement', id: item.placement_id });
    } catch (error) {
      setActionError(error);
    }
  };

  const markAllRead = async () => {
    setActionError(null);
    try {
      await api.markAllNotificationsRead();
      nav.refresh();
    } catch (error) {
      setActionError(error);
    }
  };

  return (
    <AsyncPage state={state}>
      {({ items, unread_count }) => (
        <>
          {actionError ? <ErrorBanner error={actionError} /> : null}
          <Row>
            <SectionTitle>{t('Notifications')}</SectionTitle>
            {unread_count > 0 ? <Button title={t('Mark all read')} variant="ghost" onPress={() => void markAllRead()} /> : null}
          </Row>
          {items.length === 0 ? <Empty icon="notifications-outline" title={t('You are all caught up')} /> : null}
          {items.map((item) => (
            <Card key={item.id} onPress={() => void open(item)} label={t(item.title)}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Body bold>{t(item.title)}</Body>
                  <Body muted>{t(item.body)}</Body>
                  <Body muted>{formatDate(item.created_at)}</Body>
                </View>
                {!item.read_at ? <View accessibilityLabel={t('Unread')} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#168A5B', marginTop: 6 }} /> : null}
              </View>
            </Card>
          ))}
        </>
      )}
    </AsyncPage>
  );
}
