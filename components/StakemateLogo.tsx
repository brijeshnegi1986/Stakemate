import { Image, type ImageStyle, type StyleProp } from "react-native";

const LOGO_ASPECT = 168 / 271;
const HORIZONTAL_ASPECT = 1062 / 546;

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
  variant?: "default" | "blue";
};

export function StakemateLogo({ size = 48, style, variant = "default" }: Props) {
  if (variant === "blue") {
    return (
      <Image
        source={require("@/assets/images/Stakemate-logo-blue.png")}
        style={[{ width: size * HORIZONTAL_ASPECT, height: size }, style]}
        resizeMode="contain"
      />
    );
  }
  return (
    <Image
      source={require("@/assets/images/stakemate-monogram.png")}
      style={[{ width: size * LOGO_ASPECT, height: size }, style]}
      resizeMode="contain"
    />
  );
}
