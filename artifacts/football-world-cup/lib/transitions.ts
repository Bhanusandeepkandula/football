import { withTiming, Easing } from 'react-native-reanimated';

/**
 * A reanimated custom `entering` builder for a directional slide + fade — used
 * when swiping/tapping between tabbed pages so the incoming view slides in from
 * the side you swiped toward.
 *
 *   dir =  1  → new page enters from the RIGHT (moving forward)
 *   dir = -1  → new page enters from the LEFT  (moving back)
 *
 * Keep the travel small (26px) so it never overflows a vertical ScrollView.
 */
export function makeSlideIn(dir: number) {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateX: 26 * dir }] },
      animations: {
        opacity: withTiming(1, { duration: 180 }),
        transform: [{ translateX: withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) }) }],
      },
    };
  };
}
