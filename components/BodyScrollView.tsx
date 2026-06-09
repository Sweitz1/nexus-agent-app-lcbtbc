import { forwardRef } from "react";
import { ScrollView, ScrollViewProps } from "react-native";
import { stripDevProps } from "@/utils/stripDevProps";

export const BodyScrollView = forwardRef<any, ScrollViewProps>((props, ref) => {
  const cleanProps = stripDevProps(props as Record<string, any>) as ScrollViewProps;
  return (
    <ScrollView
      automaticallyAdjustsScrollIndicatorInsets
      contentInsetAdjustmentBehavior="automatic"
      contentInset={{ bottom: 0 }}
      scrollIndicatorInsets={{ bottom: 0 }}
      {...cleanProps}
      ref={ref}
    />
  );
});
