import { Image, type ImageStyle, type StyleProp } from "react-native";

const BRAND_ASPECT = 902 / 247;

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
  // "light" → use on dark backgrounds (faded lavender/mint logo)
  // "dark"  → use on light backgrounds (navy/mint logo)
  variant?: "light" | "dark";
};

export function StakemateLogo({ size = 48, style, variant = "dark" }: Props) {
  if (variant === "light") {
    return (
      <Image
        source={require("@/assets/images/stakemate-logo_light.png")}
        style={[{ width: size * BRAND_ASPECT, height: size }, style]}
        resizeMode="contain"
      />
    );
  }
  return (
    <Image
      source={require("@/assets/images/stakemate-logo_dark.png")}
      style={[{ width: size * BRAND_ASPECT, height: size }, style]}
      resizeMode="contain"
    />
  );
}
