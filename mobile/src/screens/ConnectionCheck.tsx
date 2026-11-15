import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { AttachLogClient } from '../api/client';
import { t } from '../i18n';
import { Button } from '../ui/kit';
import { colors } from '../ui/theme';

/** Pings /health so a wrong address is obvious before signing in. A sleeping cloud server can take a minute. */
export function ConnectionCheck({ server }: { server: string }) {
  const client = useMemo(() => new AttachLogClient({ server }), [server]);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<boolean | null>(null);

  const run = async () => {
    setBusy(true);
    setOk(null);
    setOk(await client.health());
    setBusy(false);
  };

  return (
    <View style={{ gap: 8 }}>
      <Button title={t('Test connection')} variant="ghost" onPress={run} loading={busy} />
      {busy ? <Text style={{ color: colors.muted, fontSize: 14 }}>{t('A free server can take up to a minute to wake up.')}</Text> : null}
      {ok !== null ? (
        <Text style={{ color: ok ? colors.ok : colors.danger, fontSize: 15 }}>
          {ok ? '✓ ' + t('{server} is reachable', { server: client.baseUrl }) : '✗ ' + t('{server} did not answer', { server: client.baseUrl })}
        </Text>
      ) : null}
    </View>
  );
}
