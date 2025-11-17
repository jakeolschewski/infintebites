// planner.js
// Loaded via: <script type="module" src="/js/planner.js"></script>

'use strict';

/**
 * @typedef {Object} PlannerPayload
 * @property {number} age_months
 * @property {string} concern
 * @property {string} [email]
 */

/**
 * @typedef {Object} PlannerStepData
 * @property {string[]} [steps]
 */

/**
 * @typedef {Object} PlannerBundle
 * @property {string|number} id
 * @property {string} name
 * @property {string} [description]
 * @property {string} [price]
 */

/**
 * @typedef {Object} PlannerConfig
 * @property {HTMLFormElement} form
 * @property {HTMLElement} planSection
 * @property {HTMLElement} bundlesSection
 * @property {HTMLElement} statusEl
 * @property {HTMLElement} spinnerEl
 * @property {HTMLButtonElement} submitButton
 * @property {number} [timeoutMs]
 * @property {string} [planEndpoint]
 * @property {(concern: string) => string} [bundlesEndpoint]
 * @property {(stage: string, detail?: unknown) => void} [onEvent]
 */

/**
 * @typedef {Object} PlannerValidationResult
 * @property {boolean} ok
 * @property {string|null} [formError]
 * @property {Record<string, string>} [fieldErrors]
 */

const DEFAULTS = {
  API: {
    PLAN: '/api/planner/plan',
    // NOTE: keeping original query param shape; change if your backend expects something else
    BUNDLES: (concern) => `/api/bundles?age=${encodeURIComponent(concern)}`,
    TIMEOUT_MS: 15000
  },
  CSS: {
    STATUS_OK: 'status status--ok',
    STATUS_ERROR: 'status status--error',
    STATUS_NEUTRAL: 'status',
    FIELD_ERROR: 'field-error',
    FIELD_INVALID: 'field-invalid',
    BUNDLE_CARD: 'bundle',
    DISCLAIMER: 'disclaimer',
    HIDDEN: 'hidden'
  },
  TEXT: {
    PLAN_HEADING: 'Your Personalized Plan',
    BUNDLES_HEADING: 'Recommended Deals',
    NO_BUNDLES: 'No bundles found for this concern.',
    DISCLAIMER:
      'This plan is general in nature and is not medical advice. Always consult a qualified professional for specific concerns.',
    STATUS_IDLE: '',
    STATUS_LOADING: 'Generating your plan…',
    STATUS_SUCCESS: 'All done! Enjoy your personalized plan.',
    STATUS_VALIDATION_ERROR: 'Please fix the highlighted fields and try again.',
    STATUS_GENERIC_ERROR: 'Something went wrong. Please try again later.',
    STATUS_NETWORK_ERROR: 'Network error – please check your connection and try again.',
    STATUS_TIMEOUT_ERROR: 'Request took too long – please try again in a moment.',
    STATUS_PARTIAL_BUNDLES_ERROR: 'Plan generated, but bundle recommendations are unavailable right now.'
  },
  VALIDATION: {
    MIN_AGE_MONTHS: 1,
    MAX_AGE_MONTHS: 600, // 50 years, change as needed
    MIN_CONCERN_LEN: 3,
    MAX_CONCERN_LEN: 500
  }
};

/* -------------------------------------------------------------------------- */
/* Small utility helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Create an element with optional props & children.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Partial<HTMLElementTagNameMap[K]> & Record<string, any>} [props]
 * @param {Array<Node|string>} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
function createEl(tag, props = {}, children = []) {
  const el = /** @type {any} */ (document.createElement(tag));

  Object.entries(props).forEach(([key, value]) => {
    if (value == null) return;

    if (key === 'className') {
      el.className = String(value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        if (dataValue != null) {
          el.dataset[dataKey] = String(dataValue);
        }
      });
    } else if (key in el) {
      el[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  });

  children.forEach((child) => {
    if (child == null) return;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });

  return el;
}

/**
 * Fetch wrapper with timeout + safe JSON handling.
 * @template T
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} [options]
 * @returns {Promise<T|null>}
 */
