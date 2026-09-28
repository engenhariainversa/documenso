import { z } from 'zod';

import { ZSiteSettingsBannerSchema } from './schemas/banner';
import { ZSiteSettingsEmailBlocklistSchema } from './schemas/email-blocklist';

export const ZSiteSettingSchema = z.union([ZSiteSettingsBannerSchema, ZSiteSettingsEmailBlocklistSchema]);

export type TSiteSettingSchema = z.infer<typeof ZSiteSettingSchema>;

export const ZSiteSettingsSchema = z.array(ZSiteSettingSchema);

export type TSiteSettingsSchema = z.infer<typeof ZSiteSettingsSchema>;
