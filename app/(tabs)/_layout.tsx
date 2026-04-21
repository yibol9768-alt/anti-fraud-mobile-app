import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 6);
  const tabBarHeight = 54 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          paddingTop: 6,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          lineHeight: 12,
          fontWeight: "600",
          marginTop: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "首页",
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="detect"
        options={{
          title: "检测",
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="waveform.path.ecg" color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "助手",
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="bubble.left.and.bubble.right.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: "报告",
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="doc.text.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="memory"
        options={{
          title: "记忆",
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="brain.head.profile" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "我的",
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="person.crop.circle.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
