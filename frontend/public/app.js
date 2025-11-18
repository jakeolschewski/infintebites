// experience.js
// Loaded via: <script type="module" src="/js/experience.js"></script>
//
// "Experience layer" that sits on top of PlannerApp and provides:
//  - Grok quiz → personalized list + video explainers
//  - Registry builder + share link
//  - Milestone tracker
//  - Price alert subscriptions
//  - Review submission + photo upload
//  - AI live chat widget
//  - Daily self-evolution toggle (Zapier/Make webhook)
//
// Assumes planner.js exposes window.__plannerApp = app.

/* ========================================================================== */
/* Types (JSDoc only)                                                         */
/* ========================================================================== */

/**
 * @typedef {'user'|'assistant'} ChatRole
 */

/**
 * @typedef {Object} ChatMessage
 * @property {ChatRole} role
 * @property {string} content
 */

/**
 * @typedef {Object} GrokQuizResultItem
 * @property {string} title
 * @property {string} [description]
 */

/**
 * @typedef {Object} GrokQuizVideo
 * @property {string} title
 * @property {string} url
 */

/**
 * @typedef {Object} GrokQuizResponse
 * @property {GrokQuizResultItem[]} [items]
 * @property {GrokQuizVideo[]} [videos]
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
 * @property {string} [href]
 */

/**
 * @typedef {Object} ExperienceConfig
 * @property {any|null} plannerApp          // instance of PlannerApp, if available
 * @property {string} [grokQuizEndpoint]
 * @property {string} [chatEndpoint]
 * @property {string} [registryShareEndpoint]
 * @property {string} [priceAlertEndpoint]
 * @property {string} [reviewEndpoint]
 * @property {string} [selfEvolutionWebhookEndpoint]
 * @property {(stage: string, detail?: unknown) => void} [onEvent]
 */

/* ========================================================================== */
/* Constants                                                                  */
/* ========================================================================== */

const EXP_DEFAULTS = {
  API: {
    GROK_QUIZ: '/api/grok/quiz',
    CHAT: '/api/chat',
    REGISTRY_SHARE: '/api/registry/share',
    PRICE_ALERT: '/api/alerts/price',
    REVIEW: '/api/reviews',
    SELF_EVOLUTION_WEBHOOK: '/api/webhooks/self-evolution',
    TIMEOUT_MS: 15000
  },
  SELECTORS: {
    QUIZ_FORM: '#quiz-form',
    QUIZ_RESULTS: '#quiz-results',
    REGISTRY_ROOT: '#registry-builder',
    REGISTRY_FORM: '#registry-form',
    REGISTRY_LIST: '#registry-list',
    REGISTRY_SHARE: '#registry-share',
    MILESTONE_LIST: '#milestone-list',
    MILESTONE_ADD: '#milestone-add',
    PRICE_ALERT_FORM: '#price-alert-form',
    REVIEW_FORM: '#review-form',
    CHAT_WIDGET: '#chat-widget',
    SELF_EVOLUTION_TOGGLE: '#self-evolution-toggle'
  },
  CSS: {
    STATUS_OK: 'status status--ok',
    STATUS_ERROR: 'status status--error',
    STATUS_NEUTRAL: 'status',
    HIDDEN: 'hidden',
    CHAT_CONTAINER: 'chat-container',
    CHAT_MESSAGES: 'chat-messages',
    CHAT_MESSAGE_USER: 'chat-message chat-message--user',
    CHAT_MESSAGE_ASSISTANT: 'chat-message chat-message--assistant',
    CHAT_TOGGLE: 'chat-toggle',
    CHAT_HEADER: 'chat-header',
    CHAT_CLOSE: 'chat-close',
    MILESTONE_DONE: 'milestone-done',
    REGISTRY_ITEM: 'registry-item'
  },
  STORAGE: {
    REGISTRY: 'exp_registry_v1',
    MILESTONES: 'exp_milestones_v1'
  },
  TEXT: {
    QUIZ_LOADING: 'Generating your personalized list…',
    QUIZ_ERROR: 'Something went wrong. Please try again.',
    QUIZ_EMPTY: 'No recommendations yet. Try tweaking your answers.',
    QUIZ_HEADING_LIST: 'Your personalized list',
    QUIZ_HEADING_VIDEOS: 'Video explainers',

    REGISTRY_EMPTY: 'No items yet. Add your first one!',
    REGISTRY_SHARE_OK: 'Share link copied to clipboard!',
    REGISTRY_SHARE_ERROR: 'Could not generate share link. Please try again.',

    MILESTONES_EMPTY: 'No milestones yet – add one to get started.',

    PRICE_ALERT_LOADING: 'Subscribing…',
    PRICE_ALERT_OK: 'Price alert set! You will be notified by email.',
    PRICE_ALERT_ERROR: 'Could not create alert. Please try again later.',

    REVIEW_LOADING: 'Uploading your review…',
    REVIEW_OK: 'Thanks for your review!',
    REVIEW_ERROR: 'Could not submit review. Please try again later.',

    CHAT_PLACEHOLDER: 'Ask anything…',
    CHAT_TITLE: 'AI Assistant',
    CHAT_THINKING: 'Thinking…',
    CHAT_ERROR: 'Something went wrong. Please try again.',

    SELF_EVOLUTION_ERROR: 'Could not update daily self-evolution setting. Please try again.'
  }
};

