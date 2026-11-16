import React from 'react';
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
import { ProfileScreen } from './src/screens/ProfileScreen';
import {
  AcademicSupervisorHome, CompanySupervisorHome, CoordinatorHome, StudentHome,
} from './src/screens/HomeScreens';
import { LoginScreen } from './src/screens/LoginScreen';
import { PlacementScreen } from './src/screens/PlacementScreen';
import { SchoolScreen } from './src/screens/SchoolScreen';
import { CloseFormScreen, PlacementFormScreen, SupervisorsFormScreen } from './src/screens/PlacementForms';
import { LanguageProvider } from './src/state/language';
import { ThemeProvider, useTheme } from './src/state/theme';
import { SessionProvider, useSession, useUser } from './src/state/session';
import { Avatar, Body, Empty, HeroBand, Page } from './src/ui/kit';
import { Icon } from './src/ui/Icon';
import type { IconName } from './src/ui/Icon';
import { colors, lift } from './src/ui/theme';

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
    case 'profile': return t('Profile');
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
    case 'profile': return <ProfileScreen userId={route.userId} />;
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
  const tabName = (tab: 'home' | 'school' | 'account') => (tab === 'home' ? t('Home') : tab === 'school' ? t('School') : t('Account'));
  const first = user.name.trim().split(/\s+/)[0] ?? '';
  const root = !nav.canGoBack;
  const heading = root && nav.tab === 'home' && nav.route.name === 'home' && first ? t('Hello, {name}', { name: first }) : titleFor(nav.route, user.role);

  return (
    <View style={{ flex: 1, backgroundColor: colors.hero }}>
      <HeroBand top={insets.top} bottom={root ? 40 : 30}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 }}>
          {nav.canGoBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={nav.pop}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: root ? 28 : 21, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 }}>
              {heading}
            </Text>
            {root && user.contextLabel ? (
              <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.78)', fontSize: 15, marginTop: 2 }}>{user.contextLabel}</Text>
            ) : null}
          </View>
          {root ? <Avatar name={user.name} uri={user.avatar} size={46} color="rgba(255,255,255,0.18)" ink="#FFFFFF" onPress={() => nav.push({ name: 'profile' })} /> : null}
        </View>
      </HeroBand>

      <View style={{ flex: 1, backgroundColor: colors.sheet, borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -24, overflow: 'hidden' }}>
        <Screen key={`${nav.route.name}:${user.activeId}`} route={nav.route} role={user.role} />
      </View>

      {root ? (
        <View style={[{
          flexDirection: 'row', backgroundColor: colors.sheet, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8,
          borderTopLeftRadius: 26, borderTopRightRadius: 26, marginTop: -26,
        }, lift(1.2)]}>
          {tabs.map((tab) => {
            const active = nav.tab === tab;
            return (
              <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tabName(tab)} accessibilityState={{ selected: active }}
                onPress={() => nav.setTab(tab)}
                style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Icon name={iconFor(tab, active)} size={26} color={active ? colors.accent : colors.muted} />
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: active ? colors.accent : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'light'} />;
}

function Root() {
  const { ready, session } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sheet }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!session) {
    return <View style={{ flex: 1, backgroundColor: colors.sheet }}><LoginScreen /></View>;
  }
  return <NavProvider><Shell /></NavProvider>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <SessionProvider>
            <ThemedStatusBar />
            <Root />
          </SessionProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
