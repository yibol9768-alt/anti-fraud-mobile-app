// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "shield.lefthalf.fill": "shield",
  "waveform.path.ecg": "multitrack-audio",
  "doc.text.fill": "description",
  "brain.head.profile": "psychology",
  "person.crop.circle.fill": "account-circle",
  "exclamationmark.triangle.fill": "warning",
  "clock.arrow.circlepath": "history",
  "photo.on.rectangle": "photo-library",
  "mic.fill": "keyboard-voice",
  "chart.bar.fill": "bar-chart",
  "bell.fill": "notifications",
  "person.2.fill": "groups",
  "checkmark.shield.fill": "verified-user",
  "stop.circle.fill": "stop-circle",
  "speaker.wave.2.fill": "volume-up",
  "phone.fill": "call",
  "bubble.left.and.bubble.right.fill": "chat",
  "gearshape.fill": "settings",
  "arrow.clockwise": "refresh",
  "xmark.circle.fill": "cancel",
  "plus.circle.fill": "add-circle",
  "hand.raised.fill": "back-hand",
  "lightbulb.fill": "lightbulb",
  "lock.fill": "lock",
  "chevron.left": "chevron-left",
  "person.crop.circle.badge.plus": "person-add",
  "rectangle.and.pencil.and.ellipsis": "edit-note",
  "text.bubble.fill": "message",
  "arrow.right.circle.fill": "arrow-circle-right",
  "power": "power-settings-new",
  "person.fill": "person",
  "phone.arrow.up.right": "phone-forwarded",
  "book.fill": "menu-book",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