/* ========================================================================== */
/* Generic utilities                                                          */
/* ========================================================================== */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Partial<HTMLElementTagNameMap[K]> & Record<string, any>} [props]
 * @param {Array<Node|string|null|undefined>} [children]
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
    } else if (key === 'onclick' && typeof value === 'function') {
      el.addEventListener('click', value);
    } else if (key in el) {
      el[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  });

  for (const child of children) {
    if (child == null) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return el;
}

/**
 * @template T
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} [options]
 * @returns {Promise<T>}
 */
async function jsonFetch(url, options = {}) {
  const { timeoutMs = EXP_DEFAULTS.API.TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body && typeof body.message === 'string') {
          message += `: ${body.message}`;
        }
      } catch {
        // ignore JSON parse
      }
      const err = new Error(message);
      // @ts-ignore
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    if (!text) return /** @type {any} */ ({});
    return /** @type {T} */ (JSON.parse(text));
  } finally {
    clearTimeout(id);
  }
}

/**
 * @param {HTMLElement|null} el
 * @param {string} msg
 * @param {boolean} [isError=false]
 */
function setStatusEl(el, msg, isError = false) {
  if (!el) return;
  el.textContent = msg;
  el.className = isError
    ? EXP_DEFAULTS.CSS.STATUS_ERROR
    : msg
      ? EXP_DEFAULTS.CSS.STATUS_OK
      : EXP_DEFAULTS.CSS.STATUS_NEUTRAL;
}

/* ========================================================================== */
/* Grok Quiz → personalized list + video explainers                          */
/* ========================================================================== */

class GrokQuiz {
  /**
   * @param {HTMLFormElement} form
   * @param {HTMLElement} results
   * @param {ExperienceConfig} config
   */
  constructor(form, results, config) {
    this.form = form;
    this.results = results;
    this.config = config;
    this.loading = false;
    /** @type {PlannerStepData|null} */
    this.latestPlan = null;
    /** @type {PlannerBundle[]|null} */
    this.latestBundles = null;
  }

  init() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  /** @param {PlannerStepData|null} plan */
  syncPlan(plan) {
    this.latestPlan = plan;
  }

  /** @param {PlannerBundle[]|null} bundles */
  syncBundles(bundles) {
    this.latestBundles = bundles;
  }

  buildPayload() {
    const fd = new FormData(this.form);
    /** @type {Record<string, unknown>} */
    const payload = {};
    fd.forEach((value, key) => {
      payload[key] = value;
    });

    if (this.latestPlan && Array.isArray(this.latestPlan.steps)) {
      payload.plan_steps = this.latestPlan.steps;
    }
    if (this.latestBundles) {
      payload.bundle_names = this.latestBundles.map((b) => b.name);
    }

    return payload;
  }

  /** @param {SubmitEvent} event */
  async handleSubmit(event) {
    event.preventDefault();
    if (this.loading) return;
    this.loading = true;

    this.results.innerHTML = '';
    this.results.appendChild(
      createEl('p', { textContent: EXP_DEFAULTS.TEXT.QUIZ_LOADING })
    );

    const payload = this.buildPayload();

    try {
      const endpoint = this.config.grokQuizEndpoint || EXP_DEFAULTS.API.GROK_QUIZ;
      /** @type {GrokQuizResponse} */
      const data = await jsonFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      this.renderResults(data);
      this.config.onEvent?.('grok_quiz_success', { payload, data });
    } catch (err) {
      console.error('[experience:grok_quiz] error', err);
      this.results.innerHTML = '';
      this.results.appendChild(
        createEl('p', { textContent: EXP_DEFAULTS.TEXT.QUIZ_ERROR })
      );
      this.config.onEvent?.('grok_quiz_error', err);
    } finally {
      this.loading = false;
    }
  }

