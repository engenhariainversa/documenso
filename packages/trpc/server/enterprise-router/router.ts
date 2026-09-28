import { router } from '../trpc';
import { cscSignEnvelopeRoute } from './csc-sign-envelope';

export const enterpriseRouter = router({
  csc: {
    signEnvelope: cscSignEnvelopeRoute,
  },
});
