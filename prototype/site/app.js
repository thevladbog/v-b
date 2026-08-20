import { approach, cases, content, expertise, moreProjects } from './content.js';

const supportedLocales = new Set(['ru', 'en']);

export function resolveLocale({ storedLocale, browserLocale }) {
  if (supportedLocales.has(storedLocale)) return storedLocale;
  return String(browserLocale || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

const validationMessages = {
  ru: {
    name: 'Укажите имя.',
    contact: 'Добавьте email или Telegram.',
    invalidContact: 'Используйте email или Telegram в формате @username.',
    message: 'Коротко опишите продукт или задачу.',
  },
  en: {
    name: 'Please enter your name.',
    contact: 'Please add an email or Telegram handle.',
    invalidContact: 'Use an email address or @telegram handle.',
    message: 'Please describe the product or problem.',
  },
};

export function validateContactForm(values, locale = 'en') {
  const language = supportedLocales.has(locale) ? locale : 'en';
  const messages = validationMessages[language];
  const name = String(values.name || '').trim();
  const contact = String(values.contact || '').trim();
  const message = String(values.message || '').trim();
  const errors = {};

  if (!name) errors.name = messages.name;
  if (!contact) {
    errors.contact = messages.contact;
  } else if (!/^\S+@\S+\.\S+$/.test(contact) && !/^@[a-zA-Z0-9_]{5,}$/.test(contact)) {
    errors.contact = messages.invalidContact;
  }
  if (!message) errors.message = messages.message;

  return { valid: Object.keys(errors).length === 0, errors };
}

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

function projectIllustration(project) {
  const patterns = {
    markiro: `
      <div class="machine-head"><span>station / line-04</span><b>offline journal · 127</b></div>
      <div class="machine-grid"><span class="machine-code">010460123456789021ABC123</span><span class="machine-ok">accepted</span></div>
      <div class="machine-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>`,
    idento: `
      <div class="badge-preview"><div class="badge-photo"></div><div><small>ATTENDEE / 0842</small><strong>Alex Morgan</strong><span>Product systems</span></div><div class="badge-qr" aria-hidden="true"></div></div>
      <div class="machine-head"><span>check-in</span><b>local mode · ready</b></div>`,
    quokkaq: `
      <div class="queue-display"><small>NOW SERVING</small><strong>A–042</strong><span>desk 07</span></div>
      <div class="queue-rail"><i class="done">A–039</i><i class="done">A–040</i><i class="active">A–042</i><i>A–043</i></div>`,
  };
  return patterns[project.id] || '';
}

function renderCases(locale) {
  const container = document.querySelector('[data-case-list]');
  if (!container) return;

  container.innerHTML = cases[locale]
    .map(
      (project, index) => `
        <article class="case case--${escapeHtml(project.id)}" data-case="${escapeHtml(project.id)}">
          <div class="case-copy">
            <div class="case-meta"><span>${escapeHtml(project.number)}</span><span>${escapeHtml(project.status)}</span></div>
            <div class="case-title-row">
              <img src="${escapeHtml(project.mark)}" alt="" width="48" height="48">
              <h3>${escapeHtml(project.name)}</h3>
            </div>
            <dl class="case-facts">
              <div><dt>${locale === 'ru' ? 'Задача' : 'Problem'}</dt><dd>${escapeHtml(project.problem)}</dd></div>
              <div><dt>${locale === 'ru' ? 'Моя роль' : 'My role'}</dt><dd>${escapeHtml(project.role)}</dd></div>
              <div><dt>${locale === 'ru' ? 'Решение' : 'Solution'}</dt><dd>${escapeHtml(project.solution)}</dd></div>
              <div class="case-result"><dt>${locale === 'ru' ? 'Результат' : 'Outcome'}</dt><dd>${escapeHtml(project.result)}</dd></div>
            </dl>
            <div class="case-tags">${project.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
            <a class="text-link" href="${escapeHtml(project.href)}" target="_blank" rel="noopener">
              ${locale === 'ru' ? 'Открыть проект' : 'Open project'} <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div class="case-visual" aria-label="${escapeHtml(project.name)} ${locale === 'ru' ? '— иллюстрация продуктового интерфейса' : '— illustrative product interface'}">
            <div class="visual-index">0${index + 1}</div>
            <div class="visual-window">${projectIllustration(project)}</div>
            <div class="visual-caption">${escapeHtml(project.id)} · v-b.tech / product system</div>
          </div>
        </article>`,
    )
    .join('');
}

function renderGrid(selector, items, className) {
  const container = document.querySelector(selector);
  if (!container) return;
  container.innerHTML = items
    .map(
      ([number, title, description]) => `
        <article class="${className}" data-n="${escapeHtml(number)}">
          <span>${escapeHtml(number)}</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </article>`,
    )
    .join('');
}

function renderMoreProjects(locale) {
  const container = document.querySelector('[data-more-projects]');
  if (!container) return;
  container.innerHTML = moreProjects[locale]
    .map(
      ([id, name, description, status, href]) => `
        <a href="${escapeHtml(href)}" target="_blank" rel="noopener">
          <span class="manifest-id">${escapeHtml(id)}</span>
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(description)}</span>
          <i>${escapeHtml(status)} ↗</i>
        </a>`,
    )
    .join('');
}

function applyLocale(locale) {
  const dictionary = content[locale];
  document.documentElement.lang = locale;
  document.title = dictionary.metaTitle;
  document.querySelector('meta[name="description"]')?.setAttribute('content', dictionary.metaDescription);

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const value = dictionary[element.dataset.i18n];
    if (value !== undefined) element.textContent = value;
  });
  document.querySelectorAll('[data-i18n-html]').forEach((element) => {
    const value = dictionary[element.dataset.i18nHtml];
    if (value !== undefined) element.innerHTML = value;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const value = dictionary[element.dataset.i18nPlaceholder];
    if (value !== undefined) element.setAttribute('placeholder', value);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    const value = dictionary[element.dataset.i18nAriaLabel];
    if (value !== undefined) element.setAttribute('aria-label', value);
  });
  document.querySelectorAll('[data-locale]').forEach((button) => {
    const active = button.dataset.locale === locale;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  renderCases(locale);
  renderGrid('[data-expertise-list]', expertise[locale], 'expertise-card');
  renderGrid('[data-approach-list]', approach[locale], 'approach-step');
  renderMoreProjects(locale);
}

function setFieldError(fieldName, message) {
  const field = document.querySelector(`[name="${fieldName}"]`);
  const error = document.querySelector(`[data-error-for="${fieldName}"]`);
  if (!field || !error) return;
  field.setAttribute('aria-invalid', String(Boolean(message)));
  error.textContent = message || '';
}

function init() {
  let locale = resolveLocale({
    storedLocale: window.localStorage.getItem('vb-locale'),
    browserLocale: window.navigator.language,
  });
  const menuButton = document.querySelector('[data-menu-button]');
  const navigation = document.querySelector('[data-navigation]');
  const form = document.querySelector('[data-contact-form]');
  const formStatus = document.querySelector('[data-form-status]');

  const closeMenu = () => {
    navigation?.classList.remove('is-open');
    menuButton?.setAttribute('aria-expanded', 'false');
    if (menuButton) menuButton.setAttribute('aria-label', content[locale].menuOpen);
  };

  applyLocale(locale);

  document.querySelectorAll('[data-locale]').forEach((button) => {
    button.addEventListener('click', () => {
      locale = button.dataset.locale;
      window.localStorage.setItem('vb-locale', locale);
      applyLocale(locale);
      closeMenu();
    });
  });

  menuButton?.addEventListener('click', () => {
    const open = navigation?.classList.toggle('is-open') || false;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', content[locale][open ? 'menuClose' : 'menuOpen']);
  });
  navigation?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const result = validateContactForm(values, locale);

    ['name', 'contact', 'message'].forEach((field) => setFieldError(field, result.errors[field]));
    if (!result.valid) {
      formStatus.textContent = '';
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    formStatus.textContent = content[locale].formSuccess;
    form.reset();
  });
}

if (typeof document !== 'undefined') {
  init();
}
