/* 2️⃣ JavaScript – put this in a separate file (e.g. `planner.js`) and load it with
 *    <script type="module" src="/js/planner.js"></script>
 */
document.addEventListener('DOMContentLoaded', () => {
  /* -------------------------------------------------------------------------- */
  /* Configuration – keep URLs in one place so they’re easy to change.          */
  const API = {
    PLAN: '/api/planner/plan',
    BUNDLES: (concern) => `/api/bundles?age=${encodeURIComponent(concern)}`
  };

  /* -------------------------------------------------------------------------- */
  /* Grab DOM elements – use `const` for immutability.                         */
  const form          = document.getElementById('planner-form');
  const planSection   = document.getElementById('plan-section');
  const bundlesSection= document.getElementById('bundles-section');
  const statusEl      = document.getElementById('status');   // <div id="status" aria-live="polite"></div>
  const spinner       = document.getElementById('spinner');

  /* -------------------------------------------------------------------------- */
  /* Utility helpers – keep them tiny and pure.                                 */
  const showSpinner = () => spinner.classList.remove('hidden');
  const hideSpinner = () => spinner.classList.add('hidden');

  const setStatus   = (msg, isError = false) => {
    statusEl.textContent  = msg;
    statusEl.className    = isError ? 'status error' : 'status ok';
  };

  const clearStatus = () => { statusEl.textContent = ''; statusEl.className = ''; };

  const disableForm = () => form.querySelector('button[type=submit]').disabled = true;
  const enableForm  = () => form.querySelector('button[type=submit]').disabled = false;

  /* -------------------------------------------------------------------------- */
  /* Main event handler – async/await keeps the flow linear.                    */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();

    /* Grab & validate input values */
    const age      = document.getElementById('age').value.trim();
    const concern  = document.getElementById('concern').value.trim();
    const email    = document.getElementById('email').value.trim();

    if (!age || !concern) {
      setStatus('Please fill in all required fields.', true);
      return;
    }

    /* UI feedback */
    disableForm();
    showSpinner();
    setStatus('Generating your plan…');

    /* ---------------------------------------------------------------------- */
    /* 1️⃣ Build the payload – email is optional, so we only include it if present */
    const payload = { age_months: Number(age), concern };
    if (email) payload.email = email;

    try {
      /* -------------------------------------------------------------------- */
      /* 2️⃣ POST to the planner endpoint – follow the pattern from citation #2 */
      const planRes = await fetch(API.PLAN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!planRes.ok) throw new Error(`Planner error (${planRes.status})`);
      const planData = await planRes.json();

      /* Render the plan */
      renderPlan(planData);

      /* -------------------------------------------------------------------- */
      /* 3️⃣ Fetch bundles – reuse the same query‑string logic from citation #2   */
      const bundlesRes = await fetch(API.BUNDLES(concern));
      if (!bundlesRes.ok) throw new Error(`Bundles error (${bundlesRes.status})`);
      const bundles = await bundlesRes.json();

      renderBundles(bundles);
      setStatus('All done! Enjoy your personalized plan.');
    } catch (err) {
      console.error(err);
      setStatus('Something went wrong. Please try again later.', true);
    } finally {
      /* Clean‑up UI */
      hideSpinner();
      enableForm();
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Rendering helpers – keep them pure so they’re easy to test.                */
  function renderPlan(planData) {
    planSection.innerHTML = ''; // clear old content

    const h2 = document.createElement('h2');
    h2.textContent = 'Your Personalized Plan';
    planSection.appendChild(h2);

    const ul = document.createElement('ul');
    (planData.steps ?? []).forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      ul.appendChild(li);
    });
    planSection.appendChild(ul);

    const disclaimer = document.createElement('p');
    disclaimer.textContent =
      'This plan is general in nature and not medical advice. Always consult a qualified professional for specific concerns.';
    disclaimer.className = 'disclaimer';
    planSection.appendChild(disclaimer);
  }

  function renderBundles(bundles) {
    bundlesSection.innerHTML = ''; // clear old content

    if (!bundles?.length) {
      const p = document.createElement('p');
      p.textContent = 'No bundles found for this concern.';
      bundlesSection.appendChild(p);
      return;
    }

    const h2 = document.createElement('h2');
    h2.textContent = 'Recommended Deals';
    bundlesSection.appendChild(h2);

    bundles.forEach(bundle => {
      const div = document.createElement('div');
      div.className = 'bundle';

      const name = document.createElement('h3');
      name.textContent = bundle.name;

      const desc = document.createElement('p');
      desc.textContent = bundle.description;

      const price = document.createElement('p');
      price.textContent = `Price: ${bundle.price}`;

      const link = document.createElement('a');
      link.href = `/api/bundles/go/${bundle.id}`;
      link.textContent = 'View deal';
      link.rel = 'noopener sponsored nofollow';
      link.target = '_blank';

      div.append(name, desc, price, link);
      bundlesSection.appendChild(div);
    });
  }
});
