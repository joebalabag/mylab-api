import { SetMetadata } from '@nestjs/common';

export const ALLOW_OFFLINE_TOKEN_KEY = 'allowOfflineToken';

/**
 * Opt an endpoint into accepting the long-lived "offline" JWT minted by
 * POST /offline/enable. Without this marker, OfflineTokenGuard rejects
 * offline-token requests with 403 — an offline station should only be
 * allowed to reach the sync surface (bootstrap, pull, sync, refresh),
 * never admin or destructive routes.
 */
export const AllowOfflineToken = () => SetMetadata(ALLOW_OFFLINE_TOKEN_KEY, true);
