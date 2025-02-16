import { EasingFunction } from '@/types';

/**
 * Linear easing function.
 */
export const linear: EasingFunction = (n: number) => n;

/**
 * Ease-in-out quadratic easing function.
 */
export const easeInOutQuad: EasingFunction = (n: number) => (n < 0.5 ? 2 * n * n : -1 + (4 - 2 * n) * n);

// Add other easing functions as needed...
