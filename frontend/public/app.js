document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('planner-form');
  const planSection = document.getElementById('plan-section');
  const bundlesSection = document.getElementById('bundles-section');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const age = document.getElementById('age').value;
    const concern = document.getElementById('concern').value;
    const email = document.getElementById('email').value;

    planSection.textContent = 'Loading your plan...';
    bundlesSection.textContent = '';

    try {
      const planRes = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age: parseInt(age), concern: concern, email: email || null })
      });
      const planData = await planRes.json();
      renderPlan(planData);

      const bundlesRes = await fetch('/api/bundles/like?concern=' + encodeURIComponent(concern));
      const bundles = await bundlesRes.json();
      renderBundles(bundles);
    } catch (err) {
      planSection.textContent = 'Something went wrong. Please try again later.';
    }
  });

  function renderPlan(planData) {
    planSection.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.textContent = 'Your Personalized Plan';
    planSection.appendChild(h2);
    const ul = document.createElement('ul');
    (planData.steps || []).forEach(function(step) {
      const li = document.createElement('li');
      li.textContent = step;
      ul.appendChild(li);
    });
    planSection.appendChild(ul);
    const disclaimer = document.createElement('p');
    disclaimer.textContent = 'This plan is general in nature and not medical advice. Always consult a qualified professional for specific concerns.';
    disclaimer.setAttribute('class', 'disclaimer');
    planSection.appendChild(disclaimer);
  }

  function renderBundles(bundles) {
    bundlesSection.innerHTML = '';
    if (bundles && bundles.length > 0) {
      const h2 = document.createElement('h2');
      h2.textContent = 'Recommended Deals';
      bundlesSection.appendChild(h2);
      bundles.forEach(function(bundle) {
        const div = document.createElement('div');
        div.className = 'bundle';
        const name = document.createElement('h3');
        name.textContent = bundle.name;
        const desc = document.createElement('p');
        desc.textContent = bundle.description;
        const price = document.createElement('p');
        price.textContent = 'Price: ' + bundle.price;
        const link = document.createElement('a');
        link.href = '/api/bundles/go/' + bundle.id;
        link.textContent = 'View deal';
        link.setAttribute('rel', 'noopener sponsored nofollow');
        link.setAttribute('target', '_blank');
        div.append(name, desc, price, link);
        bundlesSection.appendChild(div);
      });
    }
  }
});
