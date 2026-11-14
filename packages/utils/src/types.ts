export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends object ? RecursivePartial<T[P]> : T[P];
};

export type RecursiveRequired<T> = {
  // eslint-disable-next-line ts/no-unsafe-function-type
  [K in keyof T]-?: T[K] extends object ? T[K] extends Function ? T[K]
    : RecursiveRequired<T[K]>
    : T[K];
};

export type RecursiveNonNullable<T> = {
  // eslint-disable-next-line ts/no-unsafe-function-type
  [K in keyof T]-?: T[K] extends object ? T[K] extends Function ? T[K]
    : RecursiveNonNullable<NonNullable<T[K]>>
    : NonNullable<T[K]>;
};

type RecursiveOptionalKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : T[K] extends object ? K | RecursiveOptionalKeys<T[K]> : never;
}[keyof T];

export type RecursivePickOptional<T> = {
  [K in keyof T as K extends RecursiveOptionalKeys<T> ? K : never]?: T[K] extends object ? RecursivePickOptional<T[K]> : T[K];
};
