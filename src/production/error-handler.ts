export class AppError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.context = context;
  }
}

export interface HandledError {
  message: string;
  code: string;
  exitCode: number;
}

const ERROR_CODE_EXIT_MAP: Record<string, number> = {
  VALIDATION_ERROR: 1,
  AUTH_ERROR: 2,
  NETWORK_ERROR: 3,
  TIMEOUT_ERROR: 4,
  CONFIG_ERROR: 5,
  INTERNAL_ERROR: 10,
};

export function handleError(error: unknown): HandledError {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      exitCode: ERROR_CODE_EXIT_MAP[error.code] ?? 1,
    };
  }

  if (error instanceof Error) {
    return {
      message: "Internal error",
      code: "INTERNAL_ERROR",
      exitCode: 10,
    };
  }

  return {
    message: "Unknown error",
    code: "UNKNOWN_ERROR",
    exitCode: 1,
  };
}

export async function wrapAsync<T>(
  fn: () => Promise<T>,
  context?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(
      context ? `${context}: ${message}` : message,
      "INTERNAL_ERROR",
      { originalError: error instanceof Error ? error.name : typeof error },
    );
  }
}
