import 'react-native-reanimated';
import React, { useEffect } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View, ActivityIndicator } from 'react-native';
import { useStore } from './src/store';
import { COLORS, FONTS } from './src/theme';
import ErrorBoundary from './src/components/ErrorBoundary';
import { CussCyberOrbLottie, CussKineticSynthBars } from './src/components/CussArt';
import PairScreen from './src/screens/PairScreen';
import LandingScreen from './src/screens/LandingScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AgentDetailScreen from './src/screens/AgentDetailScreen';
import CreateAgentScreen from './src/screens/CreateAgentScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const { bridgeUrl, token, hydrated, hydrate } = useStore();
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
      <NavigationContainer theme={DarkTheme}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName={paired ? 'Landing' : 'Pair'}
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.bg },
            headerTintColor: COLORS.lime,
            headerTitleStyle: {
              fontFamily: FONTS.mogi,
              fontSize: 22,
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
      </NavigationContainer>
    </ErrorBoundary>
  );
}
