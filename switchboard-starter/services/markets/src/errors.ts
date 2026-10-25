import type { ApiError } from "@switchboard/contracts";

export class ApiException extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, retryable = false, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiException";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }

  toJSON(correlationId: string): ApiError {
    const body: ApiError = {
      code: this.code,
      message: this.message,
      correlationId,
      retryable: this.retryable,
    };
    if (this.details) body.details = this.details;
    return body;
  }
}
