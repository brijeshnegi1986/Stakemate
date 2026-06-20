import { Image, type ImageStyle } from "expo-image";
import { type StyleProp } from "react-native";

const LOGO_ASPECT = 179 / 140;

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export function StakemateLogo({ size = 48, style }: Props) {
  return (
    <Image
      source={require("@/assets/images/stakemateLogo.svg")}
      style={[{ width: size * LOGO_ASPECT, height: size }, style]}
      contentFit="contain"
    />
  );
}