  /** @param {GrokQuizResponse} data */
  renderResults(data) {
    this.results.innerHTML = '';
    const frag = document.createDocumentFragment();

    const items = Array.isArray(data.items) ? data.items : [];
    const videos = Array.isArray(data.videos) ? data.videos : [];

    if (items.length === 0 && videos.length === 0) {
      frag.appendChild(
        createEl('p', { textContent: EXP_DEFAULTS.TEXT.QUIZ_EMPTY })
      );
      this.results.appendChild(frag);
      return;
    }

    if (items.length > 0) {
      const heading = createEl('h3', {
        textContent: EXP_DEFAULTS.TEXT.QUIZ_HEADING_LIST,
        id: 'quiz-personalized-heading',
        tabIndex: -1
      });
      const ul = createEl('ul', { 'aria-labelledby': 'quiz-personalized-heading' });
      items.forEach((item) => {
        const strong = createEl('strong', {}, [item.title]);
        const parts = [strong];
        if (item.description) parts.push(' – ' + item.description);
        ul.appendChild(createEl('li', {}, parts));
      });
      frag.append(heading, ul);
    }

    if (videos.length > 0) {
      const heading = createEl('h3', {
        textContent: EXP_DEFAULTS.TEXT.QUIZ_HEADING_VIDEOS,
        id: 'quiz-videos-heading',
        tabIndex: -1
      });
      const ul = createEl('ul', { 'aria-labelledby': 'quiz-videos-heading' });
      videos.forEach((video) => {
        const link = createEl('a', {
          href: video.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          textContent: video.title
        });
        ul.appendChild(createEl('li', {}, [link]));
      });
      frag.append(heading, ul);
    }

    this.results.appendChild(frag);
  }
}

/* ========================================================================== */
/* Registry builder + share link                                              */
/* ========================================================================== */

/**
 * @typedef {Object} RegistryItem
 * @property {string} id
 * @property {string} name
 * @property {string} [note]
 * @property {string} [url]
 * @property {string|number} [sourceBundleId]
 */

class RegistryBuilder {
  /**
   * @param {HTMLElement} root
   * @param {ExperienceConfig} config
   */
  constructor(root, config) {
    this.root = root;
    this.config = config;
    /** @type {HTMLFormElement|null} */
    this.form = root.querySelector(EXP_DEFAULTS.SELECTORS.REGISTRY_FORM);
    /** @type {HTMLElement|null} */
    this.listEl = root.querySelector(EXP_DEFAULTS.SELECTORS.REGISTRY_LIST);
    /** @type {HTMLButtonElement|null} */
    this.shareBtn = root.querySelector(EXP_DEFAULTS.SELECTORS.REGISTRY_SHARE);
    /** @type {RegistryItem[]} */
    this.items = [];
  }

  init() {
    if (!this.form || !this.listEl || !this.shareBtn) return;
    this.load();
    this.render();

    this.form.addEventListener('submit', (e) => this.handleAdd(e));
    this.shareBtn.addEventListener('click', () => this.handleShare());
  }

  load() {
    try {
      const raw = localStorage.getItem(EXP_DEFAULTS.STORAGE.REGISTRY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) this.items = parsed;
    } catch (err) {
      console.error('[experience:registry] load error', err);
    }
  }

  save() {
    try {
      localStorage.setItem(EXP_DEFAULTS.STORAGE.REGISTRY, JSON.stringify(this.items));
    } catch (err) {
      console.error('[experience:registry] save error', err);
    }
  }

  /** @param {PlannerBundle[]|null} bundles */
  syncFromBundles(bundles) {
    if (!bundles || !bundles.length) return;
    if (this.items.length > 0) return; // don't overwrite user list

    bundles.forEach((b) => {
      this.items.push({
        id: `bundle-${b.id}`,
        name: b.name,
        note: b.description || b.price || '',
        url: b.href,
        sourceBundleId: b.id
      });
    });
    this.save();
    this.render();
  }

