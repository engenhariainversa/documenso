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

-- Docverse: the telemetry client is removed and its site-setting schema was
-- dropped from the ZSiteSettingSchema union. Delete the legacy row so
-- getSiteSettings() (which parses every row against that union) doesn't
-- throw on instances that previously ran with telemetry enabled.
DELETE FROM "SiteSettings" WHERE "id" = 'telemetry.installation';
