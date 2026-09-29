import { OrganisationMemberRole } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSettingsNavGroups } from './settings-nav';

const getOrganisationItemKeys = (role: OrganisationMemberRole) => {
  const groups = getSettingsNavGroups({
    organisation: { url: 'acme', currentOrganisationRole: role },
    team: null,
    hasManageableBillingOrgs: false,
  });

  return groups.organisation?.items.map((item) => item.key) ?? null;
};

describe('getSettingsNavGroups plan item', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, '', 'false'])('is hidden when cloud billing is %j', (value) => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', value);

    expect(getOrganisationItemKeys(OrganisationMemberRole.ADMIN)).not.toContain('billing');
  });

  it('is shown to an admin when cloud billing is enabled', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', 'true');

    const groups = getSettingsNavGroups({
      organisation: { url: 'acme', currentOrganisationRole: OrganisationMemberRole.ADMIN },
      team: null,
      hasManageableBillingOrgs: false,
    });

    const item = groups.organisation?.items.find(({ key }) => key === 'billing');

    expect(item?.path).toBe('/o/acme/settings/billing');
  });

  it('is the last item of the organisation group', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', 'true');

    expect(getOrganisationItemKeys(OrganisationMemberRole.ADMIN)?.at(-1)).toBe('billing');
  });

  it('is hidden from a manager, who can manage the organisation but not its billing', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', 'true');

    const keys = getOrganisationItemKeys(OrganisationMemberRole.MANAGER);

    expect(keys).toContain('general');
    expect(keys).not.toContain('billing');
  });

  it('leaves a member without an organisation group', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', 'true');

    expect(getOrganisationItemKeys(OrganisationMemberRole.MEMBER)).toBeNull();
  });

  it('does not change the other items', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', '');

    const withoutBilling = getOrganisationItemKeys(OrganisationMemberRole.ADMIN);

    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', 'true');

    const withBilling = getOrganisationItemKeys(OrganisationMemberRole.ADMIN);

    expect(withBilling).toEqual([...(withoutBilling ?? []), 'billing']);
  });
});
