import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { PauseBanner } from "@/components/pause-banner";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { formatTimeLabel } from "@/lib/anti-fraud-engine";
import { useAntiFraud } from "@/lib/anti-fraud-store";
import { FRAUD_TYPE_LABELS, INPUT_MODE_LABELS } from "@/shared/anti-fraud";

export default function MemoryScreen() {
  const router = useRouter();
  const { memory, clearShortTermMemory } = useAntiFraud();

  return (
    <ScreenContainer containerClassName="bg-[#F7FAFC]">
      <PauseBanner variant="memory" />
      <ScrollView className="px-5 pt-4" contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View className="gap-4">
          <View className="gap-1">
            <Text className="text-sm font-medium text-muted">记忆中心</Text>
            <Text className="text-[28px] font-bold leading-[36px] text-foreground">每次核验都是一次经验积累</Text>
            <Text className="text-sm leading-6 text-muted">
              每次核验的结果都保存在这里，帮你下次遇到类似情况时更快判断。
            </Text>
          </View>

          <View className="rounded-[28px] border border-[#D8E8FF] bg-[#EAF4FF] p-5">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-2">
                <View className="self-start rounded-full bg-white/80 px-3 py-1">
                  <Text className="text-xs font-semibold text-primary">记忆概览</Text>
                </View>
                <Text className="text-xl font-bold leading-7 text-[#16324F]">
                  短期 {memory.shortTerm.length} 条 · 历史事件 {memory.recentEvents.length} 条 · 风险标签 {memory.longTerm.riskTags.length} 个
                </Text>
                <Text className="text-sm leading-6 text-[#5F7592]">
                  当前长期画像聚焦于 {memory.longTerm.roleLabel}、{memory.longTerm.ageGroup} 与 {memory.longTerm.occupation} 场景。
                </Text>
              </View>
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white">
                <IconSymbol name="brain.head.profile" size={24} color="#2F80ED" />
              </View>
            </View>

            <View className="mt-4 flex-row gap-3">
              <View className="flex-1 rounded-[18px] bg-white px-4 py-4">
                <Text className="text-xs font-medium text-[#6C819C]">敏感度</Text>
                <Text className="mt-2 text-[24px] font-bold leading-8 text-[#16324F]">{memory.longTerm.sensitivity}</Text>
              </View>
              <View className="flex-1 rounded-[18px] bg-white px-4 py-4">
                <Text className="text-xs font-medium text-[#6C819C]">联系人</Text>
                <Text className="mt-2 text-[24px] font-bold leading-8 text-[#16324F]">{memory.longTerm.preferredGuardians.length}</Text>
              </View>
              <View className="flex-1 rounded-[18px] bg-white px-4 py-4">
                <Text className="text-xs font-medium text-[#6C819C]">备注</Text>
                <Text className="mt-2 text-[24px] font-bold leading-8 text-[#16324F]">{memory.longTerm.notes.length}</Text>
              </View>
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">短期记忆</Text>
              <Pressable onPress={clearShortTermMemory} style={({ pressed }) => [{ opacity: pressed ? 0.68 : 1 }]}>
                <Text className="text-xs font-medium text-primary">清理本次上下文</Text>
              </Pressable>
            </View>
            <Text className="mt-2 text-sm leading-6 text-muted">
              这些内容会参与下一轮识别，帮助系统记住最近的聊天线索、截图判断与待确认问题。
            </Text>
            {memory.shortTerm.length ? (
              <View className="mt-4 gap-3">
                {memory.shortTerm.map((item) => (
                  <View key={item.id} className="rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-row items-center gap-2">
                        <View className="h-8 w-8 items-center justify-center rounded-full bg-white">
                          <IconSymbol
                            name={item.role === "user" ? "person.crop.circle.fill" : item.role === "assistant" ? "shield.lefthalf.fill" : "clock.arrow.circlepath"}
                            size={16}
                            color="#2F80ED"
                          />
                        </View>
                        <Text className="text-sm font-semibold text-foreground">
                          {item.role === "user" ? "用户输入" : item.role === "assistant" ? "系统摘要" : "系统提示"}
                        </Text>
                      </View>
                      <Text className="text-xs text-[#7B8CA5]">{formatTimeLabel(item.timestamp)}</Text>
                    </View>
                    <Text className="mt-3 text-sm leading-6 text-muted">{item.content}</Text>
                    {item.mode ? <Text className="mt-2 text-xs text-[#7B8CA5]">来源：{INPUT_MODE_LABELS[item.mode]}</Text> : null}
                  </View>
                ))}
              </View>
            ) : (
              <View className="mt-4 rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                <Text className="text-sm font-semibold text-foreground">当前没有新的短期上下文</Text>
                <Text className="mt-2 text-sm leading-6 text-muted">
                  先去检测页完成一次文本、语音摘要或截图分析，新的线索会自动写入这里，用于支撑下一轮连续判断。
                </Text>
                <Pressable onPress={() => router.push("./detect")} style={({ pressed }) => [{ marginTop: 14, opacity: pressed ? 0.68 : 1 }]}> 
                  <Text className="text-sm font-semibold text-primary">去添加新的检测线索</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <Text className="text-base font-semibold text-foreground">长期画像</Text>
            <View className="mt-4 gap-3">
              <View className="rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                <Text className="text-sm font-semibold text-foreground">基础角色</Text>
                <Text className="mt-2 text-sm leading-6 text-muted">
                  {memory.longTerm.nickname} · {memory.longTerm.roleLabel} · {memory.longTerm.ageGroup} · {memory.longTerm.occupation}
                </Text>
              </View>
              <View className="rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                <Text className="text-sm font-semibold text-foreground">风险敏感度</Text>
                <Text className="mt-2 text-sm leading-6 text-muted">
                  当前敏感度评分为 {memory.longTerm.sensitivity} / 100，系统会在高风险阶段优先放大强提醒与监护建议。
                </Text>
                <View className="mt-3 h-3 overflow-hidden rounded-full bg-[#E7EEF6]">
                  <View style={{ width: `${Math.max(10, Math.min(100, memory.longTerm.sensitivity))}%`, height: 12, backgroundColor: "#2F80ED" }} />
                </View>
              </View>
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <Text className="text-base font-semibold text-foreground">长期风险标签</Text>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {memory.longTerm.riskTags.map((tag) => (
                <View key={tag} className="rounded-full bg-[#EEF5FF] px-3 py-2">
                  <Text className="text-xs font-medium text-primary">{tag}</Text>
                </View>
              ))}
            </View>
            <View className="mt-4 gap-3">
              {memory.longTerm.notes.map((note) => (
                <View key={note} className="rounded-[16px] bg-[#F8FBFE] px-4 py-3">
                  <Text className="text-sm leading-6 text-muted">{note}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">历史高风险事件</Text>
              <Pressable onPress={() => router.push("./report")} style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}>
                <Text className="text-xs font-medium text-primary">查看报告页</Text>
              </Pressable>
            </View>
            {memory.recentEvents.length ? (
              <View className="mt-4 gap-3">
                {memory.recentEvents.slice(0, 5).map((item) => (
                  <View key={item.id} className="rounded-[18px] bg-[#FFF8F8] px-4 py-4">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="flex-1 text-sm font-semibold text-foreground">{item.title}</Text>
                      <Text className="text-xs font-medium text-[#D16A6D]">{item.score} 分</Text>
                    </View>
                    <Text className="mt-2 text-sm leading-6 text-muted">{item.summary}</Text>
                    <Text className="mt-2 text-xs text-[#7B8CA5]">
                      {formatTimeLabel(item.createdAt)} · {INPUT_MODE_LABELS[item.sourceMode]} · {FRAUD_TYPE_LABELS[item.fraudType]}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View className="mt-4 rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                <Text className="text-sm font-semibold text-foreground">还没有沉淀历史高风险事件</Text>
                <Text className="mt-2 text-sm leading-6 text-muted">
                  完成第一次检测后，系统会把风险结论沉淀为历史事件，并在后续检测与报告中继续参考这些长期信号。
                </Text>
              </View>
            )}
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">监护联系人</Text>
              <Text className="text-xs text-muted">长期联动预留</Text>
            </View>
            <View className="mt-4 gap-3">
              {memory.longTerm.preferredGuardians.map((guardian) => (
                <View key={guardian.id} className="flex-row items-center gap-4 rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                  <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white">
                    <IconSymbol name="person.2.fill" size={20} color="#2F80ED" />
                  </View>
                  <View className="flex-1 gap-1">
                    <Text className="text-sm font-semibold text-foreground">{guardian.name}</Text>
                    <Text className="text-sm text-muted">{guardian.relation} · {guardian.phone}</Text>
                  </View>
                  <View className="rounded-full px-3 py-1" style={{ backgroundColor: guardian.enabled ? "#E8FFF1" : "#F2F4F7" }}>
                    <Text style={{ color: guardian.enabled ? "#1F9B52" : "#7B8CA5" }} className="text-xs font-semibold">
                      {guardian.enabled ? "已启用" : "未启用"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <Text className="text-base font-semibold text-foreground">快捷操作</Text>
            <View className="mt-4 flex-row gap-3">
              <Pressable
                onPress={() => router.push("./detect")}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    borderRadius: 18,
                    backgroundColor: "#2F80ED",
                    paddingVertical: 14,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Text className="text-center text-sm font-semibold text-white">继续检测</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("./report")}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    borderRadius: 18,
                    backgroundColor: "#F1F7FF",
                    paddingVertical: 14,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <Text className="text-center text-sm font-semibold text-primary">查看报告</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
