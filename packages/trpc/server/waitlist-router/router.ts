import { router } from '../trpc';
import { joinWaitlistRoute } from './join-waitlist';

export const waitlistRouter = router({
  join: joinWaitlistRoute,
});
