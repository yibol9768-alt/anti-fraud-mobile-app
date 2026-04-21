import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import * as Contacts from "expo-contacts";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

import { ScreenContainer } from "@/components/screen-container";
import { PauseBanner } from "@/components/pause-banner";
import { IconSymbol } from "@/components/ui/icon-symbol";
import A30Guardian, { type GuardianBootstrapState, type GuardianImageRecord, type GuardianSmsRecord } from "@/modules/a30-guardian";
import { useAntiFraud } from "@/lib/anti-fraud-store";
import { createTRPCClient } from "@/lib/trpc";
import { FRAUD_TYPE_LABELS, INPUT_MODE_LABELS, RISK_LEVEL_LABELS, type InputMode } from "@/shared/anti-fraud";

type DefenseScene = "phone" | "sms" | "screenshot";

const SCENE_OPTIONS: Array<{
  key: DefenseScene;
  title: string;
  subtitle: string;
  mode: InputMode;
  icon: Parameters<typeof IconSymbol>[0]["name"];
}> = [
  {
    key: "phone",
    title: "电话主动防御",
    subtitle: "接到可疑来电？先别挂断，把对方说的话转述给我，或直接录一段。",
    mode: "audio",
    icon: "waveform.path.ecg",
  },
  {
    key: "sms",
    title: "短信主动防御",
    subtitle: "收到可疑短信或聊天？把内容复制给我看看，我帮你判断风险。",
    mode: "text",
    icon: "paperplane.fill",
  },
  {
    key: "screenshot",
    title: "截图主动防御",
    subtitle: "看到可疑页面？截一张图发给我，我用多模态分析帮你识别。",
    mode: "image",
    icon: "photo.on.rectangle",
  },
];

const DEFENSE_ACTIONS: Record<DefenseScene, Array<{ key: string; label: string; hint: string; action: "call" | "sms" | "pick" }>> = {
  phone: [
    {
      key: "call-hotline",
      label: "拨打 96110 反诈专线",
      hint: "如果对方催你转账、保密或共享屏幕，先挂断再求助。",
      action: "call",
    },
    {
      key: "sms-guardian",
      label: "短信提醒家人",
      hint: "把当前可疑来电情况同步给家人，避免独自继续操作。",
      action: "sms",
    },
  ],
  sms: [
    {
      key: "sms-guardian",
      label: "先提醒可信联系人",
      hint: "在你还没点链接之前，先把风险告诉家人或同事。",
      action: "sms",
    },
    {
      key: "call-hotline",
      label: "需要时拨打核验",
      hint: "涉及公检法、退款售后、征信异常时优先电话核验。",
      action: "call",
    },
  ],
  screenshot: [
    {
      key: "pick-shot",
      label: "从本地相册选择截图",
      hint: "支持聊天记录、付款页面、短信页面和陌生通知截图。",
      action: "pick",
    },
    {
      key: "sms-guardian",
      label: "先发送风险提醒",
      hint: "继续操作前，先让家人知道你正在核验一条可疑截图。",
      action: "sms",
    },
  ],
};

function getSceneByMode(mode: InputMode): DefenseScene {
  if (mode === "audio") {
    return "phone";
  }
  if (mode === "image") {
    return "screenshot";
  }
  return "sms";
}

function inferImageMeta(uri: string, mimeType?: string | null) {
  const lower = uri.toLowerCase();
  if (mimeType) {
    const normalizedMimeType = mimeType.toLowerCase();
    const extension = normalizedMimeType.includes("png")
      ? "png"
      : normalizedMimeType.includes("webp")
        ? "webp"
        : normalizedMimeType.includes("heic")
          ? "heic"
          : normalizedMimeType.includes("heif")
            ? "heif"
            : "jpg";
    return { mimeType: normalizedMimeType, fileExtension: extension };
  }

  if (lower.endsWith(".png")) {
    return { mimeType: "image/png", fileExtension: "png" };
  }
  if (lower.endsWith(".webp")) {
    return { mimeType: "image/webp", fileExtension: "webp" };
  }
  if (lower.endsWith(".heic")) {
    return { mimeType: "image/heic", fileExtension: "heic" };
  }
  if (lower.endsWith(".heif")) {
    return { mimeType: "image/heif", fileExtension: "heif" };
  }
  return { mimeType: "image/jpeg", fileExtension: "jpg" };
}

function inferAudioMeta(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) {
    return { mimeType: "audio/m4a", fileExtension: "m4a" };
  }
  if (lower.endsWith(".mp3")) {
    return { mimeType: "audio/mpeg", fileExtension: "mp3" };
  }
  if (lower.endsWith(".wav")) {
    return { mimeType: "audio/wav", fileExtension: "wav" };
  }
  if (lower.endsWith(".ogg")) {
    return { mimeType: "audio/ogg", fileExtension: "ogg" };
  }
  return { mimeType: Platform.OS === "ios" ? "audio/m4a" : "audio/webm", fileExtension: Platform.OS === "ios" ? "m4a" : "webm" };
}

