/**
 * Android 守护版设置页面
 *
 * 功能：
 * 1. 权限授权引导 - 分步引导用户授予短信、图库、通知、电池优化等权限
 * 2. 守护通知联动 - 开启/关闭前台服务通知，实时监控短信和图库变化
 * 3. 可见守护模式 - 常驻通知栏显示守护状态，用户可随时关闭
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface PermissionItem {
  key: string;
  title: string;
  description: string;
  icon: Parameters<typeof IconSymbol>[0]["name"];
  granted: boolean;
  required: boolean;
}

interface GuardianState {
  permissionState: {
    smsGranted: boolean;
    mediaGranted: boolean;
    notificationsGranted: boolean;
    batteryOptimizationIgnored: boolean;
  };
  monitoringActive: boolean;
  loading: boolean;
}

/* ------------------------------------------------------------------ */
/*  Guardian hook (cross-platform safe)                               */
/* ------------------------------------------------------------------ */

function useGuardianModule() {
  const isAndroid = Platform.OS === "android";

  const getModule = useCallback(async () => {
    if (!isAndroid) return null;
    try {
      const mod = await import("@/modules/a30-guardian");
      return mod.default;
    } catch {
      return null;
    }
  }, [isAndroid]);

  return { isAndroid, getModule };
}

/* ------------------------------------------------------------------ */
/*  Permission card                                                   */
/* ------------------------------------------------------------------ */

