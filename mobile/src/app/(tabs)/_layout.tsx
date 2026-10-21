import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { TabBar } from '@/components/TabBar';
import { MorningVoice } from '@/components/Voice';
import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="understand" />
        <Tabs.Screen name="calendar" />
      </Tabs>
      {/* Lời chào buổi sáng tự phát khi mở app, đè lên mọi tab. */}
      <MorningVoice />
    </View>
  );
}
