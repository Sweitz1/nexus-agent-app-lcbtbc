import { Pressable, Animated, PressableProps, ViewStyle, StyleProp } from 'react-native';
import { useRef, useCallback, forwardRef } from 'react';

interface AnimatedPressableProps extends PressableProps {
  scaleValue?: number;
  style?: StyleProp<ViewStyle>;
  [key: string]: unknown;
}

/** Strip React dev-mode / editor metadata props before they reach the DOM on web. */
function stripDevProps<T extends Record<string, unknown>>(props: T): T {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !key.startsWith('__'))
  ) as T;
}

/**
 * A thin Pressable wrapper that strips __-prefixed dev/editor props so they
 * never reach the DOM on web (avoids "React does not recognize __x prop" warnings).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CleanPressable = forwardRef<any, PressableProps & Record<string, unknown>>(
  (props, ref) => {
    const clean = stripDevProps(props);
    return <Pressable ref={ref} {...(clean as PressableProps)} />;
  }
);
CleanPressable.displayName = 'CleanPressable';

export function AnimatedPressable({
  onPress,
  style,
  children,
  disabled,
  scaleValue = 0.97,
  ...rest
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: scaleValue as number,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scale, scaleValue]);

  const animateOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scale]);

  const pressableRest = stripDevProps(rest as Record<string, unknown>);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, disabled && { opacity: 0.5 }]}>
      <CleanPressable
        onPressIn={animateIn}
        onPressOut={animateOut}
        onPress={onPress}
        disabled={disabled as boolean | undefined}
        style={style as StyleProp<ViewStyle>}
        {...(pressableRest as PressableProps)}
      >
        {children}
      </CleanPressable>
    </Animated.View>
  );
}
