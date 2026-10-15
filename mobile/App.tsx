import 'react-native-reanimated';
import React, { useEffect, useRef } from 'react';
import { NavigationContainer, DarkTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { StyleSheet, Text, Vibration, View } from 'react-native';
import { useStore } from './src/store';
import { COLORS, FONTS } from './src/theme';
import { localList } from './src/api/client';
import { LiveSocket } from './src/api/live';
import ErrorBoundary from './src/components/ErrorBoundary';
import { CussCyberOrbLottie, CussKineticSynthBars } from './src/components/CussArt';
import { ArrowUpRight, Check, AlertTriangle, SpringButton, X } from './src/components/CussIcons';
import PairScreen from './src/screens/PairScreen';
import LandingScreen from './src/screens/LandingScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AgentDetailScreen from './src/screens/AgentDetailScreen';
import CreateAgentScreen from './src/screens/CreateAgentScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const {
    bridgeUrl,
    token,
    hydrated,
    hydrate,
    setLocalAgents,
    completionNotice,
    dismissCompletionNotice,
  } = useStore();
  const navRef = useNavigationContainerRef<any>();
  const lastNotifiedAtRef = useRef<string | null>(null);

  const [fontsLoaded] = useFonts({
    [FONTS.mogi]: require('./assets/fonts/LCMogi-A.ttf'),
    [FONTS.mogiAlt]: require('./assets/fonts/LCMogi-B.ttf'),
    [FONTS.mogiWild]: require('./assets/fonts/LCMogi-C.ttf'),
    [FONTS.mogiVF]: require('./assets/fonts/LCMogi-VF.ttf'),
    [FONTS.display]: require('./assets/fonts/Unbounded-Variable.ttf'),
    [FONTS.syne]: require('./assets/fonts/Syne-Variable.ttf'),
    [FONTS.body]: require('./assets/fonts/SpaceGrotesk-Medium.ttf'),
    [FONTS.bodyBold]: require('./assets/fonts/SpaceGrotesk-Bold.ttf'),
    [FONTS.mono]: require('./assets/fonts/SpaceMono-Regular.ttf'),
    [FONTS.monoBold]: require('./assets/fonts/SpaceMono-Bold.ttf'),
  });

  useEffect(() => {
    void hydrate();
  }, []);

  // Global background watcher so running agents continue tracking & notify when done even if user navigates away
  useEffect(() => {
    if (!hydrated || !bridgeUrl || !token) return;
    const live = new LiveSocket(
      (msg) => {
        if (msg.type === 'local:update' && Array.isArray(msg.agents)) {
          setLocalAgents(msg.agents);
        }
      },
      () => {
        live.send({ type: 'local:watch' });
      },
    );
    live.connect();

    const iv = setInterval(() => {
      localList(false)
        .then((res) => {
          if (Array.isArray(res?.agents)) setLocalAgents(res.agents);
        })
        .catch(() => {});
    }, 3500);

    return () => {
      clearInterval(iv);
      live.close();
    };
  }, [hydrated, bridgeUrl, token]);

  // Trigger tactile vibration & auto-dismiss timer when any background agent finishes
  useEffect(() => {
    if (!completionNotice || completionNotice.at === lastNotifiedAtRef.current) return;
    lastNotifiedAtRef.current = completionNotice.at;
    try {
      Vibration.vibrate([0, 90, 60, 140]);
    } catch {
      /* ignore */
    }
    const timer = setTimeout(() => {
      dismissCompletionNotice();
    }, 8500);
    return () => clearTimeout(timer);
  }, [completionNotice]);

  if (!hydrated || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.bg,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}
      >
        <CussCyberOrbLottie size={64} />
        <CussKineticSynthBars height={18} />
      </View>
    );
  }

  const paired = Boolean(bridgeUrl && token);
  return (
    <ErrorBoundary>
      <NavigationContainer ref={navRef} theme={DarkTheme}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName={paired ? 'Landing' : 'Pair'}
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.bg },
            headerTintColor: COLORS.lime,
            headerTitleStyle: {
              fontFamily: FONTS.monoBold,
              fontSize: 13.5,
              color: COLORS.lime,
            },
            contentStyle: { backgroundColor: COLORS.bg },
          }}
        >
          {!paired ? (
            <Stack.Screen name="Pair" component={PairScreen} options={{ headerShown: false }} />
          ) : (
            <>
              <Stack.Screen
                name="Landing"
                component={LandingScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Dashboard"
                component={DashboardScreen}
                options={{ title: 'CUSS // SESSIONS' }}
              />
              <Stack.Screen
                name="AgentDetail"
                component={AgentDetailScreen}
                options={({ route }: any) => ({
                  title: (route.params.agent.name || 'AGENT').toUpperCase(),
                  headerTitleStyle: {
                    fontFamily: FONTS.mogiAlt,
                    fontSize: 17,
                    color: COLORS.bone,
                  },
                })}
              />
              <Stack.Screen
                name="CreateAgent"
                component={CreateAgentScreen}
                options={{
                  title: 'SPAWN AGENT',
                }}
              />
            </>
          )}
        </Stack.Navigator>

        {/* Global Floating Completion Notification Toast when an agent finishes in the background */}
        {completionNotice ? (
          <View style={styles.toastWrap} pointerEvents="box-none">
            <View
              style={[
                styles.toastCard,
                {
                  borderColor:
                    completionNotice.status === 'error' ? COLORS.magenta : COLORS.lime,
                },
              ]}
            >
              {completionNotice.status === 'error' ? (
                <AlertTriangle size={16} color={COLORS.magenta} />
              ) : (
                <Check size={16} color={COLORS.lime} strokeWidth={2.8} />
              )}
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.toastEyebrow,
                    {
                      color:
                        completionNotice.status === 'error' ? COLORS.magenta : COLORS.lime,
                    },
                  ]}
                >
                  {completionNotice.status === 'error'
                    ? 'AGENT TURN ERROR'
                    : 'AGENT TURN COMPLETED // READY'}
                </Text>
                <Text style={styles.toastTitle} numberOfLines={1}>
                  {completionNotice.agent.name || completionNotice.agent.id}
                </Text>
              </View>
              <SpringButton
                style={styles.toastOpenBtn}
                onPress={() => {
                  const ag = completionNotice.agent;
                  dismissCompletionNotice();
                  navRef.navigate('AgentDetail', {
                    agent: { ...ag, status: ag.lastStatus },
                    kind: 'mac',
                  });
                }}
              >
                <Text style={styles.toastOpenText}>OPEN</Text>
                <ArrowUpRight size={13} color={COLORS.bg} strokeWidth={2.8} />
              </SpringButton>
              <SpringButton hitSlop={8} onPress={dismissCompletionNotice}>
                <X size={15} color={COLORS.muted} />
              </SpringButton>
            </View>
          </View>
        ) : null}
      </NavigationContainer>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  toastWrap: {
    position: 'absolute',
    top: 52,
    left: 14,
    right: 14,
    zIndex: 999,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0E101C',
    borderWidth: 1.8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toastEyebrow: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    letterSpacing: 1,
  },
  toastTitle: {
    fontFamily: FONTS.bodyBold,
    fontSize: 13.5,
    color: COLORS.bone,
    marginTop: 1,
  },
  toastOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.lime,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toastOpenText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.bg,
  },
});
