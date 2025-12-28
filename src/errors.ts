export class TossError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TossError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TossError);
    }
  }
}

export class IntentValidationError extends TossError {
  constructor(message: string, details?: any) {
    super(message, 'INTENT_VALIDATION_ERROR', details);
    this.name = 'IntentValidationError';
  }
}

export class NetworkError extends TossError {
  constructor(message: string, details?: any) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

export class StorageError extends TossError {
  constructor(message: string, details?: any) {
    super(message, 'STORAGE_ERROR', details);
    this.name = 'StorageError';
  }
}

export class SignatureError extends TossError {
  constructor(message: string, details?: any) {
    super(message, 'SIGNATURE_ERROR', details);
    this.name = 'SignatureError';
  }
}

export const ERROR_CODES = {
  INVALID_INTENT: 'INVALID_INTENT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  SIGNATURE_VERIFICATION_FAILED: 'SIGNATURE_VERIFICATION_FAILED',
  INTENT_EXPIRED: 'INTENT_EXPIRED',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
} as const;
