import { SetMetadata } from '@nestjs/common';

export const SKIP_SUBSCRIPTION_CHECK_KEY = 'skipSubscriptionCheck';

/**
 * Opt a route (or an entire controller) out of the global SubscriptionGuard.
 * Use for routes that a user MUST be able to reach even when the tenant's
 * subscription is expired — e.g. paying for a new plan, changing password,
 * viewing own tenant profile.
 */
export const SkipSubscriptionCheck = () => SetMetadata(SKIP_SUBSCRIPTION_CHECK_KEY, true);
