/**
 * Check if a number is a C++ integer.
 *
 * -2147483648 <= n <= 2147483647
 */
export function is32BitNumber(n: number): boolean {
  return Number.isInteger(n)
    && n >= -0x8000_0000
    && n <= 0x7FFF_FFFF;
}