async function jsonFetch(url, options = {}) {
  const { timeoutMs = DEFAULTS.API.TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });

    if (!res.ok) {
      let detail = '';
      try {
        const json = await res.json();
        if (json && typeof json.message === 'string') {
          detail = `: ${json.message}`;
        }
      } catch {
        // ignore parse error and fall back to status text
      }
      const error = new Error(`HTTP ${res.status}${detail}`);
      // @ts-ignore
      error.status = res.status;
      throw error;
    }

    const text = await res.text();
    if (!text) {
      return null;
    }

    try {
      return /** @type {T} */ (JSON.parse(text));
    } catch (err) {
      console.error('[planner] Invalid JSON from', url, err);
      throw new Error('Invalid JSON response');
    }
  } catch (err) {
    if (err && /** @type {any} */ (err).name === 'AbortError') {
      const e = new Error('timeout');
      // @ts-ignore
      e.code = 'TIMEOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/* -------------------------------------------------------------------------- */
/* PlannerApp class                                                           */
/* -------------------------------------------------------------------------- */

class PlannerApp {
  /** @param {PlannerConfig} config */
  constructor(config) {
    this.form = config.form;
    this.planSection = config.planSection;
    this.bundlesSection = config.bundlesSection;
    this.statusEl = config.statusEl;
    this.spinnerEl = config.spinnerEl;
    this.submitButton = config.submitButton;
    this.onEvent = config.onEvent || (() => {});

    this.planEndpoint = config.planEndpoint || DEFAULTS.API.PLAN;
    this.bundlesEndpoint = config.bundlesEndpoint || DEFAULTS.API.BUNDLES;
    this.timeoutMs = config.timeoutMs || DEFAULTS.API.TIMEOUT_MS;

    /** @type {HTMLInputElement|null} */
    this.ageInput = this.form.querySelector('#age');
    /** @type {HTMLInputElement|null} */
    this.concernInput = this.form.querySelector('#concern');
    /** @type {HTMLInputElement|null} */
    this.emailInput = this.form.querySelector('#email');

    // Accessibility
    this.statusEl.setAttribute('role', 'status');
    this.statusEl.setAttribute('aria-live', 'polite');
  }

  /* ---------------------------------------------------------------------- */
  /* Initialization                                                         */
  /* ---------------------------------------------------------------------- */

  init() {
    if (!this.ageInput || !this.concernInput) {
      console.error('[planner] Missing #age or #concern input in form.');
      return;
    }

    this.form.addEventListener('submit', (event) => this.handleSubmit(event));

    // Live validation on blur for nicer UX
    this.ageInput.addEventListener('blur', () => this.validateAndShowErrors(false));
    this.concernInput.addEventListener('blur', () => this.validateAndShowErrors(false));
    if (this.emailInput) {
      this.emailInput.addEventListener('blur', () => this.validateAndShowErrors(false));
    }

    this.resetUI();
  }

  /* ---------------------------------------------------------------------- */
  /* UI state helpers                                                       */
  /* ---------------------------------------------------------------------- */

  resetUI() {
    this.clearStatus();
    this.hideSpinner();
    this.clearFieldErrors();
  }

  showSpinner() {
    this.spinnerEl.classList.remove(DEFAULTS.CSS.HIDDEN);
    this.form.setAttribute('aria-busy', 'true');
  }

  hideSpinner() {
    this.spinnerEl.classList.add(DEFAULTS.CSS.HIDDEN);
    this.form.removeAttribute('aria-busy');
  }

  /**
   * @param {string} msg
   * @param {boolean} [isError=false]
   */
  setStatus(msg, isError = false) {
    this.statusEl.textContent = msg;
    this.statusEl.className = isError
      ? DEFAULTS.CSS.STATUS_ERROR
      : msg
        ? DEFAULTS.CSS.STATUS_OK
        : DEFAULTS.CSS.STATUS_NEUTRAL;
  }

  clearStatus() {
    this.setStatus(DEFAULTS.TEXT.STATUS_IDLE, false);
  }

  disableForm() {
    this.submitButton.disabled = true;
    this.submitButton.setAttribute('aria-disabled', 'true');
  }

  enableForm() {
    this.submitButton.disabled = false;
    this.submitButton.setAttribute('aria-disabled', 'false');
  }

  clearFieldErrors() {
    if (this.ageInput) this.setFieldError(this.ageInput, null);
    if (this.concernInput) this.setFieldError(this.concernInput, null);
    if (this.emailInput) this.setFieldError(this.emailInput, null);
  }

  /**
   * @param {HTMLElement} field
   * @param {string|null} message
   */
  setFieldError(field, message) {
    const fieldWrapper = field.closest('[data-field-wrapper]') || field.parentElement || field;
    const existingError = fieldWrapper.querySelector(`.${DEFAULTS.CSS.FIELD_ERROR}`);

    field.classList.remove(DEFAULTS.CSS.FIELD_INVALID);
    if (existingError) existingError.remove();
    field.removeAttribute('aria-describedby');

    if (!message) return;

    field.classList.add(DEFAULTS.CSS.FIELD_INVALID);

    const errorId = `${field.id || field.name}-error`;
    const errorEl = createEl(
      'div',
      {
        className: DEFAULTS.CSS.FIELD_ERROR,
        id: errorId
      },
      [message]
    );

    fieldWrapper.appendChild(errorEl);
    field.setAttribute('aria-describedby', errorId);
  }

  /* ---------------------------------------------------------------------- */
  /* Validation                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * @returns {PlannerValidationResult}
   */
  validate() {
    /** @type {Record<string, string>} */
    const fieldErrors = {};

    const rawAge = this.ageInput?.value?.trim() || '';
    const rawConcern = this.concernInput?.value?.trim() || '';
    const rawEmail = this.emailInput?.value?.trim() || '';

    // Age
    const ageNumber = Number(rawAge);
    if (!rawAge) {
      fieldErrors.age = 'Age is required.';
    } else if (!Number.isFinite(ageNumber) || ageNumber <= 0) {
      fieldErrors.age = 'Age must be a positive number.';
    } else if (
      ageNumber < DEFAULTS.VALIDATION.MIN_AGE_MONTHS ||
      ageNumber > DEFAULTS.VALIDATION.MAX_AGE_MONTHS
    ) {
      fieldErrors.age = `Age must be between ${DEFAULTS.VALIDATION.MIN_AGE_MONTHS} and ${DEFAULTS.VALIDATION.MAX_AGE_MONTHS} months.`;
    }

    // Concern
    if (!rawConcern) {
      fieldErrors.concern = 'Please describe your main concern.';
    } else if (rawConcern.length < DEFAULTS.VALIDATION.MIN_CONCERN_LEN) {
      fieldErrors.concern = `Concern must be at least ${DEFAULTS.VALIDATION.MIN_CONCERN_LEN} characters.`;
    } else if (rawConcern.length > DEFAULTS.VALIDATION.MAX_CONCERN_LEN) {
      fieldErrors.concern = `Concern must be at most ${DEFAULTS.VALIDATION.MAX_CONCERN_LEN} characters.`;
    }

    // Email (optional but validate if present)
    if (rawEmail) {
      const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!basicEmailRegex.test(rawEmail)) {
        fieldErrors.email = 'Please enter a valid email address.';
      }
    }

    const ok = Object.keys(fieldErrors).length === 0;

    return {
      ok,
      formError: ok ? null : DEFAULTS.TEXT.STATUS_VALIDATION_ERROR,
      fieldErrors
    };
  }

  /**
   * Runs validation, updates UI, and optionally focuses the first invalid field.
   * @param {boolean} focusFirstInvalid
   * @returns {boolean} `true` if valid
   */
  validateAndShowErrors(focusFirstInvalid = true) {
    const { ok, formError, fieldErrors } = this.validate();

    this.clearFieldErrors();

    if (!ok) {
      this.setStatus(formError || DEFAULTS.TEXT.STATUS_VALIDATION_ERROR, true);

      /** @type {HTMLElement|null} */
      let firstInvalidField = null;

      if (this.ageInput && fieldErrors.age) {
        this.setFieldError(this.ageInput, fieldErrors.age);
        firstInvalidField = firstInvalidField || this.ageInput;
      }

      if (this.concernInput && fieldErrors.concern) {
        this.setFieldError(this.concernInput, fieldErrors.concern);
        firstInvalidField = firstInvalidField || this.concernInput;
      }

      if (this.emailInput && fieldErrors.email) {
        this.setFieldError(this.emailInput, fieldErrors.email);
        firstInvalidField = firstInvalidField || this.emailInput;
      }

      if (focusFirstInvalid && firstInvalidField) {
        firstInvalidField.focus();
      }
    } else {
      this.clearStatus();
    }

    return ok;
  }

  /**
   * Get payload from the form. Assumes validation has already passed.
   * @returns {PlannerPayload}
   */
  getPayload() {
    const ageMonths = Number(this.ageInput?.value?.trim() || '0');
    const concern = this.concernInput?.value?.trim() || '';
    const email = this.emailInput?.value?.trim() || '';

    /** @type {PlannerPayload} */
    const payload = { age_months: ageMonths, concern };
    if (email) payload.email = email;
    return payload;
  }

  /* ---------------------------------------------------------------------- */
  /* Rendering methods                                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * @param {PlannerStepData|null} planData
   */
  renderPlan(planData) {
    this.planSection.innerHTML = '';
    const frag = document.createDocumentFragment();

    const heading = createEl('h2', {
      textContent: DEFAULTS.TEXT.PLAN_HEADING,
      id: 'plan-heading'
    });
    frag.appendChild(heading);

    const steps = Array.isArray(planData?.steps) ? planData.steps : [];
    if (steps.length > 0) {
      const list = createEl('ul', { 'aria-labelledby': 'plan-heading' });
      steps.forEach((step, idx) => {
        list.appendChild(
          createEl('li', { dataset: { stepIndex: String(idx + 1) } }, [step])
        );
      });
      frag.appendChild(list);
    }

    const disclaimer = createEl('p', { className: DEFAULTS.CSS.DISCLAIMER }, [
      DEFAULTS.TEXT.DISCLAIMER
    ]);
    frag.appendChild(disclaimer);

    this.planSection.appendChild(frag);
  }

  /**
   * @param {PlannerBundle[]|null} bundles
   */
  renderBundles(bundles) {
    this.bundlesSection.innerHTML = '';
    const frag = document.createDocumentFragment();

    const arr = Array.isArray(bundles) ? bundles : [];

    if (arr.length === 0) {
      frag.appendChild(createEl('p', {}, [DEFAULTS.TEXT.NO_BUNDLES]));
      this.bundlesSection.appendChild(frag);
      return;
    }

    const heading = createEl('h2', {
      textContent: DEFAULTS.TEXT.BUNDLES_HEADING,
      id: 'bundles-heading'
    });
    frag.appendChild(heading);

    arr.forEach((bundle) => {
      const idSafe = encodeURIComponent(String(bundle.id ?? 'bundle'));

      const article = createEl('article', {
        className: DEFAULTS.CSS.BUNDLE_CARD,
        'aria-labelledby': `bundle-${idSafe}-title`
      });

      const title = createEl('h3', {
        id: `bundle-${idSafe}-title`,
        textContent: bundle.name ?? 'Bundle'
      });

      const descText = bundle.description || '';
      const priceText = bundle.price ? `Price: ${bundle.price}` : '';

      const desc = descText
        ? createEl('p', {}, [descText])
        : createEl('p', {}, []);
      const price = priceText
        ? createEl('p', {}, [priceText])
        : createEl('p', {}, []);

      const link = createEl('a', {
        href: `/api/bundles/go/${idSafe}`,
        rel: 'noopener sponsored nofollow',
        target: '_blank',
        textContent: 'View deal'
      });

      article.append(title, desc, price, link);
      frag.appendChild(article);
    });

    this.bundlesSection.appendChild(frag);
  }

  /* ---------------------------------------------------------------------- */
  /* Main handler                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * @param {SubmitEvent} event
   */
  async handleSubmit(event) {
    event.preventDefault();

    // Validation first
    if (!this.validateAndShowErrors(true)) {
      this.onEvent('validation_failed');
      return;
    }

    const payload = this.getPayload();
    this.onEvent('submit', { payload });

    this.disableForm();
    this.showSpinner();
    this.setStatus(DEFAULTS.TEXT.STATUS_LOADING, false);

    try {
      // 1) Fetch plan
      const planData = await jsonFetch(/** @type {string} */ (this.planEndpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: this.timeoutMs
      });

      this.renderPlan(planData);
      this.onEvent('plan_success', { plan: planData });

      // 2) Fetch bundles (best-effort; don't wipe out a good plan if this fails)
      try {
        const bundlesUrl = this.bundlesEndpoint(payload.concern);
        const bundlesData = await jsonFetch(bundlesUrl, {
          method: 'GET',
          timeoutMs: this.timeoutMs
        });
        this.renderBundles(bundlesData);
        this.onEvent('bundles_success', { bundles: bundlesData });

        this.setStatus(DEFAULTS.TEXT.STATUS_SUCCESS, false);
        this.onEvent('success', { plan: planData, bundles: bundlesData });
      } catch (bundlesErr) {
        console.error('[planner] Error while fetching bundles:', bundlesErr);
        this.renderBundles(null); // show "No bundles" message
        this.setStatus(DEFAULTS.TEXT.STATUS_PARTIAL_BUNDLES_ERROR, true);
        this.onEvent('bundles_error', bundlesErr);
      }
    } catch (err) {
      console.error('[planner] Error while generating plan:', err);
      this.onEvent('error', err);

      const message = this.resolveErrorMessage(err);
      this.setStatus(message, true);
    } finally {
      this.hideSpinner();
      this.enableForm();
    }
  }

  /**
   * Map low-level errors to user-friendly copy.
   * @param {unknown} err
   * @returns {string}
   */
  resolveErrorMessage(err) {
    if (!err) return DEFAULTS.TEXT.STATUS_GENERIC_ERROR;

    const anyErr = /** @type {any} */ (err);

    if (anyErr.code === 'TIMEOUT' || anyErr.message === 'timeout') {
      return DEFAULTS.TEXT.STATUS_TIMEOUT_ERROR;
    }

    if (anyErr instanceof TypeError) {
      // Typical fetch network error
      return DEFAULTS.TEXT.STATUS_NETWORK_ERROR;
    }

    return DEFAULTS.TEXT.STATUS_GENERIC_ERROR;
  }
}

/* -------------------------------------------------------------------------- */
/* Auto-bootstrap on DOM ready                                                */
/* -------------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  /** @type {HTMLFormElement|null} */
  const form = document.getElementById('planner-form');
  const planSection = document.getElementById('plan-section');
  const bundlesSection = document.getElementById('bundles-section');
  const statusEl = document.getElementById('status');
  const spinnerEl = document.getElementById('spinner');
  const submitButton = form?.querySelector('button[type="submit"]') || null;

  if (!form || !planSection || !bundlesSection || !statusEl || !spinnerEl || !submitButton) {
    console.error(
      '[planner] Initialization failed – required DOM elements are missing. ' +
        'Check #planner-form, #plan-section, #bundles-section, #status, #spinner, and a submit button.'
    );
    return;
  }

  const app = new PlannerApp({
    form,
    planSection,
    bundlesSection,
    statusEl,
    spinnerEl,
    submitButton,
    // Optional customization points:
    // planEndpoint: '/api/planner/plan',
    // bundlesEndpoint: (concern) => `/api/bundles?age=${encodeURIComponent(concern)}`,
    // timeoutMs: 15000,
    onEvent: (stage, detail) => {
      // Hook for analytics / debugging
      // e.g. window.gtag?.('event', 'planner_' + stage, { detail });
      // console.debug('[planner:event]', stage, detail);
    }
  });

  app.init();

  // Expose for debugging / manual triggering from devtools if you want
  // @ts-ignore
  window.__plannerApp = app;
});