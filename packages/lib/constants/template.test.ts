import { describe, expect, it } from 'vitest';

import { generateRecipientPlaceholder } from '../utils/templates';
import { isTemplateRecipientEmailPlaceholder, TEMPLATE_RECIPIENT_EMAIL_PLACEHOLDER_DOMAIN } from './template';

describe('template recipient email placeholders', () => {
  it('generates placeholders on the reserved .invalid domain', () => {
    const placeholder = generateRecipientPlaceholder(3);

    expect(placeholder.email).toBe(`recipient.3@${TEMPLATE_RECIPIENT_EMAIL_PLACEHOLDER_DOMAIN}`);
    expect(placeholder.email.endsWith('.invalid')).toBe(true);
    expect(isTemplateRecipientEmailPlaceholder(placeholder.email)).toBe(true);
  });

  it('still recognises placeholders created before the rename', () => {
    expect(isTemplateRecipientEmailPlaceholder('recipient.1@documenso.com')).toBe(true);
  });

  it('does not match real addresses', () => {
    expect(isTemplateRecipientEmailPlaceholder('someone@example.com')).toBe(false);
  });
});
