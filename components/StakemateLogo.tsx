import { Image, type ImageStyle } from "expo-image";
import { type StyleProp } from "react-native";

const LOGO_ASPECT = 179 / 140;
const HORIZONTAL_ASPECT = 300 / 80;

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
  variant?: "default" | "blue";
};

export function StakemateLogo({ size = 48, style, variant = "default" }: Props) {
  if (variant === "blue") {
    return (
      <Image
        source={require("@/assets/images/stakemateLogo-horizontal-blue.svg")}
        style={[{ width: size * HORIZONTAL_ASPECT, height: size }, style]}
        contentFit="contain"
      />
    );
  }
  return (
    <Image
      source={require("@/assets/images/stakemateLogo.svg")}
      style={[{ width: size * LOGO_ASPECT, height: size }, style]}
      contentFit="contain"
    />
  );
}
