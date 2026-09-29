import { describe, expect, it } from 'vitest';

import { resolveLandingLanguage } from './landing-language';

describe('resolveLandingLanguage', () => {
  it('defaults to pt-BR when nothing is provided', () => {
    expect(resolveLandingLanguage({})).toBe('pt-BR');
    expect(resolveLandingLanguage({ requestedLang: null, acceptLanguage: null })).toBe('pt-BR');
    expect(resolveLandingLanguage({ acceptLanguage: '' })).toBe('pt-BR');
  });

  it('uses the explicitly requested language', () => {
    expect(resolveLandingLanguage({ requestedLang: 'en', acceptLanguage: 'pt-BR,pt;q=0.9' })).toBe('en');
    expect(resolveLandingLanguage({ requestedLang: 'pt-BR', acceptLanguage: 'en-US,en;q=0.9' })).toBe('pt-BR');
    expect(resolveLandingLanguage({ requestedLang: 'pt', acceptLanguage: 'en-US' })).toBe('pt-BR');
    expect(resolveLandingLanguage({ requestedLang: 'EN-us' })).toBe('en');
  });

  it('ignores an unsupported requested language', () => {
    expect(resolveLandingLanguage({ requestedLang: 'fr', acceptLanguage: 'en-US,en;q=0.9' })).toBe('en');
    expect(resolveLandingLanguage({ requestedLang: '<script>' })).toBe('pt-BR');
  });

  it('follows the first supported language of the accept-language header', () => {
    expect(resolveLandingLanguage({ acceptLanguage: 'en-US,en;q=0.9,pt-BR;q=0.8' })).toBe('en');
    expect(resolveLandingLanguage({ acceptLanguage: 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' })).toBe('pt-BR');
    expect(resolveLandingLanguage({ acceptLanguage: 'pt-PT,en;q=0.8' })).toBe('pt-BR');
    expect(resolveLandingLanguage({ acceptLanguage: 'fr-FR, en;q=0.8, pt;q=0.7' })).toBe('en');
  });

  it('honours quality values over header order', () => {
    expect(resolveLandingLanguage({ acceptLanguage: 'en;q=0.5,pt-BR;q=0.9' })).toBe('pt-BR');
    expect(resolveLandingLanguage({ acceptLanguage: 'en;q=0,pt;q=0.1' })).toBe('pt-BR');
  });

  it('falls back to pt-BR for languages the landing page does not have', () => {
    expect(resolveLandingLanguage({ acceptLanguage: 'es-AR,es;q=0.9' })).toBe('pt-BR');
    expect(resolveLandingLanguage({ acceptLanguage: '*' })).toBe('pt-BR');
  });
});