function PermissionCard({
  item,
  index,
  onRequest,
}: {
  item: PermissionItem;
  index: number;
  onRequest: () => void;
}) {
  const colors = useColors();

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(300)}>
      <View
        style={[
          styles.permissionCard,
          {
            backgroundColor: item.granted ? `${colors.success}08` : colors.surface,
            borderColor: item.granted ? colors.success : colors.border,
          },
        ]}
      >
        <View style={styles.permissionCardHeader}>
          <View
            style={[
              styles.permissionIcon,
              { backgroundColor: item.granted ? `${colors.success}15` : `${colors.primary}10` },
            ]}
          >
            <IconSymbol
              name={item.icon}
              size={20}
              color={item.granted ? colors.success : colors.primary}
            />
          </View>
          <View style={styles.permissionInfo}>
            <View style={styles.permissionTitleRow}>
              <Text style={[styles.permissionTitle, { color: colors.foreground }]}>
                {item.title}
              </Text>
              {item.required && (
                <View style={[styles.requiredBadge, { backgroundColor: `${colors.error}15` }]}>
                  <Text style={[styles.requiredText, { color: colors.error }]}>必需</Text>
                </View>
              )}
            </View>
            <Text style={[styles.permissionDesc, { color: colors.muted }]}>
              {item.description}
            </Text>
          </View>
          {item.granted ? (
            <View style={[styles.grantedBadge, { backgroundColor: `${colors.success}15` }]}>
              <IconSymbol name="checkmark.shield.fill" size={16} color={colors.success} />
              <Text style={[styles.grantedText, { color: colors.success }]}>已授权</Text>
            </View>
          ) : (
            <Pressable
              onPress={onRequest}
              style={({ pressed }) => [
                styles.grantButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.grantButtonText}>授权</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/*  Main screen                                                       */
/* ------------------------------------------------------------------ */

export default function GuardianSettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAndroid, getModule } = useGuardianModule();

  const [state, setState] = useState<GuardianState>({
    permissionState: {
      smsGranted: false,
      mediaGranted: false,
      notificationsGranted: false,
      batteryOptimizationIgnored: false,
    },
    monitoringActive: false,
    loading: true,
  });

  // Load initial state
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const mod = await getModule();
        if (!mod || !mounted) {
          if (mounted) setState((s) => ({ ...s, loading: false }));
          return;
        }
        const bootstrap = await mod.getBootstrapStateAsync();
        const monitoring = await mod.isGuardianMonitoringActiveAsync();
        if (mounted) {
          setState({
            permissionState: bootstrap.permissionState,
            monitoringActive: monitoring,
            loading: false,
          });
        }
      } catch {
        if (mounted) setState((s) => ({ ...s, loading: false }));
      }
    }
    load();
    return () => { mounted = false; };
  }, [getModule]);

  const refreshPermissions = useCallback(async () => {
    const mod = await getModule();
    if (!mod) return;
    try {
      const result = await mod.requestGuardianPermissionsAsync();
      setState((s) => ({ ...s, permissionState: result }));
    } catch (error) {
      console.warn("refresh permissions failed", error);
    }
  }, [getModule]);

  const toggleMonitoring = useCallback(
    async (enable: boolean) => {
      const mod = await getModule();
      if (!mod) return;

      try {
        if (enable) {
          // Check minimum permissions
          if (!state.permissionState.notificationsGranted) {
            Alert.alert(
              "需要通知权限",
              "守护模式需要通知权限来显示常驻守护状态。请先授予通知权限。",
              [{ text: "好的" }],
            );
            return;
          }
          await mod.startGuardianMonitoringAsync();
          setState((s) => ({ ...s, monitoringActive: true }));
        } else {
          await mod.stopGuardianMonitoringAsync();
          setState((s) => ({ ...s, monitoringActive: false }));
        }
      } catch (error) {
        console.warn("toggle monitoring failed", error);
        Alert.alert("操作失败", "请稍后重试或检查系统设置。");
      }
    },
    [getModule, state.permissionState.notificationsGranted],
  );

  const openAppSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  const permissions: PermissionItem[] = [
    {
      key: "sms",
      title: "短信读取",
      description: "读取收件箱短信，自动识别诈骗话术和可疑链接。不会发送或修改任何短信。",
      icon: "paperplane.fill",
      granted: state.permissionState.smsGranted,
      required: true,
    },
    {
      key: "media",
      title: "图库访问",
      description: "扫描最近截图和聊天图片，识别转账页面、身份冒充和钓鱼界面。",
      icon: "photo.on.rectangle",
      granted: state.permissionState.mediaGranted,
      required: true,
    },
    {
      key: "notifications",
      title: "通知权限",
      description: "发现可疑内容时即时推送警告通知，守护模式需要此权限保持常驻通知。",
      icon: "bell.fill",
      granted: state.permissionState.notificationsGranted,
      required: true,
    },
    {
      key: "battery",
      title: "忽略电池优化",
      description: "防止系统在后台杀死守护服务。不会显著增加耗电量。",
      icon: "shield.lefthalf.fill",
      granted: state.permissionState.batteryOptimizationIgnored,
      required: false,
    },
  ];

  const grantedCount = permissions.filter((p) => p.granted).length;
  const allGranted = grantedCount === permissions.length;

  // Non-Android fallback
  if (!isAndroid) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5 pt-4" containerClassName="bg-[#F7FAFC]">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="chevron.right" size={24} color={colors.foreground} style={{ transform: [{ scaleX: -1 }] }} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>守护中心</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.nonAndroidContainer}>
          <IconSymbol name="shield.lefthalf.fill" size={48} color={colors.muted} />
          <Text style={[styles.nonAndroidTitle, { color: colors.foreground }]}>仅限 Android 设备</Text>
          <Text style={[styles.nonAndroidDesc, { color: colors.muted }]}>
            守护中心的短信监控、图库扫描和后台守护服务仅在 Android 设备上可用。iOS 设备受系统限制无法提供相同功能。
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (state.loading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5 pt-4" containerClassName="bg-[#F7FAFC]">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>正在检查系统权限...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5 pt-4" containerClassName="bg-[#F7FAFC]">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
          <IconSymbol name="chevron.right" size={24} color={colors.foreground} style={{ transform: [{ scaleX: -1 }] }} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>守护中心</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Status overview */}
          <View style={[styles.statusCard, { backgroundColor: state.monitoringActive ? "#16324F" : colors.surface }]}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusIconBg, { backgroundColor: state.monitoringActive ? "rgba(255,255,255,0.1)" : `${colors.primary}10` }]}>
                <IconSymbol
                  name="shield.lefthalf.fill"
                  size={28}
                  color={state.monitoringActive ? "#ffffff" : colors.primary}
                />
              </View>
              <View style={styles.statusInfo}>
                <Text style={[styles.statusTitle, { color: state.monitoringActive ? "#ffffff" : colors.foreground }]}>
                  {state.monitoringActive ? "守护模式运行中" : "守护模式未启动"}
                </Text>
                <Text style={[styles.statusDesc, { color: state.monitoringActive ? "#D6E4F3" : colors.muted }]}>
                  {state.monitoringActive
                    ? "正在监控短信和图库变化，发现可疑内容将即时通知"
                    : "开启后将在后台持续监控，通过常驻通知保持可见"}
                </Text>
              </View>
            </View>
            <View style={styles.statusStats}>
              <View style={[styles.statItem, { backgroundColor: state.monitoringActive ? "rgba(255,255,255,0.08)" : `${colors.primary}08` }]}>
                <Text style={[styles.statValue, { color: state.monitoringActive ? "#ffffff" : colors.foreground }]}>
                  {grantedCount}/{permissions.length}
                </Text>
                <Text style={[styles.statLabel, { color: state.monitoringActive ? "#C8D7E7" : colors.muted }]}>
                  已授权
                </Text>
              </View>
              <View style={[styles.statItem, { backgroundColor: state.monitoringActive ? "rgba(255,255,255,0.08)" : `${colors.primary}08` }]}>
                <Text style={[styles.statValue, { color: state.monitoringActive ? "#ffffff" : colors.foreground }]}>
                  {state.monitoringActive ? "活跃" : "关闭"}
                </Text>
                <Text style={[styles.statLabel, { color: state.monitoringActive ? "#C8D7E7" : colors.muted }]}>
                  监控状态
                </Text>
              </View>
            </View>
          </View>

          {/* Guardian mode toggle */}
          <View style={[styles.section, { backgroundColor: "#ffffff", borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>可见守护模式</Text>
            <View style={[styles.toggleRow, { backgroundColor: colors.surface }]}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleTitle, { color: colors.foreground }]}>后台守护服务</Text>
                <Text style={[styles.toggleDesc, { color: colors.muted }]}>
                  开启后在通知栏显示常驻守护通知，实时监控短信收件箱和系统图库变化
                </Text>
              </View>
              <Switch
                value={state.monitoringActive}
                onValueChange={toggleMonitoring}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#ffffff"
              />
            </View>

            {state.monitoringActive && (
              <Animated.View entering={FadeInDown.duration(250)}>
                <View style={[styles.activeInfo, { backgroundColor: `${colors.success}08`, borderColor: colors.success }]}>
                  <IconSymbol name="checkmark.shield.fill" size={16} color={colors.success} />
                  <Text style={[styles.activeInfoText, { color: colors.success }]}>
                    守护服务正在运行。通知栏会显示"A30 守护中心正在运行"常驻通知。发现可疑短信或截图时会推送独立警告通知。
                  </Text>
                </View>
              </Animated.View>
            )}

            <View style={[styles.privacyNote, { backgroundColor: `${colors.warning}08` }]}>
              <IconSymbol name="exclamationmark.triangle.fill" size={14} color={colors.warning} />
              <Text style={[styles.privacyNoteText, { color: colors.muted }]}>
                所有数据仅在本地处理，不会上传到任何服务器。你可以随时关闭守护服务。
              </Text>
            </View>
          </View>

          {/* Permission list */}
          <View style={[styles.section, { backgroundColor: "#ffffff", borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>权限授权引导</Text>
              {allGranted ? (
                <View style={[styles.allGrantedBadge, { backgroundColor: `${colors.success}15` }]}>
                  <Text style={[styles.allGrantedText, { color: colors.success }]}>全部就绪</Text>
                </View>
              ) : (
                <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
                  {grantedCount}/{permissions.length} 已授权
                </Text>
              )}
            </View>

            <View style={styles.permissionList}>
              {permissions.map((item, index) => (
                <PermissionCard
                  key={item.key}
                  item={item}
                  index={index}
                  onRequest={async () => {
                    await refreshPermissions();
                    if (!permissions.find((p) => p.key === item.key)?.granted) {
                      openAppSettings();
                    }
                  }}
                />
              ))}
            </View>

            <Pressable
              onPress={openAppSettings}
              style={({ pressed }) => [
                styles.settingsButton,
                { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <IconSymbol name="gearshape.fill" size={16} color={colors.primary} />
              <Text style={[styles.settingsButtonText, { color: colors.primary }]}>打开系统设置</Text>
            </Pressable>
          </View>

          {/* Risk notice / kill switch */}
          <View style={[styles.section, { backgroundColor: "#ffffff", borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>安全说明</Text>
            <View style={styles.noticeList}>
              {[
                "守护服务使用 Android 前台服务机制，通知栏会显示常驻通知，这是系统要求。",
                "短信扫描仅读取收件箱内容，不会发送、修改或删除任何短信。",
                "图库扫描仅读取文件元数据和缩略图，不会修改或删除任何照片。",
                "所有风险判断均在本地完成，不会将短信内容或图片上传到任何服务器。",
                "你可以随时在此页面关闭守护服务，或在系统设置中撤销任何权限。",
              ].map((text, i) => (
                <View key={i} style={[styles.noticeItem, { backgroundColor: colors.surface }]}>
                  <View style={[styles.noticeDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.noticeText, { color: colors.muted }]}>{text}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    gap: 16,
  },
  statusCard: {
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  statusIconBg: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  statusInfo: {
    flex: 1,
    gap: 4,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  statusDesc: {
    fontSize: 13,
    lineHeight: 20,
  },
  statusStats: {
    flexDirection: "row",
    gap: 12,
  },
  statItem: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
  },
  section: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  sectionSubtitle: {
    fontSize: 12,
  },
  allGrantedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  allGrantedText: {
    fontSize: 12,
    fontWeight: "600",
  },
  permissionList: {
    gap: 10,
  },
  permissionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  permissionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  permissionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionInfo: {
    flex: 1,
    gap: 3,
  },
  permissionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  requiredBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  requiredText: {
    fontSize: 10,
    fontWeight: "600",
  },
  permissionDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  grantedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  grantedText: {
    fontSize: 12,
    fontWeight: "600",
  },
  grantButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  grantButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    padding: 14,
  },
  toggleInfo: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  toggleDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  activeInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  activeInfoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 14,
    padding: 12,
  },
  privacyNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  settingsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 16,
    paddingVertical: 12,
  },
  settingsButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  noticeList: {
    gap: 8,
  },
  noticeItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 12,
  },
  noticeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  nonAndroidContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  nonAndroidTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  nonAndroidDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
  },
});
