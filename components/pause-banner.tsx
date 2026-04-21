/**
 * PauseBanner — 全局「先暂停，再核验」提示横幅
 *
 * 显示在每个主要页面顶部，提醒用户遇到可疑情况时先停下来。
 * 可通过 variant 属性调整语境文案。
 */
import { StyleSheet, Text, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";

export type PauseBannerVariant =
  | "default"   // 先暂停，再核验
  | "phone"     // 接到可疑电话？先挂起，再说一句
  | "sms"       // 收到可疑短信？先别点，再核验
  | "screenshot" // 看到可疑页面？先截图，再分析
  | "chat"      // 不确定？先暂停，问问我
  | "report"    // 已记录，先别行动，看完报告再决定
  | "memory";   // 历史记录，随时回顾，帮助下次判断

const BANNER_CONTENT: Record<PauseBannerVariant, { text: string; sub?: string }> = {
  default: {
    text: "先暂停，再核验",
    sub: "遇到可疑情况，第一步是停下来。",
  },
  phone: {
    text: "接到可疑电话？先挂起，再说一句",
    sub: "不要转账、不要共享屏幕，先把情况告诉我。",
  },
  sms: {
    text: "收到可疑短信？先别点链接，再核验",
    sub: "把短信内容粘贴过来，我帮你判断风险。",
  },
  screenshot: {
    text: "看到可疑页面？先截图，再让我分析",
    sub: "不要操作，先把截图发给我看看。",
  },
  chat: {
    text: "不确定是不是诈骗？先暂停，问问我",
    sub: "随时告诉我情况，我来帮你判断。",
  },
  report: {
    text: "先别行动，看完报告再决定",
    sub: "报告已生成，请先仔细阅读再做下一步操作。",
  },
  memory: {
    text: "历史记录帮你下次更快判断",
    sub: "每次核验都会积累经验，保护你和家人。",
  },
};

interface PauseBannerProps {
  variant?: PauseBannerVariant;
}

export function PauseBanner({ variant = "default" }: PauseBannerProps) {
  const { text, sub } = BANNER_CONTENT[variant];

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <IconSymbol name="hand.raised.fill" size={18} color="#F57C00" />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.mainText}>{text}</Text>
        {sub ? <Text style={styles.subText}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF8F0",
    borderBottomWidth: 1,
    borderBottomColor: "#FFE0B2",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#FFF3E0",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  mainText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E65100",
    lineHeight: 18,
  },
  subText: {
    fontSize: 12,
    color: "#BF360C",
    lineHeight: 17,
    marginTop: 1,
  },
  textWrap: {
    flex: 1,
  },
});