  /** @param {SubmitEvent} event */
  handleAdd(event) {
    event.preventDefault();
    const fd = new FormData(this.form);
    const name = String(fd.get('name') || '').trim();
    const note = String(fd.get('note') || '').trim();
    const url = String(fd.get('url') || '').trim();
    if (!name) return;

    const item = /** @type {RegistryItem} */ ({
      id: `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      note: note || undefined,
      url: url || undefined
    });

    this.items.push(item);
    this.save();
    this.form.reset();
    this.render();
    this.config.onEvent?.('registry_item_added', { item });
  }

  render() {
    this.listEl.innerHTML = '';
    if (this.items.length === 0) {
      this.listEl.textContent = EXP_DEFAULTS.TEXT.REGISTRY_EMPTY;
      return;
    }

    const ul = createEl('ul');
    this.items.forEach((item) => {
      const removeBtn = createEl(
        'button',
        {
          type: 'button',
          onclick: () => {
            this.items = this.items.filter((i) => i.id !== item.id);
            this.save();
            this.render();
            this.config.onEvent?.('registry_item_removed', { item });
          }
        },
        ['Remove']
      );

      /** @type {(Node|string)[]} */
      const content = [
        createEl('span', { className: EXP_DEFAULTS.CSS.REGISTRY_ITEM }, [
          createEl('strong', {}, [item.name])
        ])
      ];
      if (item.note) content.push(' – ' + item.note);
      if (item.url) {
        const link = createEl('a', {
          href: item.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          textContent: 'View'
        });
        content.push(' ', link);
      }
      content.push(' ', removeBtn);

      ul.appendChild(createEl('li', {}, content));
    });

    this.listEl.appendChild(ul);
  }

  async handleShare() {
    try {
      let shareUrl = '';

      if (this.config.registryShareEndpoint) {
        const res = await jsonFetch(this.config.registryShareEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: this.items })
        });
        // @ts-ignore
        shareUrl = String(res.url || '');
      }

      if (!shareUrl) {
        const encoded = encodeURIComponent(JSON.stringify(this.items));
        shareUrl = `${window.location.origin}${window.location.pathname}?registry=${encoded}`;
      }

      await navigator.clipboard?.writeText(shareUrl);
      alert(EXP_DEFAULTS.TEXT.REGISTRY_SHARE_OK);
      this.config.onEvent?.('registry_share', { url: shareUrl });
    } catch (err) {
      console.error('[experience:registry] share error', err);
      alert(EXP_DEFAULTS.TEXT.REGISTRY_SHARE_ERROR);
      this.config.onEvent?.('registry_share_error', err);
    }
  }
}

/* ========================================================================== */
/* Milestone tracker                                                          */
/* ========================================================================== */

/**
 * @typedef {Object} Milestone
 * @property {string} id
 * @property {string} label
 * @property {boolean} done
 */

class MilestoneTracker {
  /**
   * @param {HTMLElement} listEl
   * @param {HTMLButtonElement|null} addBtn
   * @param {ExperienceConfig} config
   */
  constructor(listEl, addBtn, config) {
    this.listEl = listEl;
    this.addBtn = addBtn;
    this.config = config;
    /** @type {Milestone[]} */
    this.milestones = [];
  }

  init() {
    this.load();
    this.render();
    if (this.addBtn) {
      this.addBtn.addEventListener('click', () => this.addMilestone());
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(EXP_DEFAULTS.STORAGE.MILESTONES);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) this.milestones = parsed;
    } catch (err) {
      console.error('[experience:milestones] load error', err);
    }
  }

  save() {
    try {
      localStorage.setItem(EXP_DEFAULTS.STORAGE.MILESTONES, JSON.stringify(this.milestones));
    } catch (err) {
      console.error('[experience:milestones] save error', err);
    }
  }

  /** @param {PlannerStepData|null} plan */
  syncFromPlan(plan) {
    if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) return;
    if (this.milestones.length > 0) return; // don't overwrite user’s milestones

    this.milestones = plan.steps.map((label, index) => ({
      id: `plan-${index + 1}`,
      label: label.trim(),
      done: false
    }));
    this.save();
    this.render();
  }

  render() {
    this.listEl.innerHTML = '';
    if (this.milestones.length === 0) {
      this.listEl.textContent = EXP_DEFAULTS.TEXT.MILESTONES_EMPTY;
      return;
    }

    this.milestones.forEach((m) => {
      const checkbox = createEl('input', {
        type: 'checkbox',
        checked: m.done,
        onchange: () => {
          m.done = !m.done;
          this.save();
          this.render();
          this.config.onEvent?.('milestone_toggled', { milestone: m });
        }
      });

      const labelEl = createEl('span', {
        className: m.done ? EXP_DEFAULTS.CSS.MILESTONE_DONE : ''
      }, [m.label]);

      this.listEl.appendChild(createEl('li', {}, [checkbox, ' ', labelEl]));
    });
  }

  addMilestone() {
    const label = window.prompt('Describe your new milestone:');
    if (!label) return;
    const m = /** @type {Milestone} */ ({
      id: `custom-${Date.now()}`,
      label: label.trim(),
      done: false
    });
    this.milestones.push(m);
    this.save();
    this.render();
    this.config.onEvent?.('milestone_added', { milestone: m });
  }
}

/* ========================================================================== */
/* Price alert subscriptions                                                  */
/* ========================================================================== */

class PriceAlerts {
  /**
   * @param {HTMLFormElement} form
   * @param {ExperienceConfig} config
   */
  constructor(form, config) {
    this.form = form;
    this.config = config;
    /** @type {HTMLElement|null} */
    this.statusEl = form.querySelector('[data-role="status"]');
    /** @type {PlannerBundle[]|null} */
    this.latestBundles = null;
  }

  init() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  /** @param {PlannerBundle[]|null} bundles */
  syncFromBundles(bundles) {
    this.latestBundles = bundles;
  }

  buildPayload() {
    const fd = new FormData(this.form);
    /** @type {Record<string, unknown>} */
    const payload = {};
    fd.forEach((value, key) => {
      payload[key] = value;
    });

    if (this.latestBundles) {
      payload.bundles = this.latestBundles.map((b) => ({
        id: b.id,
        name: b.name,
        price: b.price
      }));
    }

    return payload;
  }

  /** @param {SubmitEvent} event */
  async handleSubmit(event) {
    event.preventDefault();
    const payload = this.buildPayload();
    setStatusEl(this.statusEl, EXP_DEFAULTS.TEXT.PRICE_ALERT_LOADING, false);

    try {
      const endpoint = this.config.priceAlertEndpoint || EXP_DEFAULTS.API.PRICE_ALERT;
      await jsonFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setStatusEl(this.statusEl, EXP_DEFAULTS.TEXT.PRICE_ALERT_OK, false);
      this.form.reset();
      this.config.onEvent?.('price_alert_created', { payload });
    } catch (err) {
      console.error('[experience:price_alert] error', err);
      setStatusEl(this.statusEl, EXP_DEFAULTS.TEXT.PRICE_ALERT_ERROR, true);
      this.config.onEvent?.('price_alert_error', err);
    }
  }
}

/* ========================================================================== */
/* Review submission + photo upload                                           */
/* ========================================================================== */

class ReviewForm {
  /**
   * @param {HTMLFormElement} form
   * @param {ExperienceConfig} config
   */
  constructor(form, config) {
    this.form = form;
    this.config = config;
    /** @type {HTMLElement|null} */
    this.statusEl = form.querySelector('[data-role="status"]');
    /** @type {PlannerBundle[]|null} */
    this.latestBundles = null;
  }

  init() {
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  /** @param {PlannerBundle[]|null} bundles */
  syncFromBundles(bundles) {
    this.latestBundles = bundles;
  }

  /** @param {SubmitEvent} event */
  async handleSubmit(event) {
    event.preventDefault();
    const fd = new FormData(this.form);

    if (this.latestBundles && this.latestBundles.length) {
      fd.append('primary_bundle', String(this.latestBundles[0].id));
    }

    setStatusEl(this.statusEl, EXP_DEFAULTS.TEXT.REVIEW_LOADING, false);

    try {
      const endpoint = this.config.reviewEndpoint || EXP_DEFAULTS.API.REVIEW;
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatusEl(this.statusEl, EXP_DEFAULTS.TEXT.REVIEW_OK, false);
      this.form.reset();
      this.config.onEvent?.('review_submitted', {});
    } catch (err) {
      console.error('[experience:review] error', err);
      setStatusEl(this.statusEl, EXP_DEFAULTS.TEXT.REVIEW_ERROR, true);
      this.config.onEvent?.('review_error', err);
    }
  }
}

/* ========================================================================== */
/* AI live chat widget                                                        */
/* ========================================================================== */

class ChatWidget {
  /**
   * @param {HTMLElement} root
   * @param {ExperienceConfig} config
   */
  constructor(root, config) {
    this.root = root;
    this.config = config;
    /** @type {ChatMessage[]} */
    this.history = [];
    /** @type {PlannerStepData|null} */
    this.latestPlan = null;
    /** @type {PlannerBundle[]|null} */
    this.latestBundles = null;
    this.loading = false;
  }

  init() {
    this.renderLauncher();
  }

  /** @param {PlannerStepData|null} plan */
  syncPlan(plan) {
    this.latestPlan = plan;
  }

  /** @param {PlannerBundle[]|null} bundles */
  syncBundles(bundles) {
    this.latestBundles = bundles;
  }

  renderLauncher() {
    this.root.innerHTML = '';
    const btn = createEl(
      'button',
      {
        type: 'button',
        className: EXP_DEFAULTS.CSS.CHAT_TOGGLE,
        'aria-label': 'Open AI assistant chat'
      },
      ['Chat with AI']
    );
    btn.addEventListener('click', () => this.openChat());
    this.root.appendChild(btn);
  }

  openChat() {
    this.root.innerHTML = '';

    const container = createEl('div', { className: EXP_DEFAULTS.CSS.CHAT_CONTAINER });
    const header = createEl('div', { className: EXP_DEFAULTS.CSS.CHAT_HEADER });
    const title = createEl('span', {}, [EXP_DEFAULTS.TEXT.CHAT_TITLE]);
    const closeBtn = createEl(
      'button',
      {
        type: 'button',
        className: EXP_DEFAULTS.CSS.CHAT_CLOSE,
        'aria-label': 'Close chat'
      },
      ['×']
    );
    header.append(title, closeBtn);

    /** @type {HTMLElement} */
    const messagesEl = createEl('div', {
      className: EXP_DEFAULTS.CSS.CHAT_MESSAGES,
      role: 'log',
      'aria-live': 'polite'
    });

    const form = createEl('form', { className: 'chat-form' });
    const input = createEl('input', {
      type: 'text',
      name: 'message',
      placeholder: EXP_DEFAULTS.TEXT.CHAT_PLACEHOLDER,
      autocomplete: 'off',
      required: true
    });
    const sendBtn = createEl('button', { type: 'submit' }, ['Send']);
    form.append(input, sendBtn);

    container.append(header, messagesEl, form);
    this.root.appendChild(container);

    closeBtn.addEventListener('click', () => this.renderLauncher());

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const content = input.value.trim();
      if (!content || this.loading) return;
      input.value = '';
      this.appendMessage('user', content, messagesEl);
      this.sendMessage(content, messagesEl);
    });

    const initial = this.buildInitialContextMessage();
    if (initial) {
      this.appendMessage('assistant', initial, messagesEl);
    }
  }

  buildInitialContextMessage() {
    const lines = [];
    if (this.latestPlan && Array.isArray(this.latestPlan.steps) && this.latestPlan.steps.length) {
      lines.push('Here is your current plan:');
      this.latestPlan.steps.forEach((step) => {
        lines.push('• ' + step);
      });
    }
    if (this.latestBundles && this.latestBundles.length) {
      lines.push('');
      lines.push('Recommended bundles:');
      this.latestBundles.forEach((b) => lines.push(`• ${b.name}${b.price ? ` (${b.price})` : ''}`));
    }
    if (!lines.length) return '';
    return lines.join('\n');
  }

  /**
   * @param {ChatRole} role
   * @param {string} text
   * @param {HTMLElement} messagesEl
   */
  appendMessage(role, text, messagesEl) {
    const cls =
      role === 'user'
        ? EXP_DEFAULTS.CSS.CHAT_MESSAGE_USER
        : EXP_DEFAULTS.CSS.CHAT_MESSAGE_ASSISTANT;
    const bubble = createEl('div', { className: cls }, [text]);
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    this.history.push({ role, content: text });
  }

  /**
   * @param {string} text
   * @param {HTMLElement} messagesEl
   */
  async sendMessage(text, messagesEl) {
    this.loading = true;
    const thinking = createEl(
      'div',
      { className: EXP_DEFAULTS.CSS.CHAT_MESSAGE_ASSISTANT },
      [EXP_DEFAULTS.TEXT.CHAT_THINKING]
    );
    messagesEl.appendChild(thinking);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const endpoint = this.config.chatEndpoint || EXP_DEFAULTS.API.CHAT;
      /** @type {{reply: string}} */
      const data = await jsonFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: this.history,
          context: {
            plan: this.latestPlan,
            bundles: this.latestBundles
          }
        })
      });

      thinking.remove();
      this.appendMessage('assistant', data.reply || '(no response)', messagesEl);
      this.config.onEvent?.('chat_message', { history: this.history.slice() });
    } catch (err) {
      console.error('[experience:chat] error', err);
      thinking.remove();
      this.appendMessage('assistant', EXP_DEFAULTS.TEXT.CHAT_ERROR, messagesEl);
      this.config.onEvent?.('chat_error', err);
    } finally {
      this.loading = false;
    }
  }
}

/* ========================================================================== */
/* Daily self-evolution toggle                                                */
/* ========================================================================== */

class SelfEvolutionToggle {
  /**
   * @param {HTMLInputElement} checkbox
   * @param {ExperienceConfig} config
   */
  constructor(checkbox, config) {
    this.checkbox = checkbox;
    this.config = config;
  }

  init() {
    this.checkbox.addEventListener('change', () =>
      this.handleChange(this.checkbox.checked)
    );
  }

  /** @param {boolean} enabled */
  async handleChange(enabled) {
    try {
      const endpoint =
        this.config.selfEvolutionWebhookEndpoint ||
        EXP_DEFAULTS.API.SELF_EVOLUTION_WEBHOOK;

      await jsonFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });

      this.config.onEvent?.('self_evolution_toggle', { enabled });
    } catch (err) {
      console.error('[experience:self_evolution] error', err);
      alert(EXP_DEFAULTS.TEXT.SELF_EVOLUTION_ERROR);
      this.checkbox.checked = !enabled;
      this.config.onEvent?.('self_evolution_error', err);
    }
  }
}

/* ========================================================================== */
/* ExperienceApp – orchestrator                                               */
/* ========================================================================== */

class ExperienceApp {
  /** @param {ExperienceConfig} config */
  constructor(config) {
    this.config = config;

    /** @type {GrokQuiz|null} */
    this.grokQuiz = null;
    /** @type {RegistryBuilder|null} */
    this.registry = null;
    /** @type {MilestoneTracker|null} */
    this.milestones = null;
    /** @type {PriceAlerts|null} */
    this.priceAlerts = null;
    /** @type {ReviewForm|null} */
    this.reviewForm = null;
    /** @type {ChatWidget|null} */
    this.chat = null;
    /** @type {SelfEvolutionToggle|null} */
    this.selfEvolution = null;

    /** @type {PlannerStepData|null} */
    this.latestPlan = null;
    /** @type {PlannerBundle[]|null} */
    this.latestBundles = null;
  }

  init() {
    this.initFeatures();
    this.wirePlannerEvents(this.config.plannerApp);
    this.config.onEvent?.('experience_init', {});
  }

  initFeatures() {
    // Grok Quiz
    const quizForm = /** @type {HTMLFormElement|null} */ (
      document.querySelector(EXP_DEFAULTS.SELECTORS.QUIZ_FORM)
    );
    const quizResults = /** @type {HTMLElement|null} */ (
      document.querySelector(EXP_DEFAULTS.SELECTORS.QUIZ_RESULTS)
    );
    if (quizForm && quizResults) {
      this.grokQuiz = new GrokQuiz(quizForm, quizResults, this.config);
      this.grokQuiz.init();
    }

    // Registry
    const registryRoot = /** @type {HTMLElement|null} */ (
      document.querySelector(EXP_DEFAULTS.SELECTORS.REGISTRY_ROOT)
    );
    if (registryRoot) {
      this.registry = new RegistryBuilder(registryRoot, this.config);
      this.registry.init();
    }

    // Milestones
    const milestoneList = /** @type {HTMLElement|null} */ (
      document.querySelector(EXP_DEFAULTS.SELECTORS.MILESTONE_LIST)
    );
    const milestoneAdd = /** @type {HTMLButtonElement|null} */ (
      document.querySelector(EXP_DEFAULTS.SELECTORS.MILESTONE_ADD)
    );
    if (milestoneList) {
      this.milestones = new MilestoneTracker(milestoneList, milestoneAdd, this.config);
      this.milestones.init();
    }

    // Price alerts
    const priceAlertForm = /** @type {HTMLFormElement|null} */ (
      document.querySelector(EXP_DEFAULTS.SELECTORS.PRICE_ALERT_FORM)
    );
    if (priceAlertForm) {
      this.priceAlerts = new PriceAlerts(priceAlertForm, this.config);
      this.priceAlerts.init();
    }

    // Review form
    const reviewFormEl = /** @type {HTMLFormElement|null} */ (
      document.querySelector(EXP_DEFAULTS.SELECTORS.REVIEW_FORM)
    );
    if (reviewFormEl) {
      this.reviewForm = new ReviewForm(reviewFormEl, this.config);
      this.reviewForm.init();
    }

    // Chat widget
    const chatRoot = /** @type {HTMLElement|null} */ (
      document.querySelector(EXP_DEFAULTS.SELECTORS.CHAT_WIDGET)
    );
    if (chatRoot) {
      this.chat = new ChatWidget(chatRoot, this.config);
      this.chat.init();
    }

    // Self-evolution toggle
    const toggle = /** @type {HTMLInputElement|null} */ (
      document.querySelector(EXP_DEFAULTS.SELECTORS.SELF_EVOLUTION_TOGGLE)
    );
    if (toggle) {
      this.selfEvolution = new SelfEvolutionToggle(toggle, this.config);
      this.selfEvolution.init();
    }
  }

  /**
   * Wire into PlannerApp events by monkey-patching its onEvent.
   * @param {any|null} plannerApp
   */
  wirePlannerEvents(plannerApp) {
    if (!plannerApp || typeof plannerApp.onEvent !== 'function') return;

    const originalOnEvent = plannerApp.onEvent.bind(plannerApp);

    plannerApp.onEvent = (stage, detail) => {
      // Preserve any existing behavior
      originalOnEvent(stage, detail);
      // Fan-out to experience layer
      this.handlePlannerEvent(stage, detail);
    };
  }

  /**
   * Called from patched PlannerApp.onEvent.
   * @param {string} stage
   * @param {any} detail
   */
  handlePlannerEvent(stage, detail) {
    switch (stage) {
      case 'plan_success': {
        /** @type {PlannerStepData|null} */
        const plan = detail?.plan ?? null;
        this.latestPlan = plan;
        this.grokQuiz?.syncPlan(plan);
        this.milestones?.syncFromPlan(plan);
        this.chat?.syncPlan(plan);
        break;
      }
      case 'bundles_success': {
        /** @type {PlannerBundle[]|null} */
        const bundles = detail?.bundles ?? null;
        this.latestBundles = bundles;
        this.registry?.syncFromBundles(bundles);
        this.priceAlerts?.syncFromBundles(bundles);
        this.reviewForm?.syncFromBundles(bundles);
        this.chat?.syncBundles(bundles);
        break;
      }
      default:
        break;
    }

    this.config.onEvent?.('planner_event', { stage, detail });
  }
}

/* ========================================================================== */
/* Auto-bootstrap                                                             */
/* ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // PlannerApp is set in planner.js
  // @ts-ignore
  const plannerApp = window.__plannerApp || null;

  const exp = new ExperienceApp({
    plannerApp,
    // You can override endpoints here if needed:
    // grokQuizEndpoint: '/api/grok/quiz',
    // chatEndpoint: '/api/chat',
    // registryShareEndpoint: '/api/registry/share',
    // priceAlertEndpoint: '/api/alerts/price',
    // reviewEndpoint: '/api/reviews',
    // selfEvolutionWebhookEndpoint: '/api/webhooks/self-evolution',
    onEvent: (stage, detail) => {
      // Central analytics hook for the entire experience layer
      // e.g. window.gtag?.('event', 'experience_' + stage, { detail });
      // console.debug('[experience:event]', stage, detail);
    }
  });

  exp.init();

  // @ts-ignore
  window.__experienceApp = exp;
});