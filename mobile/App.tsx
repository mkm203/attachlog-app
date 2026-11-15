import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Role } from './src/api/types';
import { t } from './src/i18n';
import { NavProvider, useNav } from './src/nav/Navigator';
import type { Route } from './src/nav/Navigator';
import { AccountScreen } from './src/screens/AccountScreen';
import { EntryFormScreen } from './src/screens/EntryFormScreen';
import { EntryScreen } from './src/screens/EntryScreen';
import {
  AcademicSupervisorHome, CompanySupervisorHome, CoordinatorHome, StudentHome,
} from './src/screens/HomeScreens';
import { LoginScreen } from './src/screens/LoginScreen';
import { PlacementScreen } from './src/screens/PlacementScreen';
import { SchoolScreen } from './src/screens/SchoolScreen';
import { CloseFormScreen, PlacementFormScreen, SupervisorsFormScreen } from './src/screens/PlacementForms';
import { LanguageProvider } from './src/state/language';
import { SessionProvider, useSession, useUser } from './src/state/session';
import { fonts } from './src/ui/fonts';
import { Body, Empty, Page, Paper } from './src/ui/kit';
import { Icon } from './src/ui/Icon';
import type { IconName } from './src/ui/Icon';
import { colors } from './src/ui/theme';

function homeTitle(role: Role): string {
  switch (role) {
    case 'student': return t('My logbook');
    case 'company_supervisor': return t('Review queue');
    case 'academic_supervisor': return t('Supervised interns');
    case 'coordinator': return t('Placements');
  }
}

function titleFor(route: Route, role: Role | null): string {
  switch (route.name) {
    case 'home': return role ? homeTitle(role) : t('Welcome');
    case 'school': return t('My school');
    case 'account': return t('Account');
    case 'placement': return t('Placement');
    case 'entry': return t('Entry');
    case 'entryForm': return route.entry ? t('Revise entry') : t('New entry');
    case 'placementForm': return t('New placement');
    case 'supervisorsForm': return t('Change supervisors');
    case 'closeForm': return t('Close placement');
  }
}

function Home({ role }: { role: Role }) {
  switch (role) {
    case 'student': return <StudentHome />;
    case 'company_supervisor': return <CompanySupervisorHome />;
    case 'academic_supervisor': return <AcademicSupervisorHome />;
    case 'coordinator': return <CoordinatorHome />;
  }
}

function NoRole() {
  return (
    <Page>
      <Empty title={t('You have not joined anything yet')}
        hint={t("Open the Account tab and use “Join with a code”: students use their school's code, supervisors use the code from their invitation.")} />
      <Body muted>{t('Your coordinator or company can send you the code.')}</Body>
    </Page>
  );
}

function Screen({ route, role }: { route: Route; role: Role | null }) {
  switch (route.name) {
    case 'home': return role ? <Home role={role} /> : <NoRole />;
    case 'school': return <SchoolScreen />;
    case 'account': return <AccountScreen />;
    case 'placement': return <PlacementScreen id={route.id} />;
    case 'entry': return <EntryScreen id={route.id} />;
    case 'entryForm':
      return <EntryFormScreen placementId={route.placementId} totalWeeks={route.totalWeeks} week={route.week} entry={route.entry} />;
    case 'placementForm': return <PlacementFormScreen />;
    case 'supervisorsForm': return <SupervisorsFormScreen placement={route.placement} />;
    case 'closeForm': return <CloseFormScreen placement={route.placement} />;
  }
}

function Shell() {
  const user = useUser();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const tabs = user.role === 'coordinator' ? (['home', 'school', 'account'] as const) : (['home', 'account'] as const);
  const iconFor = (tab: 'home' | 'school' | 'account', active: boolean): IconName =>
    tab === 'home' ? (active ? 'home' : 'home-outline')
      : tab === 'school' ? (active ? 'school' : 'school-outline') : (active ? 'person-circle' : 'person-circle-outline');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Paper />
      <View style={{ backgroundColor: colors.card, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 8, gap: 4 }}>
          {nav.canGoBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={nav.pop}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevron-back" size={26} color={colors.primaryDark} />
            </Pressable>
          ) : <View style={{ width: 10 }} />}
          <Text accessibilityRole="header" numberOfLines={1}
            style={{ flex: 1, fontSize: 21, fontWeight: '700', color: colors.primaryDark, fontFamily: fonts.display }}>
            {titleFor(nav.route, user.role)}
          </Text>
        </View>
        {/* a double rule, as in a ledger */}
        <View style={{ height: 1.5, backgroundColor: colors.primaryDark }} />
        <View style={{ height: 3 }} />
        <View style={{ height: 1, backgroundColor: colors.primaryDark }} />
      </View>

      <View style={{ flex: 1 }}>
        <Screen key={`${nav.route.name}:${user.activeId}`} route={nav.route} role={user.role} />
      </View>

      {!nav.canGoBack ? (
        <View style={{
          flexDirection: 'row', backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 6), paddingTop: 6,
          borderTopWidth: 1.5, borderTopColor: colors.primaryDark,
        }}>
          {tabs.map((tab) => {
            const active = nav.tab === tab;
            return (
              <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: active }}
                onPress={() => nav.setTab(tab)}
                style={{ flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <View style={{ paddingHorizontal: 18, paddingVertical: 4, borderRadius: 6, backgroundColor: active ? colors.highlight : 'transparent' }}>
                  <Icon name={iconFor(tab, active)} size={22} color={active ? colors.primaryDark : colors.muted} />
                </View>
                <Text style={{ fontSize: 12, fontWeight: '800', color: active ? colors.primaryDark : colors.muted }}>
                  {tab === 'home' ? t('Home') : tab === 'school' ? t('School') : t('Account')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Root() {
  const { ready, session } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!session) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }}><Paper /><LoginScreen /></View>;
  }
  return <NavProvider><Shell /></NavProvider>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Root />
        </SessionProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
