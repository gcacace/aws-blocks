// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Typed error constants for AuthOIDC. Use with `isBlocksError()` in catch blocks.
 *
 * @example
 * ```typescript
 * import { isBlocksError } from '@aws-blocks/core';
 * import { AuthOIDCErrors } from '@aws-blocks/bb-auth-oidc';
 *
 * try {
 *   await auth.requireAuth(ctx);
 * } catch (e: unknown) {
 *   if (isBlocksError(e, AuthOIDCErrors.TokenExpired)) {
 *     // session expired
 *   }
 *   throw e;
 * }
 * ```
 */
export const AuthOIDCErrors = {
	NotAuthenticated: 'NotAuthenticatedException',
	TokenExpired: 'TokenExpiredException',
	InvalidState: 'InvalidStateException',
	InvalidCallback: 'InvalidCallbackException',
	ProviderNotConfigured: 'ProviderNotConfiguredException',
	IdpError: 'IdpErrorException',
	InvalidRelay: 'InvalidRelayException',
	SdkOutdated: 'SdkOutdatedException',
} as const;

/**
 * Union of the error-name string literals in {@link AuthOIDCErrors}.
 * The discriminant `isBlocksError()` checks against.
 */
export type AuthOIDCErrorName = (typeof AuthOIDCErrors)[keyof typeof AuthOIDCErrors];

/** Reasons a `relayTo` URI was rejected at `/aws-blocks/auth/authorize-params`. */
import type { InvalidRelayReason } from './relay.js';
export type { InvalidRelayReason } from './relay.js';

/** Structured relay-rejection error for the route handler boundary. */
export class InvalidRelayError extends Error {
	override readonly name = 'InvalidRelayException';
	readonly reason: InvalidRelayReason;
	readonly allowedOrigins: readonly string[];

	constructor(reason: InvalidRelayReason, allowedOrigins: readonly string[]) {
		super(`relayTo rejected: ${reason}`);
		this.reason = reason;
		this.allowedOrigins = allowedOrigins;
	}
}