function buildGuardianReminder() {
  return encodeURIComponent(
    "我正在用 A30 核验一条可疑电话、短信或截图。如果我提到转账、验证码、共享屏幕、下载软件或安全账户，请先提醒我立刻暂停操作。",
  );
}

function formatGuardianTime(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(timestamp);
  }
}

function buildSmsDraft(records: GuardianSmsRecord[]) {
  return records.slice(0, 12).map((record, index) => {
    return `【短信 ${index + 1}】\n时间：${formatGuardianTime(record.date)}\n发件人：${record.address}\n内容：${record.body}`;
  }).join("\n\n");
}

export default function DetectScreen() {
  const router = useRouter();
  const { draft, latestAnalysis, memory, setInputMode, updateDraft, runAnalysis, seedDemoScenario } = useAntiFraud();
  const [apiClient] = useState(() => createTRPCClient());
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState("点一下开始录音，直接说出对方身份、要求你做什么，以及有没有让你转账或报验证码。");
  const [transcriptionDuration, setTranscriptionDuration] = useState<number | null>(null);
  const [microphoneDenied, setMicrophoneDenied] = useState(false);

  const [guardianState, setGuardianState] = useState<GuardianBootstrapState | null>(null);
  const [guardianStatus, setGuardianStatus] = useState("Android 专版支持短信批量扫描、图库扫描和监控开关。首次使用前请先完成授权。");
  const [isGuardianBusy, setIsGuardianBusy] = useState(false);
  const [isGuardianMonitoringActive, setIsGuardianMonitoringActive] = useState(false);
  const [smsRecords, setSmsRecords] = useState<GuardianSmsRecord[]>([]);
  const [mediaRecords, setMediaRecords] = useState<GuardianImageRecord[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  const activeScene = useMemo(() => getSceneByMode(draft.inputMode), [draft.inputMode]);
  const normalizedImageUri = useMemo(() => draft.imageUri?.trim() ?? "", [draft.imageUri]);
  const previewUri = imagePreviewUri ?? (/^https?:\/\//i.test(normalizedImageUri) ? normalizedImageUri : null);
  const isAndroidGuardian = Platform.OS === "android";

  const contextSummary = useMemo(() => {
    const recentShortTerm = memory.shortTerm.slice(-2).map((item) => item.content).join("；");
    return recentShortTerm || "当前还没有新的连续线索。建议先说清楚对方身份、你的顾虑和对方要求你立刻做的动作。";
  }, [memory.shortTerm]);

  const imageInputHint = useMemo(() => {
    if (isUploadingImage) {
      return "正在把本地图片上传到安全分析链路，请稍候。上传完成后会自动替换成可分析的远程地址。";
    }

    if (!normalizedImageUri) {
      return "还没有截图线索。你可以先从相册选择本地图片，也可以先扫描系统图库，再选一张进入深度识别。";
    }

    if (/^https?:\/\//i.test(normalizedImageUri)) {
      return "截图已经进入远程分析链路。本次识别会结合图像理解、知识召回和历史风险记忆一起判断。";
    }

    return "当前保留的是本地图片标识。建议重新选择一张图片，让系统先上传后再分析。";
  }, [isUploadingImage, normalizedImageUri]);

  const canSubmit = useMemo(() => {
    if (draft.inputMode === "text") {
      return draft.text.trim().length > 0;
    }
    if (draft.inputMode === "audio") {
      return draft.transcript.trim().length > 0;
    }
    return draft.text.trim().length > 0 || normalizedImageUri.length > 0;
  }, [draft.inputMode, draft.text, draft.transcript, normalizedImageUri]);

  const latestConclusion = useMemo(() => {
    if (!latestAnalysis) {
      return "最近还没有新的识别结论。完成一次核验后，这里会展示最近的风险等级、诈骗类型和建议动作。";
    }

    return `最近一次判断为${RISK_LEVEL_LABELS[latestAnalysis.riskLevel]}，类型偏向${FRAUD_TYPE_LABELS[latestAnalysis.fraudType]}，风险分 ${latestAnalysis.score}。`;
  }, [latestAnalysis]);

  const guardianSummary = useMemo(() => {
    if (!guardianState) {
      return "尚未读取 Android 专版守护状态。";
    }

    const permissionLabel = guardianState.permissionState.smsGranted && guardianState.permissionState.mediaGranted
      ? "短信和图库权限已就绪"
      : "短信或图库权限尚未完成";
    const monitorLabel = isGuardianMonitoringActive ? "后台监控开关已打开" : "后台监控开关当前关闭";
    return `${permissionLabel}，${monitorLabel}。`;
  }, [guardianState, isGuardianMonitoringActive]);

  useEffect(() => {
    if (!isAndroidGuardian) {
      setGuardianStatus("当前并非 Android 设备，短信全量扫描和系统图库扫描不会启用。你仍可手动输入或选择截图继续核验。");
      return;
    }

    const bootstrap = async () => {
      try {
        const [bootstrapState, monitoringActive] = await Promise.all([
          A30Guardian.getBootstrapStateAsync(),
          A30Guardian.isGuardianMonitoringActiveAsync(),
        ]);
        setGuardianState(bootstrapState);
        setIsGuardianMonitoringActive(monitoringActive);
      } catch (error) {
        console.warn("load guardian bootstrap failed", error);
        setGuardianStatus("Android 守护模块暂时不可用。你仍可手动输入或选择截图继续核验。");
      }
    };

    void bootstrap();
  }, [isAndroidGuardian]);

  const refreshGuardianState = async () => {
    if (!isAndroidGuardian) {
      return;
    }
    const [bootstrapState, monitoringActive] = await Promise.all([
      A30Guardian.getBootstrapStateAsync(),
      A30Guardian.isGuardianMonitoringActiveAsync(),
    ]);
    setGuardianState(bootstrapState);
    setIsGuardianMonitoringActive(monitoringActive);
  };

  const requestAndroidGuardianPermissions = async () => {
    if (!isAndroidGuardian) {
      return false;
    }

    const permissions: Array<(typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]> = [
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ];

    if (typeof Platform.Version === "number" && Platform.Version >= 33) {
      permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
      permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } else {
      permissions.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
    }

    const requestResult = await PermissionsAndroid.requestMultiple(permissions);
    const smsGranted = [
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ].every((permission) => requestResult[permission] === PermissionsAndroid.RESULTS.GRANTED);

    const mediaPermission = await MediaLibrary.requestPermissionsAsync();
    const notificationsGranted = typeof Platform.Version === "number" && Platform.Version >= 33
      ? requestResult[PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS] === PermissionsAndroid.RESULTS.GRANTED
      : true;

    try {
      await refreshGuardianState();
    } catch (error) {
      console.warn("refresh guardian state failed", error);
    }

    return smsGranted && mediaPermission.granted && notificationsGranted;
  };

  const ensureGuardianReady = async (reason: "sms" | "media" | "watcher") => {
    if (!isAndroidGuardian) {
      Alert.alert("仅支持 Android 专版", "当前功能只在 Android 内部安装版中启用。", [{ text: "知道了" }]);
      return false;
    }

    const granted = await requestAndroidGuardianPermissions();
    if (!granted) {
      setGuardianStatus(reason === "watcher"
        ? "未完成短信、图库或通知授权，暂时无法打开后台监控。"
        : "未完成短信或图库授权，暂时无法执行批量扫描。");
      Alert.alert("需要完成授权", "请允许短信、图库与通知权限后，再使用 Android 专版扫描和守护能力。", [{ text: "知道了" }]);
      return false;
    }

    return true;
  };

  const openSystemUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn("open system url failed", error);
      Alert.alert("暂时无法打开系统能力", "请稍后再试，或手动拨打 96110。", [{ text: "知道了" }]);
    }
  };

  const uploadImageFromUri = async (uri: string, mimeType?: string | null) => {
    setIsUploadingImage(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const meta = inferImageMeta(uri, mimeType);
      const uploaded = await apiClient.antiFraud.uploadImage.mutate({
        imageBase64: base64,
        mimeType: meta.mimeType,
        fileExtension: meta.fileExtension,
        source: "detect",
      });
      updateDraft({ imageUri: uploaded.url });
      setGuardianStatus("图片已上传到分析链路，可以直接生成风险判断。") ;
    } catch (error) {
      console.warn("upload image failed", error);
      Alert.alert("图片上传失败", "已保留本地图片预览。你可以稍后重试，或直接补充文字继续核验。", [{ text: "知道了" }]);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const uploadPickedImage = async (asset: ImagePicker.ImagePickerAsset) => {
    await uploadImageFromUri(asset.uri, asset.mimeType);
  };

  const handlePickImage = async () => {
    if (isPickingImage || isUploadingImage) {
      return;
    }

    setIsPickingImage(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("需要相册权限", "请允许读取相册，以便选择聊天截图、付款页面或通知照片进行识别。", [{ text: "知道了" }]);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      const asset = result.assets[0];
      setInputMode("image");
      setImagePreviewUri(asset.uri);
      setSelectedMediaId(null);
      updateDraft({ imageUri: undefined });
      await uploadPickedImage(asset);
    } catch (error) {
      console.warn("pick screenshot failed", error);
      Alert.alert("打开相册失败", "请稍后重试。", [{ text: "知道了" }]);
    } finally {
      setIsPickingImage(false);
    }
  };

  const handleGuardianSmsScan = async () => {
    if (isGuardianBusy) {
      return;
    }

    const ready = await ensureGuardianReady("sms");
    if (!ready) {
      return;
    }

    setIsGuardianBusy(true);
    try {
      const records = await A30Guardian.startSmsScanAsync({ limit: 120 });
      setSmsRecords(records);
      setInputMode("text");
      updateDraft({
        text: buildSmsDraft(records),
        transcript: "",
        imageUri: undefined,
      });
      setImagePreviewUri(null);
      setGuardianStatus(`已扫描最近 ${records.length} 条短信，并自动整理出前 12 条进入文本核验区。`);
    } catch (error) {
      console.warn("guardian sms scan failed", error);
      Alert.alert("短信扫描失败", "请确认当前是 Android 内部安装版，并已授予短信权限。", [{ text: "知道了" }]);
    } finally {
      setIsGuardianBusy(false);
    }
  };

  const handleGuardianMediaScan = async () => {
    if (isGuardianBusy) {
      return;
    }

    const ready = await ensureGuardianReady("media");
    if (!ready) {
      return;
    }

    setIsGuardianBusy(true);
    try {
      const records = await A30Guardian.startMediaScanAsync({ pageSize: 30, includeVideos: false });
      setMediaRecords(records);
      setInputMode("image");
      setGuardianStatus(`已扫描最近 ${records.length} 张系统图片。你可以点击任意一张，把它送入深度识别。`);
      if (records[0]) {
        setSelectedMediaId(records[0].id);
        setImagePreviewUri(records[0].uri);
        updateDraft({ imageUri: undefined });
      }
    } catch (error) {
      console.warn("guardian media scan failed", error);
      Alert.alert("图库扫描失败", "请确认当前是 Android 内部安装版，并已授予图库权限。", [{ text: "知道了" }]);
    } finally {
      setIsGuardianBusy(false);
    }
  };

  const handleUseScannedMedia = async (record: GuardianImageRecord) => {
    if (isUploadingImage) {
      return;
    }

    setInputMode("image");
    setSelectedMediaId(record.id);
    setImagePreviewUri(record.uri);
    updateDraft({ imageUri: undefined });
    await uploadImageFromUri(record.uri);
  };

  const handleGuardianMonitoringToggle = async () => {
    if (isGuardianBusy) {
      return;
    }

    const ready = await ensureGuardianReady("watcher");
    if (!ready) {
      return;
    }

    setIsGuardianBusy(true);
    try {
      if (isGuardianMonitoringActive) {
        await A30Guardian.stopGuardianMonitoringAsync();
        setGuardianStatus("后台监控开关已关闭。系统将停止新的短信与图库事件监听。") ;
      } else {
        await A30Guardian.startGuardianMonitoringAsync();
        setGuardianStatus("后台监控开关已打开。后续可继续接入原生广播与前台服务，形成到达即分析链路。") ;
      }
      await refreshGuardianState();
    } catch (error) {
      console.warn("guardian monitoring toggle failed", error);
      Alert.alert("监控开关切换失败", "请稍后重试。", [{ text: "知道了" }]);
    } finally {
      setIsGuardianBusy(false);
    }
  };

  const startRecording = async () => {
    if (recorderState.isRecording || isTranscribing) {
      return;
    }

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setMicrophoneDenied(true);
        Alert.alert("需要麦克风权限", "请允许麦克风权限后再直接说话求助。", [{ text: "知道了" }]);
        return;
      }

      setMicrophoneDenied(false);
      setInputMode("audio");
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setVoiceStatus("正在录音，请直接说清楚：对方是谁、让你做什么、有没有要求转账或验证码。再次点击即可停止。\n");
    } catch (error) {
      console.warn("start recording failed", error);
      Alert.alert("录音启动失败", "请稍后再试。", [{ text: "知道了" }]);
    }
  };

  const stopRecordingAndTranscribe = async () => {
    if (!recorderState.isRecording || isTranscribing) {
      return;
    }

    setIsTranscribing(true);
    try {
      await audioRecorder.stop();
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });

      const uri = audioRecorder.uri;
      if (!uri) {
        throw new Error("missing recorder uri");
      }

      setVoiceStatus("正在把语音转换成文字，请稍候。\n");
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const meta = inferAudioMeta(uri);
      const transcription = await apiClient.voice.transcribe.mutate({
        audioBase64: base64,
        mimeType: meta.mimeType,
        fileExtension: meta.fileExtension,
        source: "detect",
        language: "zh",
      });

      updateDraft({
        transcript: [draft.transcript.trim(), transcription.text.trim()].filter(Boolean).join("\n"),
        audioUri: transcription.audioUrl,
      });
      setTranscriptionDuration(transcription.duration ?? null);
      setVoiceStatus("转写完成。你可以继续补充一句，也可以直接生成判断。\n");
    } catch (error) {
      console.warn("stop recording or transcribe failed", error);
      Alert.alert("语音转写失败", "请再录一次，尽量控制在较短语音片段内。", [{ text: "知道了" }]);
      setVoiceStatus("语音转写失败，请重试，或者改为手动输入通话摘要。\n");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleVoiceButtonPress = async () => {
    if (recorderState.isRecording) {
      await stopRecordingAndTranscribe();
      return;
    }

    await startRecording();
  };

  const handleSmsWithContact = async () => {
    if (Platform.OS === "web") {
      // Web fallback: open sms without a number
      await openSystemUrl(`sms:?body=${buildGuardianReminder()}`);
      return;
    }

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        // Permission denied: fall back to numberless sms
        Alert.alert(
          "无法访问通讯录",
          "请允许访问通讯录以快速选择家人，或手动打开短信应用发送提醒。",
          [
            { text: "手动发送", onPress: () => { void openSystemUrl(`sms:?body=${buildGuardianReminder()}`); } },
            { text: "取消", style: "cancel" },
          ],
        );
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });

      const withPhone = data.filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0);
      if (withPhone.length === 0) {
        await openSystemUrl(`sms:?body=${buildGuardianReminder()}`);
        return;
      }

      // Show up to 10 contacts as options
      const options = withPhone.slice(0, 10).map((c) => ({
        text: `${c.name ?? "未知"} (${c.phoneNumbers![0]!.number ?? ""})`,
        onPress: () => {
          const phone = c.phoneNumbers![0]!.number?.replace(/\s|-/g, "") ?? "";
          void openSystemUrl(`sms:${phone}?body=${buildGuardianReminder()}`);
        },
      }));
      options.push({ text: "取消", onPress: () => {} });

      Alert.alert(
        "选择提醒对象",
        "从通讯录中选择一位家人或可信联系人发送提醒短信",
        options,
      );
    } catch (err) {
      console.warn("contacts pick failed", err);
      await openSystemUrl(`sms:?body=${buildGuardianReminder()}`);
    }
  };

  const handleDefenseAction = async (action: "call" | "sms" | "pick") => {
    if (action === "call") {
      await openSystemUrl("tel:96110");
      return;
    }

    if (action === "sms") {
      await handleSmsWithContact();
      return;
    }

    await handlePickImage();
  };

  const handleAnalyze = async () => {
    if (!canSubmit || isSubmitting || isUploadingImage || isTranscribing) {
      return;
    }

    setIsSubmitting(true);
    try {
      await runAnalysis();
      // After analysis, navigate to narrate screen for user to describe the situation
      router.push("/narrate");
    } catch (error) {
      console.warn("run analysis failed", error);
      Alert.alert("生成判断失败", "请稍后再试，或补充更多文字和截图线索。", [{ text: "知道了" }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer containerClassName="bg-[#F7FAFC]">
      <PauseBanner variant="default" />
      <ScrollView className="px-5 pt-4" contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View className="gap-4">
          <View className="gap-1">
            <Text className="text-sm font-medium text-muted">主动防御</Text>
            <Text className="text-[28px] font-bold leading-[36px] text-foreground">先暂停，再说一句</Text>
            <Text className="text-sm leading-6 text-muted">
              遇到可疑电话、短信或截图，先停下来，把情况告诉我，我帮你判断。
            </Text>
          </View>

          <View className="rounded-[24px] border border-[#D8E8FF] bg-[#EAF4FF] p-4">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="text-base font-semibold text-[#16324F]">Android 守护中心</Text>
                <Text className="text-sm leading-6 text-[#5F7592]">{guardianSummary}</Text>
              </View>
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white">
                <IconSymbol name="shield.lefthalf.fill" size={24} color="#2F80ED" />
              </View>
            </View>
            <Text className="mt-4 text-xs leading-5 text-[#69809B]">{guardianStatus}</Text>
            <View className="mt-4 gap-3">
              <Pressable
                onPress={() => {
                  void handleGuardianMonitoringToggle();
                }}
                style={({ pressed }) => [{
                  borderRadius: 18,
                  backgroundColor: isGuardianMonitoringActive ? "#16324F" : "#2F80ED",
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  opacity: pressed ? 0.9 : 1,
                }]}
              >
                <Text className="text-center text-base font-semibold text-white">
                  {isGuardianBusy ? "正在处理守护开关..." : isGuardianMonitoringActive ? "关闭后台监控" : "授权并开启后台监控"}
                </Text>
              </Pressable>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => {
                    void handleGuardianSmsScan();
                  }}
                  style={({ pressed }) => [{
                    flex: 1,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: "#DCE6F2",
                    backgroundColor: "#FFFFFF",
                    paddingVertical: 14,
                    paddingHorizontal: 12,
                    opacity: pressed ? 0.88 : 1,
                  }]}
                >
                  <Text className="text-center text-sm font-semibold text-foreground">扫描最近短信</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void handleGuardianMediaScan();
                  }}
                  style={({ pressed }) => [{
                    flex: 1,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: "#DCE6F2",
                    backgroundColor: "#FFFFFF",
                    paddingVertical: 14,
                    paddingHorizontal: 12,
                    opacity: pressed ? 0.88 : 1,
                  }]}
                >
                  <Text className="text-center text-sm font-semibold text-foreground">扫描系统图库</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <Text className="text-base font-semibold text-foreground">防御场景</Text>
            <View className="mt-4 gap-3">
              {SCENE_OPTIONS.map((item) => {
                const active = activeScene === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setInputMode(item.mode)}
                    style={({ pressed }) => [{
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: active ? "#2F80ED" : "#DCE6F2",
                      backgroundColor: active ? "#EEF5FF" : "#FFFFFF",
                      padding: 16,
                      opacity: pressed ? 0.88 : 1,
                    }]}
                  >
                    <View className="flex-row items-center gap-4">
                      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white">
                        <IconSymbol name={item.icon} size={22} color="#2F80ED" />
                      </View>
                      <View className="flex-1 gap-1">
                        <Text className="text-base font-semibold text-foreground">{item.title}</Text>
                        <Text className="text-sm leading-5 text-muted">{item.subtitle}</Text>
                      </View>
                      {active ? <IconSymbol name="checkmark.shield.fill" size={22} color="#2F80ED" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">立即可做的动作</Text>
              <Text className="text-xs text-muted">先阻断，再核验</Text>
            </View>
            <View className="mt-4 gap-3">
              {DEFENSE_ACTIONS[activeScene].map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    void handleDefenseAction(item.action);
                  }}
                  style={({ pressed }) => [{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: "#DCE6F2",
                    backgroundColor: "#F8FBFE",
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    opacity: pressed ? 0.86 : 1,
                  }]}
                >
                  <View className="flex-row items-center gap-4">
                    <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white">
                      <IconSymbol
                        name={item.action === "call" ? "waveform.path.ecg" : item.action === "sms" ? "paperplane.fill" : "photo.on.rectangle"}
                        size={18}
                        color="#2F80ED"
                      />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-sm font-semibold text-foreground">{item.label}</Text>
                      <Text className="text-xs leading-5 text-muted">{item.hint}</Text>
                    </View>
                    <IconSymbol name="chevron.right" size={18} color="#9BB0C7" />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {smsRecords.length > 0 ? (
            <View className="rounded-[24px] border border-border bg-white p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-foreground">最近短信扫描结果</Text>
                <Text className="text-xs text-muted">已抓取 {smsRecords.length} 条</Text>
              </View>
              <View className="mt-4 gap-3">
                {smsRecords.slice(0, 4).map((record) => (
                  <View key={record.id} className="rounded-[18px] bg-[#F8FBFE] p-4">
                    <Text className="text-sm font-semibold text-foreground">{record.address}</Text>
                    <Text className="mt-1 text-xs text-muted">{formatGuardianTime(record.date)}</Text>
                    <Text className="mt-2 text-sm leading-6 text-foreground">{record.body}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {mediaRecords.length > 0 ? (
            <View className="rounded-[24px] border border-border bg-white p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-foreground">系统图库扫描结果</Text>
                <Text className="text-xs text-muted">已发现 {mediaRecords.length} 张</Text>
              </View>
              <Text className="mt-3 text-xs leading-5 text-muted">点击任意一张图片，系统会先上传到分析链路，再结合文字描述做深度识别。</Text>
              <View className="mt-4 gap-3">
                {mediaRecords.slice(0, 4).map((record) => {
                  const active = selectedMediaId === record.id;
                  return (
                    <Pressable
                      key={record.id}
                      onPress={() => {
                        void handleUseScannedMedia(record);
                      }}
                      style={({ pressed }) => [{
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: active ? "#2F80ED" : "#DCE6F2",
                        backgroundColor: active ? "#EEF5FF" : "#FFFFFF",
                        padding: 12,
                        opacity: pressed ? 0.9 : 1,
                      }]}
                    >
                      <View className="flex-row items-center gap-3">
                        <Image source={{ uri: record.uri }} style={{ width: 72, height: 72, borderRadius: 16, backgroundColor: "#EAF4FF" }} resizeMode="cover" />
                        <View className="flex-1 gap-1">
                          <Text className="text-sm font-semibold text-foreground">{record.filename || "系统图片"}</Text>
                          <Text className="text-xs text-muted">{formatGuardianTime(record.creationTime)}</Text>
                          <Text className="text-xs text-muted">尺寸 {record.width ?? "?"} × {record.height ?? "?"}</Text>
                        </View>
                        {active ? <IconSymbol name="checkmark.shield.fill" size={20} color="#2F80ED" /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">输入内容</Text>
              <Text className="text-xs text-muted">{INPUT_MODE_LABELS[draft.inputMode]}</Text>
            </View>

            {activeScene === "phone" ? (
              <View className="mt-4 gap-3">
                <View className="rounded-[22px] bg-[#F8FBFE] p-4">
                  <View className="flex-row items-center gap-3">
                    <View className="h-11 w-11 items-center justify-center rounded-full bg-[#EEF5FF]">
                      <IconSymbol name="mic.fill" size={20} color="#2F80ED" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-foreground">直接语音求助入口</Text>
                      <Text className="mt-1 text-xs leading-5 text-muted">
                        适合老人直接开口说。建议按“对方是谁—要你做什么—有没有催转账、验证码、共享屏幕或下载软件”的顺序表达。
                      </Text>
                    </View>
                  </View>
                </View>

                <Pressable
                  onPress={() => {
                    void handleVoiceButtonPress();
                  }}
                  style={({ pressed }) => [{
                    borderRadius: 24,
                    backgroundColor: recorderState.isRecording ? "#FF6B6B" : "#2F80ED",
                    paddingVertical: 18,
                    paddingHorizontal: 18,
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  }]}
                >
                  <View className="flex-row items-center justify-center gap-3">
                    <IconSymbol name={recorderState.isRecording ? "stop.circle.fill" : "mic.fill"} size={24} color="#FFFFFF" />
                    <Text className="text-center text-lg font-semibold text-white">
                      {recorderState.isRecording ? "停止录音并转写" : isTranscribing ? "正在转写语音..." : "点这里直接说一句"}
                    </Text>
                  </View>
                </Pressable>

                <View className="rounded-[18px] bg-[#EEF5FF] px-4 py-3">
                  <Text className="text-sm leading-6 text-primary">{voiceStatus}</Text>
                  {transcriptionDuration ? <Text className="mt-1 text-xs text-primary">最近一次语音时长约 {Math.round(transcriptionDuration)} 秒</Text> : null}
                  {microphoneDenied ? <Text className="mt-1 text-xs text-[#C25E00]">尚未获得麦克风权限，语音求助暂不可用。</Text> : null}
                </View>

                <TextInput
                  value={draft.transcript}
                  onChangeText={(value) => updateDraft({ transcript: value })}
                  placeholder="例如：对方自称客服，说我误开会员，要我下载会议软件共享屏幕后才能退款。"
                  placeholderTextColor="#8EA0B7"
                  multiline
                  textAlignVertical="top"
                  className="min-h-[180px] rounded-[20px] border border-border bg-[#F8FBFE] px-4 py-4 text-[16px] leading-7 text-foreground"
                />
              </View>
            ) : null}

            {activeScene === "sms" ? (
              <View className="mt-4 gap-3">
                <Pressable
                  onPress={() => {
                    void handleGuardianSmsScan();
                  }}
                  style={({ pressed }) => [{
                    borderRadius: 18,
                    backgroundColor: "#EEF5FF",
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    opacity: pressed ? 0.9 : 1,
                  }]}
                >
                  <Text className="text-center text-base font-semibold text-primary">从系统短信批量导入最近高风险线索</Text>
                </Pressable>
                <TextInput
                  value={draft.text}
                  onChangeText={(value) => updateDraft({ text: value })}
                  placeholder="粘贴短信、聊天通知或平台提醒全文，尽量保留链接、验证码、金额和时间压力语句。"
                  placeholderTextColor="#8EA0B7"
                  multiline
                  textAlignVertical="top"
                  className="min-h-[220px] rounded-[20px] border border-border bg-[#F8FBFE] px-4 py-4 text-[16px] leading-7 text-foreground"
                />
                <Text className="text-xs leading-5 text-muted">
                  系统会重点检查退款售后、身份冒充、快递异常、验证码诱导、征信修复、低息贷款和高收益投资等高频骗局。
                </Text>
              </View>
            ) : null}

            {activeScene === "screenshot" ? (
              <View className="mt-4 gap-3">
                <View className="rounded-[22px] border border-dashed border-[#C9D9EC] bg-[#F8FBFE] p-4">
                  <View className="flex-row items-center gap-3">
                    <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white">
                      <IconSymbol name="photo.on.rectangle" size={20} color="#2F80ED" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-foreground">本地照片和图库扫描入口</Text>
                      <Text className="mt-1 text-xs leading-5 text-muted">
                        你可以手动从相册选择，也可以先扫描系统图库，再把其中一张聊天页、付款页或通知页送入深度识别。
                      </Text>
                    </View>
                  </View>
                </View>

                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => {
                      void handlePickImage();
                    }}
                    style={({ pressed }) => [{
                      flex: 1,
                      borderRadius: 18,
                      backgroundColor: "#EEF5FF",
                      paddingVertical: 16,
                      paddingHorizontal: 16,
                      opacity: pressed ? 0.86 : 1,
                    }]}
                  >
                    <Text className="text-center text-base font-semibold text-primary">
                      {isPickingImage ? "正在打开相册..." : isUploadingImage ? "正在上传图片..." : previewUri ? "重新选择本地图" : "从相册选择图片"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void handleGuardianMediaScan();
                    }}
                    style={({ pressed }) => [{
                      flex: 1,
                      borderRadius: 18,
                      backgroundColor: "#FFFFFF",
                      borderWidth: 1,
                      borderColor: "#DCE6F2",
                      paddingVertical: 16,
                      paddingHorizontal: 16,
                      opacity: pressed ? 0.86 : 1,
                    }]}
                  >
                    <Text className="text-center text-base font-semibold text-foreground">扫描系统图库</Text>
                  </Pressable>
                </View>

                {previewUri ? (
                  <View className="overflow-hidden rounded-[22px] border border-[#DCE6F2] bg-white">
                    <Image source={{ uri: previewUri }} style={{ width: "100%", height: 220 }} resizeMode="cover" />
                  </View>
                ) : null}

                <TextInput
                  value={draft.imageUri ?? ""}
                  onChangeText={(value) => updateDraft({ imageUri: value })}
                  placeholder="也可填写可公网访问的图片地址，例如 https://.../screenshot.png"
                  placeholderTextColor="#8EA0B7"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="rounded-[18px] border border-border bg-[#F8FBFE] px-4 py-4 text-[15px] text-foreground"
                />
                <View className="rounded-[16px] bg-[#EEF5FF] px-4 py-3">
                  <Text className="text-xs leading-5 text-primary">{imageInputHint}</Text>
                </View>
                <TextInput
                  value={draft.text}
                  onChangeText={(value) => updateDraft({ text: value })}
                  placeholder="补充说明截图中出现的身份、金额、账户名、页面标题、二维码、红包或对方要求。"
                  placeholderTextColor="#8EA0B7"
                  multiline
                  textAlignVertical="top"
                  className="min-h-[150px] rounded-[20px] border border-border bg-[#F8FBFE] px-4 py-4 text-[16px] leading-7 text-foreground"
                />
              </View>
            ) : null}
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">上下文记忆摘要</Text>
              <Text className="text-xs text-muted">短期 {memory.shortTerm.length} 条</Text>
            </View>
            <Text className="mt-3 text-sm leading-6 text-muted">{contextSummary}</Text>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {memory.longTerm.riskTags.slice(0, 4).map((tag) => (
                <View key={tag} className="rounded-full bg-[#EEF5FF] px-3 py-2">
                  <Text className="text-xs font-medium text-primary">{tag}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">快速填充示例</Text>
              <Text className="text-xs text-muted">便于验收三类场景</Text>
            </View>
            <View className="mt-4 flex-row flex-wrap gap-3">
              {[
                { key: "refund", label: "可疑来电", preset: "refund" as const },
                { key: "investment", label: "诱导短信", preset: "investment" as const },
                { key: "impersonation", label: "风险截图", preset: "impersonation" as const },
              ].map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => seedDemoScenario(item.preset)}
                  style={({ pressed }) => [{
                    borderRadius: 999,
                    backgroundColor: "#F1F7FF",
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    opacity: pressed ? 0.72 : 1,
                  }]}
                >
                  <Text className="text-sm font-medium text-primary">{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => {
              void handleAnalyze();
            }}
            disabled={!canSubmit || isSubmitting || isUploadingImage || isTranscribing}
            style={({ pressed }) => [{
              borderRadius: 22,
              backgroundColor: !canSubmit || isSubmitting || isUploadingImage || isTranscribing ? "#A9C8F3" : "#2F80ED",
              paddingVertical: 18,
              paddingHorizontal: 18,
              opacity: pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            }]}
          >
            <Text className="text-center text-lg font-semibold text-white">
              {isUploadingImage
                ? "正在准备图片分析..."
                : isTranscribing
                  ? "正在处理语音..."
                  : isSubmitting
                    ? "正在生成主动防御结论..."
                    : "生成本轮防御判断"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
