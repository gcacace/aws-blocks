// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Standardized error constants for the Database Building Block.
 *
 * All engine implementations translate engine-specific errors to these names.
 * Customers use `isBlocksError(e, DatabaseErrors.QueryFailed)` for error handling.
 */
export const DatabaseErrors = {
  QueryFailed: 'QueryFailedException',
  ConnectionFailed: 'ConnectionFailedException',
  TransactionFailed: 'TransactionFailedException',
  UniqueConstraintViolation: 'UniqueConstraintViolationException',
  SerializationFailure: 'SerializationFailureException',
} as const;

const knownErrors = new Set<string>(Object.values(DatabaseErrors));

/**
 * Wrap an error with a standardized DatabaseErrors name.
 *
 * If the error already has a recognized DatabaseErrors name, it is re-thrown as-is.
 * Otherwise, its name is set to QueryFailed before throwing.
 *
 * @param e - The caught value (may not be an Error)
 */
export function wrapError(e: unknown): never {
  const error = e instanceof Error ? e : new Error(String(e));
  if (!knownErrors.has(error.name)) {
    error.name = DatabaseErrors.QueryFailed;
  }
  throw error;
}
