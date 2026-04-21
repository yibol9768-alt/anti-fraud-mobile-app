import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";

import { useColors } from "@/hooks/use-colors";
import { useAuthStore } from "@/lib/auth-store";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function LoginScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuthStore();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPickingContact, setIsPickingContact] = useState(false);

  const handlePickContact = useCallback(async () => {
    if (isPickingContact) return;
    if (Platform.OS === "web") {
      Alert.alert("提示", "网页版暂不支持通讯录选择，请手动输入联系人信息。", [{ text: "知道了" }]);
      return;
    }
    setIsPickingContact(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("需要通讯录权限", "请允许访问通讯录，以便快速选择紧急联系人。", [{ text: "知道了" }]);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });
      const withPhone = data.filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0);
      if (withPhone.length === 0) {
        Alert.alert("通讯录为空", "未找到含手机号的联系人，请手动输入。", [{ text: "知道了" }]);
        return;
      }
      // Show picker alert with first 10 contacts
      const options = withPhone.slice(0, 10).map((c) => ({
        text: `${c.name ?? "未知"} (${c.phoneNumbers![0]!.number ?? ""})`,
        onPress: () => {
          setEmergencyName(c.name ?? "");
          setEmergencyPhone(c.phoneNumbers![0]!.number?.replace(/\s|-/g, "") ?? "");
          setError("");
        },
      }));
      options.push({ text: "取消", onPress: () => {} });
      Alert.alert("选择紧急联系人", "从通讯录中选择一位家人或可信联系人", options);
    } catch (err) {
      console.warn("pick contact failed", err);
      Alert.alert("打开通讯录失败", "请手动输入联系人信息。", [{ text: "知道了" }]);
    } finally {
      setIsPickingContact(false);
    }
  }, [isPickingContact]);

  const handleLogin = useCallback(async () => {
    if (!name.trim()) {
      setError("请输入您的称呼，方便助手与您沟通。");
      return;
    }
    if (phone.trim() && !/^1[3-9]\d{9}$/.test(phone.trim())) {
      setError("手机号格式不正确，请检查后重新输入。");
      return;
    }
    if (emergencyPhone.trim() && !/^1[3-9]\d{9}$/.test(emergencyPhone.trim())) {
      setError("紧急联系人手机号格式不正确，请检查后重新输入。");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const emergencyContact =
        emergencyName.trim() && emergencyPhone.trim()
          ? {
              name: emergencyName.trim(),
              phone: emergencyPhone.trim(),
              relation: emergencyRelation.trim() || "家人",
            }
          : undefined;
      await login(name, phone, emergencyContact);
      router.replace("/(tabs)");
    } catch {
      setError("保存失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, [name, phone, emergencyName, emergencyPhone, emergencyRelation, login, router]);

  return (
    <View style={[styles.root, { backgroundColor: "#F0F6FF" }]}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Hero */}
          <View style={styles.hero}>
            <View style={[styles.logoCircle, { backgroundColor: "#2F80ED" }]}>
              <IconSymbol name="shield.lefthalf.fill" size={40} color="#ffffff" />
            </View>
            <Text style={[styles.appName, { color: "#16324F" }]}>明鉴</Text>
            <Text style={[styles.tagline, { color: "#5F7592" }]}>
              先暂停，再核验{"\n"}保护您和家人的财产安全
            </Text>
          </View>

          {/* Basic Info Card */}
          <View style={[styles.card, { backgroundColor: "#ffffff" }]}>
            <Text style={[styles.cardTitle, { color: "#16324F" }]}>基本信息</Text>
            <Text style={[styles.cardSubtitle, { color: "#5F7592" }]}>
              填写基本信息，助手会记住您的偏好，提供更贴心的防诈建议。
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: "#16324F" }]}>您的称呼 *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: "#F7FAFC",
                    borderColor: error && !name.trim() ? colors.error : "#DCE6F2",
                    color: colors.foreground,
                  },
                ]}
                placeholder="例如：张叔叔、李阿姨、小王"
                placeholderTextColor="#9BB0C7"
                value={name}
                onChangeText={(t) => { setName(t); setError(""); }}
                returnKeyType="next"
                maxLength={20}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: "#16324F" }]}>本机手机号（选填）</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: "#F7FAFC",
                    borderColor: "#DCE6F2",
                    color: colors.foreground,
                  },
                ]}
                placeholder="用于紧急联系提醒（不上传）"
                placeholderTextColor="#9BB0C7"
                value={phone}
                onChangeText={(t) => { setPhone(t); setError(""); }}
                keyboardType="phone-pad"
                returnKeyType="next"
                maxLength={11}
              />
              <Text style={[styles.hint, { color: "#9BB0C7" }]}>
                手机号仅存储在本机，不会上传到任何服务器。
              </Text>
            </View>
          </View>

          {/* Emergency Contact Card */}
          <View style={[styles.card, { backgroundColor: "#ffffff" }]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <Text style={[styles.cardTitle, { color: "#16324F" }]}>紧急联系人</Text>
                <Text style={[styles.cardSubtitle, { color: "#5F7592" }]}>
                  遇到风险时，可快速发送提醒短信给家人或可信联系人。
                </Text>
              </View>
              <Pressable
                onPress={handlePickContact}
                disabled={isPickingContact}
                style={({ pressed }) => [
                  styles.contactPickButton,
                  {
                    backgroundColor: pressed ? "#E8F2FF" : "#EAF4FF",
                    opacity: isPickingContact ? 0.6 : 1,
                  },
                ]}
              >
                <IconSymbol name="book.fill" size={16} color="#2F80ED" />
                <Text style={styles.contactPickText}>通讯录选择</Text>
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: "#16324F" }]}>联系人姓名（选填）</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: "#F7FAFC",
                    borderColor: "#DCE6F2",
                    color: colors.foreground,
                  },
                ]}
                placeholder="例如：儿子、女儿、老伴"
                placeholderTextColor="#9BB0C7"
                value={emergencyName}
                onChangeText={(t) => { setEmergencyName(t); setError(""); }}
                returnKeyType="next"
                maxLength={20}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: "#16324F" }]}>联系人手机号（选填）</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: "#F7FAFC",
                    borderColor: "#DCE6F2",
                    color: colors.foreground,
                  },
                ]}
                placeholder="发送提醒短信时使用"
                placeholderTextColor="#9BB0C7"
                value={emergencyPhone}
                onChangeText={(t) => { setEmergencyPhone(t); setError(""); }}
                keyboardType="phone-pad"
                returnKeyType="next"
                maxLength={11}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: "#16324F" }]}>关系（选填）</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: "#F7FAFC",
                    borderColor: "#DCE6F2",
                    color: colors.foreground,
                  },
                ]}
                placeholder="例如：儿子、女儿、朋友"
                placeholderTextColor="#9BB0C7"
                value={emergencyRelation}
                onChangeText={(t) => { setEmergencyRelation(t); setError(""); }}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                maxLength={10}
              />
            </View>
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: "#FFF0F0" }]}>
              <IconSymbol name="exclamationmark.triangle.fill" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={({ pressed }) => [
              styles.loginButton,
              {
                backgroundColor: loading ? "#A0BFE0" : "#2F80ED",
                opacity: pressed ? 0.88 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Text style={styles.loginButtonText}>
              {loading ? "正在保存..." : "进入助手"}
            </Text>
            {!loading && <IconSymbol name="chevron.right" size={18} color="#ffffff" />}
          </Pressable>

          {/* Privacy note */}
          <View style={styles.privacyRow}>
            <IconSymbol name="lock.fill" size={13} color="#9BB0C7" />
            <Text style={[styles.privacyText, { color: "#9BB0C7" }]}>
              所有数据仅存储在本机，不会上传或共享
            </Text>
          </View>

          {/* Feature highlights */}
          <View style={styles.features}>
            {[
              { icon: "waveform.path.ecg" as const, text: "电话语音实时核验" },
              { icon: "paperplane.fill" as const, text: "短信链接风险识别" },
              { icon: "photo.on.rectangle" as const, text: "截图多模态分析" },
            ].map((f) => (
              <View key={f.text} style={[styles.featureItem, { backgroundColor: "#EAF4FF" }]}>
                <IconSymbol name={f.icon} size={20} color="#2F80ED" />
                <Text style={[styles.featureText, { color: "#16324F" }]}>{f.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  scroll: { paddingHorizontal: 24, gap: 20 },
  hero: { alignItems: "center", gap: 12, paddingVertical: 8 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2F80ED",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  appName: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  tagline: { fontSize: 15, textAlign: "center", lineHeight: 24 },
  card: {
    borderRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardHeaderLeft: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  cardSubtitle: { fontSize: 13, lineHeight: 20 },
  contactPickButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  contactPickText: { fontSize: 13, fontWeight: "600", color: "#2F80ED" },
  fieldGroup: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600" },
  input: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  hint: { fontSize: 12, lineHeight: 18 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: { fontSize: 13, flex: 1 },
  loginButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 4,
  },
  loginButtonText: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  privacyText: { fontSize: 12 },
  features: { flexDirection: "row", gap: 10, justifyContent: "center" },
  featureItem: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  featureText: { fontSize: 12, fontWeight: "600", textAlign: "center" },
});
