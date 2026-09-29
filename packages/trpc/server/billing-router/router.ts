import { router } from '../trpc';
import { createCheckoutRoute } from './create-checkout';
import { getSubscriptionRoute } from './get-subscription';

/**
 * Docverse Cloud billing. Every route answers "not found" or reports a disabled
 * state unless cloud billing is enabled for the instance.
 */
export const billingRouter = router({
  getSubscription: getSubscriptionRoute,
  createCheckout: createCheckoutRoute,
});
