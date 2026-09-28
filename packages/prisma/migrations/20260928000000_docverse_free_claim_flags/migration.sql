-- Docverse: every paid feature is free. Enable the feature flags on the
-- internal "free" claim used by new organisations, and on existing
-- organisation claims.
UPDATE "SubscriptionClaim"
SET "flags" = COALESCE("flags", '{}'::jsonb) || '{
  "unlimitedDocuments": true,
  "allowCustomBranding": true,
  "hidePoweredBy": true,
  "embedSigning": true,
  "embedSigningWhiteLabel": true,
  "embedAuthoring": true,
  "embedAuthoringWhiteLabel": true,
  "cfr21": true,
  "signingReminders": true
}'::jsonb,
"updatedAt" = NOW()
WHERE "id" = 'free';

UPDATE "OrganisationClaim"
SET "flags" = COALESCE("flags", '{}'::jsonb) || '{
  "unlimitedDocuments": true,
  "allowCustomBranding": true,
  "hidePoweredBy": true,
  "embedSigning": true,
  "embedSigningWhiteLabel": true,
  "embedAuthoring": true,
  "embedAuthoringWhiteLabel": true,
  "cfr21": true,
  "signingReminders": true
}'::jsonb,
"updatedAt" = NOW();
