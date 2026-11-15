/**
 * The contract between the two halves of the tester.
 *
 * The Node side writes {@link TestPageConfig} into the generated test page as
 * `window.__scaffoldConfig`, and the page posts {@link ReportEvent}s back to the
 * HTTP reporter of the Node side.
 */

/** Configuration the Node side injects into the test page. */
export interface TestPageConfig {
  /** Port of the HTTP reporter which collects the results. */
  port: number;
  /** Timeout of a single test, in milliseconds. */
  timeout: number;
  /** Abort the run on the first failure. */
  abortOnFail: boolean;
  /** Quit Zotero when the run is finished. */
  exitOnFinish: boolean;
}

export interface ReportDataBase {
  title: string;
  indents: number;
}

/** A test which was run, used by `pass` and `pending`. */
export interface ReportTestData extends ReportDataBase {
  fulltest: string;
  duration?: number;
}

/** A test which failed, including the serialized assertion error. */
export interface ReportFailureData extends ReportTestData {
  error: {
    message: string;
    stack?: string;
    actual?: unknown;
    expected?: unknown;
    showDiff?: boolean;
    operator?: string;
  };
}

export interface ReportStartEvent {
  type: "start";
  data: { indents: number };
}

export interface ReportSuiteEvent {
  type: "suite" | "suite end";
  data: ReportDataBase & { root: boolean };
}

export interface ReportPendingEvent {
  type: "pending";
  data: ReportTestData;
}

export interface ReportPassEvent {
  type: "pass";
  data: ReportTestData;
}

export interface ReportFailEvent {
  type: "fail";
  data: ReportFailureData;
}

export interface ReportEndEvent {
  type: "end";
  data: {
    passed: number;
    failed: number;
    aborted: boolean;
    indents: number;
  };
}

export interface ReportDebugEvent {
  type: "debug";
  data?: unknown;
}

export interface ReportErrorEvent {
  type: "error";
  data: { title: string };
}

export type ReportEvent
  = | ReportStartEvent
    | ReportSuiteEvent
    | ReportPendingEvent
    | ReportPassEvent
    | ReportFailEvent
    | ReportEndEvent
    | ReportDebugEvent
    | ReportErrorEvent;
