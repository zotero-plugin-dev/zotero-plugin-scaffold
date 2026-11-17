export type { DeepPartial, Merge } from "es-toolkit/types";

export type DeepRequired<T> = {
  // eslint-disable-next-line ts/no-unsafe-function-type
  [K in keyof T]-?: T[K] extends object ? T[K] extends Function ? T[K]
    : DeepRequired<T[K]>
    : T[K];
};

export type DeepNonNullable<T> = {
  // eslint-disable-next-line ts/no-unsafe-function-type
  [K in keyof T]-?: T[K] extends object ? T[K] extends Function ? T[K]
    : DeepNonNullable<NonNullable<T[K]>>
    : NonNullable<T[K]>;
};

type DeepOptionalKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : T[K] extends object ? K | DeepOptionalKeys<T[K]> : never;
}[keyof T];

export type DeepPickOptional<T> = {
  [K in keyof T as K extends DeepOptionalKeys<T> ? K : never]?: T[K] extends object ? DeepPickOptional<T[K]> : T[K];
};
