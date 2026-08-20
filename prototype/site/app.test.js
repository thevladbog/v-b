import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveLocale, validateContactForm } from './app.js';

test('stored locale has priority over the browser locale', () => {
  assert.equal(resolveLocale({ storedLocale: 'en', browserLocale: 'ru-RU' }), 'en');
});

test('Russian browser locale selects Russian when nothing is stored', () => {
  assert.equal(resolveLocale({ storedLocale: null, browserLocale: 'ru-RU' }), 'ru');
});

test('unknown browser locale falls back to English', () => {
  assert.equal(resolveLocale({ storedLocale: null, browserLocale: 'de-DE' }), 'en');
});

test('contact form rejects empty fields with localized errors', () => {
  assert.deepEqual(
    validateContactForm({ name: '', contact: '', message: '' }, 'en'),
    {
      valid: false,
      errors: {
        name: 'Please enter your name.',
        contact: 'Please add an email or Telegram handle.',
        message: 'Please describe the product or problem.',
      },
    },
  );
});

test('contact form rejects a contact value that is neither email nor Telegram', () => {
  const result = validateContactForm(
    { name: 'Vlad', contact: 'call me', message: 'A sufficiently clear project brief.' },
    'en',
  );

  assert.equal(result.valid, false);
  assert.equal(result.errors.contact, 'Use an email address or @telegram handle.');
});

test('contact form accepts a valid Telegram handle', () => {
  assert.deepEqual(
    validateContactForm(
      {
        name: 'Vlad',
        contact: '@thevladbog',
        message: 'I need help designing and building an operations product.',
      },
      'en',
    ),
    { valid: true, errors: {} },
  );
});

test('landing document exposes the approved personal-portfolio structure', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /data-case-list/);
  assert.match(html, /data-expertise-list/);
  assert.match(html, /data-approach-list/);
  assert.match(html, /data-contact-form/);
  assert.match(html, /name="name"/);
  assert.match(html, /name="contact"/);
  assert.match(html, /name="message"/);
  assert.match(html, /<label for="contact-name"/);
  assert.match(html, /id="contact-name"[^>]+aria-describedby="contact-name-error"/);
  assert.match(html, /<label for="contact-channel"/);
  assert.match(html, /id="contact-channel"[^>]+aria-describedby="contact-channel-error"/);
  assert.match(html, /<label for="contact-message"/);
  assert.match(html, /id="contact-message"[^>]+aria-describedby="contact-message-error"/);
  assert.equal((html.match(/data-locale="ru"/g) || []).length, 2);
  assert.equal((html.match(/data-locale="en"/g) || []).length, 2);
  assert.match(html, /data-menu-button[^>]+data-i18n-aria-label="menuOpen"/);
  assert.match(html, /data-navigation[^>]+data-i18n-aria-label="primaryNav"/);
  assert.match(app, /\[data-i18n-aria-label\]/);
});
