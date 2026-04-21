import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAntiFraud } from "@/lib/anti-fraud-store";
import { useAuthStore } from "@/lib/auth-store";

export default function ProfileScreen() {
  const router = useRouter();
  const { memory, latestReport } = useAntiFraud();
  const { profile, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert(
      "退出登录",
      "退出后将清除本机保存的个人信息，但检测记忆和报告数据不受影响。确认退出吗？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认退出",
          style: "destructive",
          onPress: async () => {
            if (Platform.OS !== "web") {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            await logout();
            // Force navigate to login after logout — don't rely on Redirect
            router.replace("/login");
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer className="px-5 pt-4" containerClassName="bg-[#F7FAFC]">
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={styles.gap4}>
          {/* Page title */}
          <View style={styles.gap1}>
            <Text style={styles.pageLabel}>我的</Text>
            <Text style={styles.pageTitle}>把防护习惯、联系人和系统能力放在一起管理</Text>
          </View>

          {/* User identity card */}
          <View style={[styles.identityCard, { backgroundColor: "#16324F" }]}>
            <View style={styles.identityRow}>
              <View style={styles.identityLeft}>
                <View style={styles.identityBadge}>
                  <Text style={styles.identityBadgeText}>当前用户</Text>
                </View>
                <Text style={styles.identityName}>{profile?.name ?? memory.longTerm.nickname}</Text>
                {profile?.phone ? (
                  <Text style={styles.identityPhone}>{profile.phone}</Text>
                ) : null}
                {profile?.emergencyContact ? (
                  <View style={styles.emergencyRow}>
                    <IconSymbol name="person.2.fill" size={13} color="#A8C4E0" />
                    <Text style={styles.emergencyText}>
                      紧急联系人：{profile.emergencyContact.name}（{profile.emergencyContact.relation}）{profile.emergencyContact.phone}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.identityHint}>暂未设置紧急联系人</Text>
                )}
              </View>
              <View style={styles.identityIconBox}>
                <IconSymbol name="person.crop.circle.fill" size={28} color="#FFFFFF" />
              </View>
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>风险评分</Text>
                <Text style={styles.statValue}>{latestReport.score}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>监护联系人</Text>
                <Text style={styles.statValue}>{memory.longTerm.preferredGuardians.length}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>历史事件</Text>
                <Text style={styles.statValue}>{memory.recentEvents.length}</Text>
              </View>
            </View>

            {/* Logout button */}
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.logoutButton,
                { opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <IconSymbol name="power" size={15} color="#F87171" />
              <Text style={styles.logoutText}>退出登录</Text>
            </Pressable>
          </View>

          {/* Emergency contact quick action */}
          {!profile?.emergencyContact && (
            <Pressable
              onPress={() => router.push("/login")}
              style={({ pressed }) => [
                styles.emergencySetupCard,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={styles.emergencySetupLeft}>
                <View style={styles.emergencySetupIcon}>
                  <IconSymbol name="person.crop.circle.badge.plus" size={22} color="#2F80ED" />
                </View>
                <View style={styles.emergencySetupText}>
                  <Text style={styles.emergencySetupTitle}>设置紧急联系人</Text>
                  <Text style={styles.emergencySetupDesc}>遇到风险时快速发送提醒短信给家人</Text>
                </View>
              </View>
              <IconSymbol name="chevron.right" size={18} color="#9BB0C7" />
            </Pressable>
          )}

          {/* Long-term profile card */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>长期防护设置</Text>
            <View style={styles.gap3}>
              <View style={styles.settingItem}>
                <Text style={styles.settingLabel}>风险敏感度</Text>
                <Text style={styles.settingDesc}>
                  当前为 {memory.longTerm.sensitivity} / 100。后续可以把该值继续联动更强预警阈值、监护通知与高风险确认流程。
                </Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${Math.max(10, Math.min(100, memory.longTerm.sensitivity))}%` }]} />
                </View>
              </View>
              <View style={styles.settingItem}>
                <Text style={styles.settingLabel}>重点关注标签</Text>
                <View style={styles.tagsRow}>
                  {memory.longTerm.riskTags.length > 0
                    ? memory.longTerm.riskTags.map((tag) => (
                        <View key={tag} style={styles.tag}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))
                    : <Text style={styles.emptyText}>暂无风险标签</Text>
                  }
                </View>
              </View>
            </View>
          </View>

          {/* Guardian contacts */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>监护联系人</Text>
              <Text style={styles.sectionBadge}>紧急联动预留</Text>
            </View>
            <View style={styles.gap3}>
              {memory.longTerm.preferredGuardians.length > 0
                ? memory.longTerm.preferredGuardians.map((guardian) => (
                    <View key={guardian.id} style={styles.guardianItem}>
                      <View style={styles.guardianIcon}>
                        <IconSymbol name="person.2.fill" size={20} color="#2F80ED" />
                      </View>
                      <View style={styles.guardianInfo}>
                        <Text style={styles.guardianName}>{guardian.name}</Text>
                        <Text style={styles.guardianMeta}>{guardian.relation} · {guardian.phone}</Text>
                      </View>
                      <View style={[styles.guardianStatus, { backgroundColor: guardian.enabled ? "#E8FFF1" : "#F2F4F7" }]}>
                        <Text style={[styles.guardianStatusText, { color: guardian.enabled ? "#1F9B52" : "#7B8CA5" }]}>
                          {guardian.enabled ? "已启用" : "待启用"}
                        </Text>
                      </View>
                    </View>
                  ))
                : (
                    <View style={styles.emptyGuardian}>
                      <IconSymbol name="person.2.fill" size={24} color="#C8D7E7" />
                      <Text style={styles.emptyGuardianText}>暂无监护联系人</Text>
                      <Text style={styles.emptyGuardianHint}>在注册页面可以设置紧急联系人</Text>
                    </View>
                  )
              }
            </View>
          </View>

          {/* Service status */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>服务接入状态</Text>
            <View style={styles.gap3}>
              {[
                {
                  title: "Doubao 主分析模型",
                  desc: "已启用，用于生成诈骗结论、解释说明、追问问题与处置建议。",
                  status: "运行中",
                  statusColor: "#1F9B52",
                  icon: "shield.lefthalf.fill" as const,
                },
                {
                  title: "多模态 Embedding 检索",
                  desc: "已启用，用于文本与图片线索的语义召回，并支撑证据与案例匹配。",
                  status: "运行中",
                  statusColor: "#1F9B52",
                  icon: "brain.head.profile" as const,
                },
                {
                  title: "本地回退分析闭环",
                  desc: "已保留，当远程能力不可用时可继续完成风险识别、记忆合并与报告生成。",
                  status: "就绪",
                  statusColor: "#1F9B52",
                  icon: "doc.text.fill" as const,
                },
                {
                  title: "Dify 自部署接入层",
                  desc: "仍为预留能力位。完成自部署并提供地址后，可替换当前部分编排与检索流程。",
                  status: "待接入",
                  statusColor: "#C28600",
                  icon: "chevron.left.forwardslash.chevron.right" as const,
                },
              ].map((item) => (
                <View key={item.title} style={styles.serviceItem}>
                  <View style={styles.serviceIcon}>
                    <IconSymbol name={item.icon} size={18} color="#2F80ED" />
                  </View>
                  <View style={styles.serviceInfo}>
                    <Text style={styles.serviceTitle}>{item.title}</Text>
                    <Text style={styles.serviceDesc}>{item.desc}</Text>
                  </View>
                  <Text style={[styles.serviceStatus, { color: item.statusColor }]}>
                    {item.status}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Android guardian */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Android 守护中心</Text>
              <Text style={styles.sectionBadge}>仅限 Android</Text>
            </View>
            <View style={styles.gap3}>
              <Pressable
                onPress={() => router.push("/guardian-settings")}
                style={({ pressed }) => [
                  styles.guardianSettingsButton,
                  { backgroundColor: pressed ? "#F4F8FC" : "#FFFFFF" },
                ]}
              >
                <View style={styles.guardianSettingsIcon}>
                  <IconSymbol name="shield.lefthalf.fill" size={22} color="#2F80ED" />
                </View>
                <View style={styles.guardianSettingsInfo}>
                  <Text style={styles.guardianSettingsTitle}>权限与守护设置</Text>
                  <Text style={styles.guardianSettingsDesc}>管理短信、图库、通知权限，开启后台守护服务</Text>
                </View>
                <IconSymbol name="chevron.right" size={20} color="#9BB0C7" />
              </Pressable>
            </View>
          </View>

          {/* Quick actions */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>常用入口</Text>
            <View style={styles.quickActionsRow}>
              <Pressable
                onPress={() => router.push("./detect")}
                style={({ pressed }) => [styles.quickActionBtn, styles.quickActionBtnPrimary, { opacity: pressed ? 0.9 : 1 }]}
              >
                <Text style={styles.quickActionTextWhite}>去检测</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("./memory")}
                style={({ pressed }) => [styles.quickActionBtn, styles.quickActionBtnSecondary, { opacity: pressed ? 0.72 : 1 }]}
              >
                <Text style={styles.quickActionTextPrimary}>看记忆</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("./report")}
                style={({ pressed }) => [styles.quickActionBtn, styles.quickActionBtnSecondary, { opacity: pressed ? 0.72 : 1 }]}
              >
                <Text style={styles.quickActionTextPrimary}>看报告</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  gap1: { gap: 4 },
  gap3: { gap: 12 },
  gap4: { gap: 16 },
  pageLabel: { fontSize: 13, fontWeight: "500", color: "#687076" },
  pageTitle: { fontSize: 22, fontWeight: "700", lineHeight: 30, color: "#11181C" },
  // Identity card
  identityCard: { borderRadius: 28, padding: 20, gap: 16 },
  identityRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  identityLeft: { flex: 1, gap: 6 },
  identityBadge: { alignSelf: "flex-start", borderRadius: 99, backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 12, paddingVertical: 4 },
  identityBadgeText: { fontSize: 11, fontWeight: "600", color: "#ffffff" },
  identityName: { fontSize: 22, fontWeight: "700", color: "#ffffff" },
  identityPhone: { fontSize: 14, color: "#A8C4E0" },
  emergencyRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  emergencyText: { fontSize: 12, color: "#A8C4E0", flex: 1 },
  identityHint: { fontSize: 12, color: "#7B9DB8" },
  identityIconBox: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)" },
  statsRow: { flexDirection: "row", gap: 12 },
  statItem: { flex: 1, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 16, paddingVertical: 16 },
  statLabel: { fontSize: 11, fontWeight: "500", color: "#C8D7E7" },
  statValue: { marginTop: 8, fontSize: 22, fontWeight: "700", color: "#ffffff" },
  logoutButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, borderWidth: 1, borderColor: "rgba(248,113,113,0.3)", paddingVertical: 12 },
  logoutText: { fontSize: 14, fontWeight: "600", color: "#F87171" },
  // Emergency setup
  emergencySetupCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 20, borderWidth: 1.5, borderColor: "#D8E8FF", backgroundColor: "#EAF4FF", paddingHorizontal: 16, paddingVertical: 16 },
  emergencySetupLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  emergencySetupIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#ffffff" },
  emergencySetupText: { flex: 1, gap: 2 },
  emergencySetupTitle: { fontSize: 15, fontWeight: "600", color: "#16324F" },
  emergencySetupDesc: { fontSize: 12, color: "#5F7592" },
  // Section card
  sectionCard: { borderRadius: 24, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#ffffff", padding: 16, gap: 16 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#11181C" },
  sectionBadge: { fontSize: 11, color: "#687076" },
  settingItem: { borderRadius: 18, backgroundColor: "#F8FBFE", paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  settingLabel: { fontSize: 13, fontWeight: "600", color: "#11181C" },
  settingDesc: { fontSize: 13, lineHeight: 20, color: "#687076" },
  progressBar: { height: 12, borderRadius: 99, backgroundColor: "#E7EEF6", overflow: "hidden" },
  progressFill: { height: 12, backgroundColor: "#2F80ED" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { borderRadius: 99, backgroundColor: "#EEF5FF", paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 12, fontWeight: "500", color: "#2F80ED" },
  emptyText: { fontSize: 13, color: "#9BB0C7" },
  // Guardian contacts
  guardianItem: { flexDirection: "row", alignItems: "center", gap: 16, borderRadius: 18, backgroundColor: "#F8FBFE", paddingHorizontal: 16, paddingVertical: 16 },
  guardianIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#ffffff" },
  guardianInfo: { flex: 1, gap: 4 },
  guardianName: { fontSize: 14, fontWeight: "600", color: "#11181C" },
  guardianMeta: { fontSize: 13, color: "#687076" },
  guardianStatus: { borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  guardianStatusText: { fontSize: 11, fontWeight: "600" },
  emptyGuardian: { alignItems: "center", paddingVertical: 20, gap: 8 },
  emptyGuardianText: { fontSize: 14, fontWeight: "500", color: "#9BB0C7" },
  emptyGuardianHint: { fontSize: 12, color: "#C0CDD8" },
  // Service items
  serviceItem: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, backgroundColor: "#F8FBFE", paddingHorizontal: 16, paddingVertical: 16 },
  serviceIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#EEF5FF" },
  serviceInfo: { flex: 1, gap: 4 },
  serviceTitle: { fontSize: 13, fontWeight: "600", color: "#11181C" },
  serviceDesc: { fontSize: 12, lineHeight: 18, color: "#687076" },
  serviceStatus: { fontSize: 11, fontWeight: "600" },
  // Guardian settings
  guardianSettingsButton: { flexDirection: "row", alignItems: "center", gap: 16, borderRadius: 20, borderWidth: 1, borderColor: "#DCE6F2", padding: 16 },
  guardianSettingsIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#F1F7FF" },
  guardianSettingsInfo: { flex: 1, gap: 4 },
  guardianSettingsTitle: { fontSize: 15, fontWeight: "600", color: "#11181C" },
  guardianSettingsDesc: { fontSize: 13, lineHeight: 18, color: "#687076" },
  // Quick actions
  quickActionsRow: { flexDirection: "row", gap: 12 },
  quickActionBtn: { flex: 1, borderRadius: 18, paddingVertical: 14, alignItems: "center" },
  quickActionBtnPrimary: { backgroundColor: "#2F80ED" },
  quickActionBtnSecondary: { backgroundColor: "#F1F7FF" },
  quickActionTextWhite: { fontSize: 13, fontWeight: "600", color: "#ffffff" },
  quickActionTextPrimary: { fontSize: 13, fontWeight: "600", color: "#2F80ED" },
});
