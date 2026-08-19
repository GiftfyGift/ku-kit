const state = {
  lang: localStorage.getItem('kukit_lang') || 'en',
  route: (location.hash || '#home').replace('#', ''),
  content: null,
  searchIndex: []
};

const app = document.getElementById('app');
const langToggle = document.getElementById('lang-toggle');
const langMenu = document.getElementById('lang-menu');
const navButtons = document.querySelectorAll('nav.main-nav button');

function setLangDisplay(lang) {
  const opt = langMenu.querySelector(`[data-lang="${lang}"]`);
  if (!opt) return;
  langToggle.querySelector('.flag-icon').innerHTML = opt.querySelector('.flag-icon').innerHTML;
  langToggle.querySelector('.lang-switch-label').textContent = opt.querySelector('.lang-switch-option-label').textContent;
  langMenu.querySelectorAll('[role="option"]').forEach(o => o.setAttribute('aria-selected', String(o === opt)));
}

async function loadContent(lang) {
  const res = await fetch(`content/${lang}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load content/${lang}.json`);
  return res.json();
}

function setActiveNav(route) {
  navButtons.forEach(btn => {
    const btnRoute = btn.dataset.route;
    const isMatch = btnRoute === route ||
      (btnRoute.startsWith('product') && route.startsWith('product')) ||
      (btnRoute.startsWith('materials') && route.startsWith('materials'));
    btn.classList.toggle('active', isMatch);
  });
}

function navigate(route, anchor) {
  state.route = route;
  location.hash = route;
  setActiveNav(route);
  render();
  if (anchor) {
    requestAnimationFrame(() => {
      const el = document.getElementById(anchor);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderQuickLinkItem(item) {
  const clickable = item.route && item.anchor;
  const label = clickable
    ? `<button type="button" class="quick-link-btn" data-ql-route="${item.route}" data-ql-anchor="${item.anchor}">${item.label}</button>`
    : `<span class="quick-link-heading">${item.label}</span>`;
  const children = item.children && item.children.length
    ? `<ul class="quick-links-sub">${item.children.map(c => `<li>${renderQuickLinkItem(c)}</li>`).join('')}</ul>`
    : '';
  return `${label}${children}`;
}

function renderQuickLinks(list) {
  if (!list || !list.length) return '';
  return `<ul class="quick-links">${list.map(item => `<li>${renderQuickLinkItem(item)}</li>`).join('')}</ul>`;
}

function renderQuickLinksColumns(groups) {
  if (!groups || !groups.length) return '';
  const boxes = groups.map(g => `
    <div class="quick-links-box">
      <h4 class="quick-links-box-title">${g.label}</h4>
      <ul class="quick-links-sub">${(g.children || []).map(c => `<li>${renderQuickLinkItem(c)}</li>`).join('')}</ul>
    </div>
  `).join('');
  return `<div class="quick-links-columns">${boxes}</div>`;
}

function renderProductSelector(c, active) {
  const t = c.product.tabs;
  const card = (key, label, img, alt) => `
    <button type="button" class="product-select-card ${active === key ? 'active' : ''}" data-subnav="product-${key}">
      <span class="product-select-icon"><img src="${img}" alt="${alt}"></span>
      <span class="product-select-label">${label}</span>
      <span class="product-select-check" aria-hidden="true">✓</span>
    </button>
  `;
  return `
    <div class="product-selector">
      ${card('engine', t.engine, c.product.engine.image.src, c.product.engine.image.alt)}
      ${card('tiller', t.tiller, c.product.tiller.image.src, c.product.tiller.image.alt)}
    </div>
  `;
}

function renderVideoGrid(videos) {
  if (!videos || !videos.length) return '';
  const items = videos.map(v => {
    if (!v.href) {
      return `
        <div class="video-card">
          <div class="video-note">🎬 ${v.title}${v.note ? ' — ' + v.note : ''}</div>
        </div>
      `;
    }
    const src = encodeURI(v.href);
    return `
      <div class="video-card">
        <video class="kk-video" controls preload="metadata" src="${src}"></video>
        <div class="video-caption">${v.title}${v.lang ? ` <span class="res-tag">${v.lang}</span>` : ''}</div>
      </div>
    `;
  }).join('');
  return `<div class="video-grid">${items}</div>`;
}

function splitResources(resources) {
  const videos = (resources || []).filter(r => r.type === 'video');
  const docs = (resources || []).filter(r => r.type !== 'video');
  return { videos, docs };
}

function renderResourceList(resources) {
  if (!resources || !resources.length) return '';
  const items = resources.map(r => {
    const tag = r.lang ? `<span class="res-tag">${r.lang}</span>` : '';
    if (r.href) {
      return `
        <a class="resource-item" href="${r.href}" target="_blank" rel="noopener">
          <span class="res-icon">${resIcon(r.type)}</span>
          <span class="res-title">${r.title}</span>
          ${tag}
        </a>
      `;
    }
    return `
      <div class="resource-item resource-item--nolink">
        <span class="res-icon">${resIcon(r.type)}</span>
        <span class="res-title">${r.title}</span>
        ${tag}
      </div>
    `;
  }).join('');
  return `<div class="resource-list">${items}</div>`;
}

function resIcon(type) {
  switch (type) {
    case 'pdf': return '📄';
    case 'pptx': return '📊';
    case 'xlsx': return '📑';
    case 'docx': return '📝';
    case 'video': return '🎬';
    case 'jpg': case 'png': case 'image': return '🖼️';
    default: return '📁';
  }
}

function renderHome(c) {
  const cards = c.home.cards.map(card => `
    <div class="card" data-target="${card.target}">
      <div class="icon">${card.icon}</div>
      <h3>${card.title}</h3>
      <p>${card.desc}</p>
    </div>
  `).join('');

  const introTitle = c.home.introTitle.replace(
    /KU-KIT/g,
    '<img src="assets/img/logo.png" alt="KU-KIT" class="title-logo">'
  );

  return `
    <section>
      <h2 class="section-title">${introTitle}</h2>
      <p class="section-intro">${c.home.introText}</p>
      <div class="card-grid">${cards}</div>
    </section>
  `;
}

function renderProductCategory(cat, id) {
  const items = cat.items.map(item => {
    const specs = item.specs.map(s => `<tr><td>${s.label}</td><td>${s.value}</td></tr>`).join('');
    return `
      <div class="product-card">
        <div class="product-card-header">
          <h4>${item.name}</h4>
        </div>
        <div class="product-card-body">
          <p class="desc">${item.desc}</p>
          <table class="spec-table"><tbody>${specs}</tbody></table>
        </div>
      </div>
    `;
  }).join('');
  const catNote = cat.note ? `<div class="note-callout">${cat.note}</div>` : '';
  const catImage = cat.image ? `
    <figure class="category-photo">
      <img src="${cat.image.src}" alt="${cat.image.alt}">
      <figcaption>${cat.image.alt}</figcaption>
    </figure>
  ` : '';
  return `
    <div class="category-block"${id ? ` id="${id}"` : ''}>
      ${catImage}
      <div class="product-grid">${items}</div>
      ${catNote}
    </div>
  `;
}

function renderCheckPhotoList(points) {
  return `
    <ol class="check-photo-list">
      ${points.map((pt, idx) => {
        const text = typeof pt === 'string' ? pt : pt.text;
        const img = typeof pt === 'string' ? null : pt.image;
        return `
          <li>
            <span class="check-photo-num">${idx + 1}</span>
            <span class="check-photo-text">${text}</span>
            ${img ? `<img class="check-photo-thumb" src="${img.src}" alt="${img.alt}">` : ''}
          </li>
        `;
      }).join('')}
    </ol>
  `;
}

function renderApplicationExamples(app, id) {
  if (!app) return '';
  const images = app.images.map(img => `
    <figure class="application-photo">
      <img src="${img.src}" alt="${img.alt}">
    </figure>
  `).join('');
  return `
    <div class="category-block"${id ? ` id="${id}"` : ''}>
      <h3 class="category-heading">${app.title}</h3>
      ${app.intro ? `<p class="section-intro">${app.intro}</p>` : ''}
      <div class="application-gallery">${images}</div>
    </div>
  `;
}

function renderAuthenticityBlock(auth, id) {
  if (!auth) return '';
  return `
    <div class="category-block"${id ? ` id="${id}"` : ''}>
      <h3 class="category-heading">${auth.title}</h3>
      ${auth.intro ? `<p class="section-intro">${auth.intro}</p>` : ''}
      ${renderCheckPhotoList(auth.points)}
    </div>
  `;
}

function renderProductResources(p, downloadsId) {
  const { videos, docs } = splitResources(p.resources);
  const videoBlock = videos.length ? `
    <div class="category-block">
      <h3 class="category-heading">${p.videosTitle}</h3>
      ${renderVideoGrid(videos)}
    </div>
  ` : '';
  const resources = docs.length ? `
    <div class="category-block"${downloadsId ? ` id="${downloadsId}"` : ''}>
      <h3 class="category-heading">${p.downloadsTitle}</h3>
      ${renderResourceList(docs)}
    </div>
  ` : '';
  return videoBlock + resources;
}

function renderProductEngine(c) {
  const p = c.product;
  const e = p.engine;

  const sellingPoints = e.sellingPoints ? `
    <div class="category-block">
      <h3 class="category-heading">${e.sellingPoints.title}</h3>
      <div class="highlight-grid">
        ${e.sellingPoints.items.map(i => `
          <div class="highlight-card ${i.image ? 'highlight-card--photo' : ''}">
            ${i.image ? `<img src="${i.image.src}" alt="${i.image.alt}">` : ''}
            <div class="highlight-card-body">
              <h4>${i.title}</h4>
              <p>${i.desc}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  return `
    <section>
      <h2 class="section-title">${p.title}</h2>
      <p class="section-intro">${p.intro}</p>
      ${renderProductSelector(c, 'engine')}
      ${renderQuickLinks(e.quickLinks)}
      <h3 class="category-heading">${e.title}</h3>
      ${renderProductCategory(e, 'engine-product-info')}
      ${sellingPoints}
      ${renderApplicationExamples(e.applicationExamples, 'engine-application')}
      ${renderAuthenticityBlock(e.authenticity, 'engine-authenticity')}
      ${renderProductResources(e, 'engine-downloads')}
      <div class="note-callout">${e.note}</div>
    </section>
  `;
}

function renderProductTiller(c) {
  const p = c.product;
  const t = p.tiller;

  return `
    <section>
      <h2 class="section-title">${p.title}</h2>
      <p class="section-intro">${p.intro}</p>
      ${renderProductSelector(c, 'tiller')}
      ${renderQuickLinks(t.quickLinks)}
      <h3 class="category-heading">${t.title}</h3>
      ${renderProductCategory(t, 'tiller-product-info')}
      ${renderApplicationExamples(t.applicationExamples, 'tiller-application')}
      ${renderAuthenticityBlock(t.authenticity, 'tiller-authenticity')}
      ${renderProductResources(t, 'tiller-downloads')}
      <div class="note-callout">${t.note}</div>
    </section>
  `;
}

function renderProductAssembly(c) {
  const p = c.product;
  const a = p.assembly;

  return `
    <section>
      <h2 class="section-title">${p.title}</h2>
      <p class="section-intro">${p.intro}</p>
      ${renderProductSelector(c, null)}
      <div class="category-block">
        <h3 class="category-heading">${a.title}</h3>
        <p class="section-intro">${a.intro}</p>
        <div class="genuine-grid">
          <div class="genuine-card" id="assembly-tiller">
            <h4>1. ${a.tillerTitle}</h4>
            <ol class="check-list">${a.tillerSteps.map(s => `<li>${s}</li>`).join('')}</ol>
          </div>
          <div class="genuine-card" id="assembly-engine">
            <h4>2. ${a.engineTitle}</h4>
            <ol class="check-list">${a.engineSteps.map(s => `<li>${s}</li>`).join('')}</ol>
          </div>
        </div>
      </div>
      ${renderProductResources(a)}
      <div class="note-callout">${a.note}</div>
    </section>
  `;
}

function renderParts(c) {
  const pt = c.parts;

  const steps = pt.howToOrder.map(s => `
    <div class="step-card">
      <div class="step-number">${s.step}</div>
      <h4>${s.title}</h4>
      <p>${s.desc}</p>
    </div>
  `).join('');

  const recommended = (pt.recommended || []).map(model => `
    <div class="category-block">
      <h3 class="category-heading">${model.model}</h3>
      ${model.groups.map(g => `
        <h4 class="subsection-title">${g.label}</h4>
        <table class="kubota-table parts-table">
          <tbody>
            ${g.items.map(i => `<tr><td class="code-col">${i.code}</td><td>${i.name}</td></tr>`).join('')}
          </tbody>
        </table>
      `).join('')}
    </div>
  `).join('');

  const cats = pt.categories.map(cat => `
    <div class="item">
      <h4>${cat.name}</h4>
      <p>${cat.desc}</p>
    </div>
  `).join('');

  const resources = pt.resources ? `
    <div class="category-block">
      <h3 class="category-heading">${pt.downloadsTitle}</h3>
      ${renderResourceList(pt.resources)}
    </div>
  ` : '';

  return `
    <section>
      <h2 class="section-title">${pt.title}</h2>
      <p class="section-intro">${pt.intro}</p>
      <div class="steps">${steps}</div>
      ${recommended}
      <div class="simple-list">${cats}</div>
      ${resources}
      <div class="note-callout">${pt.note}</div>
    </section>
  `;
}

function renderService(c) {
  const s = c.service;

  const preDelivery = s.preDelivery ? `
    <div class="category-block" id="service-pre-delivery">
      <h3 class="category-heading">${s.preDelivery.title}</h3>
      <p class="section-intro">${s.preDelivery.intro}</p>
      <div class="check-points">
        ${s.preDelivery.points.map(pt => `
          <div class="check-point-card ${pt.image ? 'check-point-card--photo' : ''}">
            ${pt.image ? `<img class="check-point-photo" src="${pt.image.src}" alt="${pt.image.alt}">` : ''}
            <div class="check-point-card-body">
              <h4>${pt.title}</h4>
              <p class="desc">${pt.desc}</p>
              <ul>${pt.steps.map(st => `<li>${st}</li>`).join('')}</ul>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const startProcedure = s.startProcedure ? `
    <div class="category-block" id="service-start-procedure">
      <h3 class="category-heading">${s.startProcedure.title}</h3>
      <ol class="check-list">${s.startProcedure.steps.map(st => `<li>${st}</li>`).join('')}</ol>
      <div class="note-callout">${s.startProcedure.caution.join(' ')}</div>
    </div>
  ` : '';

  const renderMaintenancePoints = (pts, idPrefix) => pts.map((pt, idx) => `
    <div class="check-point-card" id="${idPrefix}-${idx}">
      <h4>${pt.title}</h4>
      <p class="desc">${pt.desc}</p>
      <ul>${pt.steps.map(st => `<li>${st}</li>`).join('')}</ul>
    </div>
  `).join('');

  const maintenance = s.maintenance ? `
    <div class="category-block">
      <h3 class="category-heading">${s.maintenance.title}</h3>
      <p class="section-intro">${s.maintenance.intro}</p>
      <h4 class="subsection-title">${s.maintenance.engine.title}</h4>
      <div class="check-points">${renderMaintenancePoints(s.maintenance.engine.points, 'maintenance-engine')}</div>
      <h4 class="subsection-title">${s.maintenance.tiller.title}</h4>
      <div class="check-points">${renderMaintenancePoints(s.maintenance.tiller.points, 'maintenance-tiller')}</div>
    </div>
  ` : '';

  const programs = s.programs.map(p => `
    <div class="program-card">
      <h4>${p.name}</h4>
      <p>${p.desc}</p>
    </div>
  `).join('');

  const { videos, docs } = splitResources(s.resources);
  const videoBlock = videos.length ? `
    <div class="category-block">
      <h3 class="category-heading">${s.videosTitle}</h3>
      ${renderVideoGrid(videos)}
    </div>
  ` : '';
  const resources = docs.length ? `
    <div class="category-block">
      <h3 class="category-heading">${s.downloadsTitle}</h3>
      ${renderResourceList(docs)}
    </div>
  ` : '';

  return `
    <section>
      <h2 class="section-title">${s.title}</h2>
      <p class="section-intro">${s.intro}</p>
      ${renderQuickLinksColumns(s.quickLinks)}
      ${preDelivery}
      ${startProcedure}
      ${maintenance}
      ${videoBlock}
      <div class="category-block">
        <h3 class="category-heading">${s.programsTitle} ${c.meta.sampleBadge ? `<span class="sample-badge">${c.meta.sampleBadge}</span>` : ''}</h3>
        <div class="program-grid">${programs}</div>
      </div>
      ${resources}
      <div class="note-callout">${s.note}</div>
    </section>
  `;
}

function renderCrops(c) {
  const cr = c.crops;

  const renderSolutionCard = sol => {
    const videoHtml = sol.video && sol.video.href
      ? `<video class="kk-video" controls preload="metadata" src="${encodeURI(sol.video.href)}"></video>`
      : `<div class="video-note">🎬 ${sol.video ? sol.video.title : ''}${sol.video && sol.video.note ? ' — ' + sol.video.note : ''}</div>`;
    return `
      <div class="product-card"${sol.id ? ` id="${sol.id}"` : ''}>
        <div class="product-card-header"><h4>${sol.name}</h4></div>
        <div class="product-card-body">
          <p class="desc">${sol.desc}</p>
          ${videoHtml}
        </div>
      </div>
    `;
  };

  const groups = [];
  const groupIndex = {};
  const ungrouped = [];
  cr.solutions.forEach(sol => {
    if (sol.groupId) {
      if (!(sol.groupId in groupIndex)) {
        groupIndex[sol.groupId] = groups.length;
        groups.push({ id: sol.groupId, name: sol.group, items: [] });
      }
      groups[groupIndex[sol.groupId]].items.push(sol);
    } else {
      ungrouped.push(sol);
    }
  });

  const groupBlocks = groups.map(g => `
    <div class="category-block" id="${g.id}">
      <h3 class="category-heading">${g.name}</h3>
      <div class="product-grid">${g.items.map(renderSolutionCard).join('')}</div>
    </div>
  `).join('');

  const ungroupedGrid = ungrouped.length ? `<div class="product-grid">${ungrouped.map(renderSolutionCard).join('')}</div>` : '';

  return `
    <section>
      <h2 class="section-title">${cr.title}</h2>
      <p class="section-intro">${cr.intro}</p>
      ${renderQuickLinks(cr.quickLinks)}
      ${groupBlocks}
      ${ungroupedGrid}
      <div class="note-callout">${cr.note}</div>
    </section>
  `;
}

function renderActivityComparison(cmp) {
  if (!cmp) return '';
  const activityPhotoSets = [
    [
      'assets/img/activity-kfd-1.png',
      'assets/img/activity-kfd-2.png',
      'assets/img/activity-kfd-3.png',
      'assets/img/activity-kfd-4.png'
    ],
    [
      'assets/img/activity-demo-1.png',
      'assets/img/activity-demo-2.png',
      'assets/img/activity-demo-3.png',
      'assets/img/activity-demo-4.png'
    ]
  ];

  const headCells = cmp.activities.map((a, i) => {
    const photos = activityPhotoSets[i];
    const carousel = photos ? `
      <div class="activity-cmp-carousel" aria-hidden="true">
        <div class="activity-cmp-carousel-track">
          ${[...photos, photos[0]].map((src, photoIndex) =>
            `<img src="${src}" alt="" loading="${photoIndex === 0 ? 'eager' : 'lazy'}">`
          ).join('')}
        </div>
      </div>
    ` : '';
    return `
      <div class="activity-cmp-head activity-cmp-accent-${i % 4} ${photos ? 'activity-cmp-head--carousel' : ''}">
        ${carousel || `<span class="activity-cmp-head-icon">${a.icon}</span>`}
        <span class="activity-cmp-head-name">${a.name}</span>
      </div>
    `;
  }).join('');

  const bodyRows = cmp.criteria.map(cr => {
    const labelCell = `
      <div class="activity-cmp-label">
        <span class="activity-cmp-label-icon">${cr.icon}</span>
        <span>${cr.label}</span>
      </div>
    `;
    const dataCells = cmp.activities.map((a, i) => {
      const val = a[cr.key];
      const content = Array.isArray(val)
        ? `<ul class="activity-cmp-list">${val.map(v => `<li>${v}</li>`).join('')}</ul>`
        : `<p>${val}</p>`;
      return `<div class="activity-cmp-cell activity-cmp-accent-${i % 4}">${content}</div>`;
    }).join('');
    return labelCell + dataCells;
  }).join('');

  return `
    <div class="category-block">
      <h3 class="category-heading">${cmp.title}</h3>
      ${cmp.intro ? `<p class="section-intro">${cmp.intro}</p>` : ''}
      <div class="activity-cmp-scroll">
        <div class="activity-cmp-grid">
          <div class="activity-cmp-corner"></div>
          ${headCells}
          ${bodyRows}
        </div>
      </div>
    </div>
  `;
}

function renderActivityPicker(m) {
  if (!m.activityComparison || !m.activityComparison.activities) return '';
  const acts = m.activityComparison.activities;
  const boxes = acts.map((a, i) => `
    <button type="button" class="activity-pick-box activity-cmp-accent-${i % 4}" data-ql-route="marketing" data-ql-anchor="activity-${i}">
      <span class="activity-pick-number">${i + 1}</span>
      <span class="activity-pick-icon">${a.icon}</span>
      <span class="activity-pick-name">${a.name}</span>
    </button>
  `).join('');
  return `
    <div class="category-block">
      <h3 class="category-heading">${m.quickSelectTitle}</h3>
      <div class="activity-pick-grid">${boxes}</div>
    </div>
  `;
}

function renderMarketing(c) {
  const m = c.marketing;
  const lbl = m.labels;

  const activities = m.activities.map((a, idx) => {
    const { videos, docs } = splitResources(a.resources);
    return `
      <div class="category-block" id="activity-${idx}">
        <h3 class="category-heading">${a.name}</h3>
        <p class="section-intro">${a.purpose}</p>
        <div class="highlight-grid">
          <div class="highlight-card"><h4>${lbl.minParticipants}</h4><p>${a.minParticipants}</p></div>
          <div class="highlight-card"><h4>${lbl.duration}</h4><p>${a.duration}</p></div>
          <div class="highlight-card"><h4>${lbl.venue}</h4><p>${a.venue}</p></div>
        </div>
        <h4 class="subsection-title">${lbl.target}</h4>
        <ul class="check-list">${a.target.map(t => `<li>${t}</li>`).join('')}</ul>
        <h4 class="subsection-title">${lbl.basic}</h4>
        <ul class="check-list">${a.basicActivities.map(t => `<li>${t}</li>`).join('')}</ul>
        <h4 class="subsection-title">${lbl.optional}</h4>
        <ul class="check-list">${a.optionalActivities.map(t => `<li>${t}</li>`).join('')}</ul>
        <h4 class="subsection-title">${lbl.schedule}</h4>
        <table class="kubota-table parts-table"><tbody>
          ${a.schedule.map(s => `<tr><td class="code-col">${s.time}</td><td>${s.activity}</td></tr>`).join('')}
        </tbody></table>
        <h4 class="subsection-title">${lbl.checklist}</h4>
        <ul class="check-list">${a.checklist.map(t => `<li>${t}</li>`).join('')}</ul>
        <div class="note-callout">${a.tip}</div>
        ${docs.length ? renderResourceList(docs) : ''}
      </div>
    `;
  }).join('');

  const upcomingEvents = m.upcomingEvents ? `
    <div class="category-block">
      <h3 class="category-heading">${m.upcomingEvents.title}</h3>
      <p class="section-intro">${m.upcomingEvents.intro}</p>
      <div class="event-list">
        ${m.upcomingEvents.items.map(e => `
          <div class="event-card">
            <div class="event-date">${e.date}</div>
            <div>
              <h4>${e.name}</h4>
              <div class="loc">${e.location}</div>
              <p class="desc">${e.desc}</p>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="note-callout">${m.upcomingEvents.note}</div>
    </div>
  ` : '';

  const { videos, docs } = splitResources(m.resources);
  const videoBlock = videos.length ? `
    <div class="category-block">
      <h3 class="category-heading">${m.videosTitle}</h3>
      ${renderVideoGrid(videos)}
    </div>
  ` : '';
  const resources = docs.length ? `
    <div class="category-block">
      <h3 class="category-heading">${m.downloadsTitle}</h3>
      ${renderResourceList(docs)}
    </div>
  ` : '';

  return `
    <section>
      <h2 class="section-title">${m.title}</h2>
      <p class="section-intro">${m.intro}</p>
      ${renderActivityComparison(m.activityComparison)}
      ${renderActivityPicker(m)}
      ${activities}
      ${upcomingEvents}
      ${videoBlock}
      ${resources}
      <div class="note-callout">${m.note}</div>
    </section>
  `;
}

function renderMaterialsSelector(c, active) {
  const t = c.materials.tabs;
  const card = (key, label, icon) => `
    <button type="button" class="product-select-card ${active === key ? 'active' : ''}" data-subnav="materials-${key}">
      <span class="product-select-icon"><span class="product-select-icon-emoji">${icon}</span></span>
      <span class="product-select-label">${label}</span>
      <span class="product-select-check" aria-hidden="true">✓</span>
    </button>
  `;
  return `
    <div class="product-selector">
      ${card('company', t.company, '🏢')}
      ${card('custom', t.custom, '🎨')}
    </div>
  `;
}

function renderMaterialsGroup(group) {
  const cards = group.items.map(item => `
    <button type="button" class="materials-card" data-lightbox-src="${item.image.src}" data-lightbox-alt="${item.image.alt}" data-lightbox-caption="${item.title}">
      <span class="materials-card-img-wrap">
        <img src="${item.image.src}" alt="${item.image.alt}" loading="lazy">
      </span>
      <span class="materials-card-title">${item.title}</span>
      <span class="materials-card-tag">${item.format}</span>
    </button>
  `).join('');
  return `
    <div class="category-block">
      <h3 class="category-heading materials-group-heading">
        <span class="materials-group-icon" aria-hidden="true">${group.icon}</span>
        ${group.title}
      </h3>
      <p class="section-intro">${group.intro}</p>
      <div class="materials-card-grid">${cards}</div>
    </div>
  `;
}

function renderMaterialsCompany(c) {
  const m = c.materials;
  const mc = m.company;
  const groups = (mc.groups || []).map(renderMaterialsGroup).join('');
  return `
    <section>
      <h2 class="section-title">${m.title}</h2>
      <p class="section-intro">${m.intro}</p>
      ${renderMaterialsSelector(c, 'company')}
      <p class="section-intro">${mc.intro}</p>
      ${groups}
      <div class="note-callout">${mc.note}</div>
    </section>
  `;
}

function renderMaterialsCustom(c) {
  const m = c.materials;
  return `
    <section>
      <h2 class="section-title">${m.title}</h2>
      <p class="section-intro">${m.intro}</p>
      ${renderMaterialsSelector(c, 'custom')}
      ${renderArtworkBody(c)}
    </section>
  `;
}

function renderArtworkBody(c) {
  const a = c.artwork;
  return `
      <div class="artwork-layout">
        <div class="artwork-form">
          <h3>${a.formTitle}</h3>
          <label class="artwork-field">
            <span>${a.sizeLabel}</span>
            <select id="aw-size">
              <option value="banner">${a.sizes.banner}</option>
              <option value="standee">${a.sizes.standee}</option>
            </select>
          </label>
          <label class="artwork-field">
            <span>${a.bgStyleLabel}</span>
            <select id="aw-bgstyle">
              <option value="diagonal">${a.bgStyles.diagonal}</option>
              <option value="dark">${a.bgStyles.dark}</option>
              <option value="frame">${a.bgStyles.frame}</option>
            </select>
          </label>
          <label class="artwork-field">
            <span>${a.productLabel}</span>
            <select id="aw-product">
              <option value="engine">${a.products.engine}</option>
              <option value="tiller">${a.products.tiller}</option>
              <option value="both">${a.products.both}</option>
            </select>
          </label>
          <label class="artwork-field">
            <span>${a.shopNameLabel}</span>
            <input type="text" id="aw-shopname" placeholder="${a.shopNamePlaceholder}" maxlength="60">
          </label>
          <label class="artwork-field">
            <span>${a.contactLabel}</span>
            <textarea id="aw-contact" rows="2" placeholder="${a.contactPlaceholder}" maxlength="160"></textarea>
          </label>
          <label class="artwork-field">
            <span>${a.headlineLabel}</span>
            <input type="text" id="aw-headline" placeholder="${a.headlinePlaceholder}" maxlength="60">
          </label>
          <label class="artwork-field">
            <span>${a.subheadlineLabel}</span>
            <input type="text" id="aw-subheadline" placeholder="${a.subheadlinePlaceholder}" maxlength="80">
          </label>
          <label class="artwork-field">
            <span>${a.bodyLabel}</span>
            <textarea id="aw-body" rows="2" placeholder="${a.bodyPlaceholder}" maxlength="160"></textarea>
          </label>
          <div class="artwork-field">
            <span>${a.decorations.label}</span>
            <div class="artwork-decor-grid">
              <button type="button" class="artwork-decor-btn" id="aw-decor-man" aria-pressed="false">
                <img src="assets/img/artwork/decor-farmer-thumbsup.png" alt="${a.decorations.manAlt}">
                <span>${a.decorations.man}</span>
                <span class="artwork-decor-check" aria-hidden="true">✓</span>
              </button>
              <button type="button" class="artwork-decor-btn" id="aw-decor-no1" aria-pressed="false">
                <img src="assets/img/artwork/decor-no1-badge.png" alt="${a.decorations.no1Alt}">
                <span>${a.decorations.no1}</span>
                <span class="artwork-decor-check" aria-hidden="true">✓</span>
              </button>
            </div>
            <div class="artwork-decor-sizes">
              <label class="artwork-decor-size-row">
                <span>${a.decorations.man} — ${a.decorations.sizeLabel}</span>
                <input type="range" id="aw-decor-man-size" min="60" max="160" value="100" step="5">
              </label>
              <label class="artwork-decor-size-row">
                <span>${a.decorations.no1} — ${a.decorations.sizeLabel}</span>
                <input type="range" id="aw-decor-no1-size" min="60" max="160" value="100" step="5">
              </label>
            </div>
          </div>
          <button type="button" id="aw-download" class="btn-primary artwork-download-btn">${a.downloadButton}</button>
          <p class="artwork-resolution-note" id="aw-resolution-note"></p>
        </div>
        <div class="artwork-preview">
          <h3>${a.previewTitle}</h3>
          <div class="artwork-canvas-wrap">
            <canvas id="aw-canvas"></canvas>
          </div>
        </div>
      </div>
      <div class="note-callout">${a.note}</div>
  `;
}

function renderArtwork(c) {
  const a = c.artwork;
  return `
    <section class="artwork-page">
      <h2 class="section-title">${a.title}</h2>
      <p class="section-intro">${a.intro}</p>
      ${renderArtworkBody(c)}
    </section>
  `;
}

const ARTWORK_SIZES = {
  banner: { wCm: 300, hCm: 100 },
  standee: { wCm: 80, hCm: 160 }
};

const artworkImageCache = {};
function loadArtworkImage(src) {
  if (!artworkImageCache[src]) {
    artworkImageCache[src] = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        // Don't leave a rejected promise cached — a single transient network
        // hiccup would otherwise permanently break every future redraw of this
        // image for the rest of the session (dealers may be on flaky mobile data).
        delete artworkImageCache[src];
        reject(new Error(`Failed to load image: ${src}`));
      };
      img.src = src;
    });
  }
  return artworkImageCache[src];
}

function computePreviewPixels(wCm, hCm) {
  const LONG_SIDE = 900;
  const scale = LONG_SIDE / Math.max(wCm, hCm);
  return { pxW: Math.round(wCm * scale), pxH: Math.round(hCm * scale) };
}

function computePrintPixels(wCm, hCm) {
  const TARGET_DPI = 150;
  const MAX_PIXELS = 20000000;
  const MAX_DIM = 15000;
  let dpi = TARGET_DPI;
  let pxW = Math.round(wCm / 2.54 * dpi);
  let pxH = Math.round(hCm / 2.54 * dpi);
  if (pxW * pxH > MAX_PIXELS) {
    dpi *= Math.sqrt(MAX_PIXELS / (pxW * pxH));
    pxW = Math.round(wCm / 2.54 * dpi);
    pxH = Math.round(hCm / 2.54 * dpi);
  }
  if (Math.max(pxW, pxH) > MAX_DIM) {
    dpi *= MAX_DIM / Math.max(pxW, pxH);
    pxW = Math.round(wCm / 2.54 * dpi);
    pxH = Math.round(hCm / 2.54 * dpi);
  }
  return { pxW, pxH, dpi: Math.round(dpi) };
}

function awRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function awDrawImageContain(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function awWrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  const lines = [];
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function awWrapText(ctx, text, x, y, maxWidth, lineHeight, align) {
  const lines = awWrapLines(ctx, text, maxWidth);
  ctx.textAlign = align || 'left';
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

function awPaintBackground(ctx, pxW, pxH, isLandscape, bgStyle, pad, logoH) {
  if (bgStyle === 'dark') {
    ctx.fillStyle = (() => {
      const g = ctx.createLinearGradient(0, 0, isLandscape ? pxW : 0, isLandscape ? 0 : pxH);
      g.addColorStop(0, '#0e3338');
      g.addColorStop(1, '#081416');
      return g;
    })();
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.fillStyle = (() => {
      const g = ctx.createLinearGradient(0, pxH, pxW, 0);
      g.addColorStop(0, '#FF6A3D');
      g.addColorStop(1, '#FFB35C');
      return g;
    })();
    ctx.beginPath();
    if (isLandscape) {
      ctx.moveTo(0, pxH);
      ctx.lineTo(pxW * 0.24, pxH);
      ctx.lineTo(0, pxH * 0.68);
    } else {
      ctx.moveTo(0, pxH);
      ctx.lineTo(pxW, pxH);
      ctx.lineTo(pxW, pxH * 0.9);
      ctx.lineTo(0, pxH * 0.97);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (bgStyle === 'frame') {
    ctx.fillStyle = '#F7F5F0';
    ctx.fillRect(0, 0, pxW, pxH);
    const bandH = pad + logoH + pad * 0.6;
    ctx.fillStyle = (() => {
      const g = ctx.createLinearGradient(0, 0, pxW, 0);
      g.addColorStop(0, '#FF6A3D');
      g.addColorStop(1, '#FFB35C');
      return g;
    })();
    ctx.fillRect(0, 0, pxW, bandH);
    const frameW = Math.max(2, pxW * 0.008);
    ctx.strokeStyle = '#FF6A3D';
    ctx.lineWidth = frameW;
    ctx.strokeRect(frameW / 2, frameW / 2, pxW - frameW, pxH - frameW);
    return;
  }

  // 'diagonal' (default)
  ctx.fillStyle = '#F7F5F0';
  ctx.fillRect(0, 0, pxW, pxH);
  ctx.fillStyle = (() => {
    const grad = ctx.createLinearGradient(0, 0, pxW, pxH);
    grad.addColorStop(0, '#FFB35C');
    grad.addColorStop(1, '#FF6A3D');
    return grad;
  })();
  ctx.beginPath();
  if (isLandscape) {
    ctx.moveTo(pxW * 0.42, 0);
    ctx.lineTo(pxW, 0);
    ctx.lineTo(pxW, pxH);
    ctx.lineTo(pxW * 0.22, pxH);
  } else {
    ctx.moveTo(0, pxH * 0.30);
    ctx.lineTo(pxW, pxH * 0.12);
    ctx.lineTo(pxW, pxH * 0.62);
    ctx.lineTo(0, pxH * 0.80);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#081416';
  ctx.lineWidth = Math.max(1, pxW * 0.004);
  ctx.stroke();
}

async function drawArtwork(ctx, pxW, pxH, spec, st, c) {
  const isLandscape = spec.wCm >= spec.hCm;
  const a = c.artwork;
  const bgStyle = st.bgStyle || 'diagonal';

  ctx.clearRect(0, 0, pxW, pxH);

  const pad = pxW * (isLandscape ? 0.025 : 0.06);
  const logoH = pxH * (isLandscape ? 0.09 : 0.05);

  awPaintBackground(ctx, pxW, pxH, isLandscape, bgStyle, pad, logoH);

  const kubotaImg = await loadArtworkImage('assets/img/artwork/kubota-wordmark.png');
  const productImgs = [];
  if (st.product === 'engine' || st.product === 'both') {
    productImgs.push({
      photo: await loadArtworkImage('assets/img/product/zt155-engine-cutout.png'),
      wordmark: await loadArtworkImage('assets/img/artwork/zt-plus-wordmark.png')
    });
  }
  if (st.product === 'tiller' || st.product === 'both') {
    productImgs.push({
      photo: await loadArtworkImage('assets/img/product/nc-plusx-tiller-cutout.png'),
      wordmark: await loadArtworkImage('assets/img/artwork/tra-chang-wordmark.png')
    });
  }

  const logoW = logoH * (kubotaImg.width / kubotaImg.height);
  const logoX = isLandscape ? pad : (pxW - logoW) / 2;
  if (bgStyle !== 'diagonal') ctx.filter = 'invert(1)';
  ctx.drawImage(kubotaImg, logoX, pad, logoW, logoH);
  ctx.filter = 'none';

  const wmH = pxH * (isLandscape ? 0.045 : 0.028);
  const wmGap = wmH * 1.3;
  const wmStartY = pad + logoH + pxH * 0.02;
  productImgs.forEach((p, i) => {
    const wmW = wmH * (p.wordmark.width / p.wordmark.height);
    const wmX = isLandscape ? pad : (pxW - wmW) / 2;
    ctx.drawImage(p.wordmark, wmX, wmStartY + i * wmGap, wmW, wmH);
  });

  let photoBoxBottom = 0;
  if (isLandscape) {
    const photoBoxW = pxW * 0.42;
    const photoBoxH = pxH * 0.78;
    const photoBoxX = pxW * 0.55;
    const photoBoxY = pxH * 0.10;
    photoBoxBottom = photoBoxY + photoBoxH;
    if (productImgs.length === 1) {
      awDrawImageContain(ctx, productImgs[0].photo, photoBoxX, photoBoxY, photoBoxW, photoBoxH);
    } else if (productImgs.length === 2) {
      awDrawImageContain(ctx, productImgs[0].photo, photoBoxX, photoBoxY, photoBoxW, photoBoxH * 0.48);
      awDrawImageContain(ctx, productImgs[1].photo, photoBoxX, photoBoxY + photoBoxH * 0.52, photoBoxW, photoBoxH * 0.48);
    }
  } else {
    const photoBoxW = pxW * 0.86;
    const photoBoxX = (pxW - photoBoxW) / 2;
    const photoBoxY = pxH * 0.16;
    if (productImgs.length === 1) {
      photoBoxBottom = photoBoxY + pxH * 0.34;
      awDrawImageContain(ctx, productImgs[0].photo, photoBoxX, photoBoxY, photoBoxW, pxH * 0.34);
    } else if (productImgs.length === 2) {
      photoBoxBottom = photoBoxY + pxH * 0.35;
      awDrawImageContain(ctx, productImgs[0].photo, photoBoxX, photoBoxY, photoBoxW, pxH * 0.17);
      awDrawImageContain(ctx, productImgs[1].photo, photoBoxX, photoBoxY + pxH * 0.18, photoBoxW, pxH * 0.17);
    } else {
      photoBoxBottom = photoBoxY;
    }
  }

  // --- Bottom info panel geometry: sized to fit shop name + contact so text never overflows ---
  const panelX = pad;
  const panelW = pxW - pad * 2;
  const innerPad = pxH * (isLandscape ? 0.035 : 0.029);
  const shopFontSize = pxH * (isLandscape ? 0.070 : 0.057);
  const contactFontSize = pxH * (isLandscape ? 0.035 : 0.029);
  const shopLineHeight = shopFontSize * 1.18;
  const contactLineHeight = contactFontSize * 1.32;
  const blockGap = pxH * 0.015;

  ctx.font = `700 ${Math.round(shopFontSize)}px Prompt, sans-serif`;
  const shopName = (st.shopName && st.shopName.trim()) || a.shopNamePlaceholder;
  const shopLines = awWrapLines(ctx, shopName, panelW - innerPad * 2);

  ctx.font = `500 ${Math.round(contactFontSize)}px 'Noto Sans Thai', sans-serif`;
  const contact = (st.contact && st.contact.trim()) || a.contactPlaceholder;
  const contactLines = awWrapLines(ctx, contact, panelW - innerPad * 2);

  const contentH = shopLines.length * shopLineHeight + blockGap + contactLines.length * contactLineHeight;
  const minPanelH = pxH * (isLandscape ? 0.22 : 0.18);
  const panelH = Math.max(minPanelH, innerPad * 2 + contentH);
  const panelY = pxH - panelH - pad;

  if (st.decorNo1) {
    const no1Img = await loadArtworkImage('assets/img/artwork/decor-no1-badge.png');
    const badgeH = pxH * (isLandscape ? 0.14 : 0.07) * (st.decorNo1Scale || 1);
    const badgeW = badgeH * (no1Img.width / no1Img.height);
    ctx.drawImage(no1Img, pxW - pad - badgeW, pad, badgeW, badgeH);
  }
  let manW = 0;
  let manTopY = null;
  if (st.decorMan) {
    const manImg = await loadArtworkImage('assets/img/artwork/decor-farmer-thumbsup.png');
    const manH = pxH * (isLandscape ? 0.30 : 0.16) * (st.decorManScale || 1);
    manW = manH * (manImg.width / manImg.height);
    manTopY = panelY - manH;
    ctx.drawImage(manImg, pad, manTopY, manW, manH);
  }

  // --- Headline / sub-headline / body, stacked ---
  // The farmer decoration stands bottom-left, in the same column this text block would
  // otherwise use, so when it's active, shift the whole text block to the right of it
  // (right-aligned in portrait, since portrait text is normally centered) instead of
  // trying to dodge it vertically — which fails once the farmer is scaled up tall.
  const textOnDark = bgStyle === 'dark';
  const manGap = manW ? pxW * 0.03 : 0;
  const dodgeMan = manW > 0;
  const headlineX = isLandscape
    ? pad + manW + manGap
    : (dodgeMan ? pxW - pad : pxW / 2);
  const headlineMaxW = isLandscape
    ? pxW * 0.46 - manW - manGap
    : (dodgeMan ? pxW * 0.86 - manW - manGap : pxW * 0.86);
  const headlineAlign = isLandscape ? 'left' : (dodgeMan ? 'right' : 'center');
  const baseFontSize = pxH * (isLandscape ? 0.075 : 0.035);
  ctx.fillStyle = textOnDark ? '#FFFFFF' : '#081416';

  // Measure every filled block first so the whole stack can be positioned to fit
  // between the logo/photo area and the info panel, instead of a fixed Y that can overflow.
  const rawBlocks = [
    { text: st.headline, ratio: 1, weight: 700 },
    { text: st.subheadline, ratio: 0.62, weight: 600 },
    { text: st.body, ratio: 0.42, weight: 400 }
  ]
    .map(b => ({ ...b, text: b.text && b.text.trim() }))
    .filter(b => b.text);

  function measureBlocks(scale) {
    let h = 0;
    const blocks = rawBlocks.map((b, i) => {
      const fontSize = baseFontSize * b.ratio * scale;
      ctx.font = `${b.weight} ${Math.round(fontSize)}px Prompt, sans-serif`;
      const lines = awWrapLines(ctx, b.text, headlineMaxW);
      const lineHeight = fontSize * 1.28;
      h += lines.length * lineHeight;
      if (i < rawBlocks.length - 1) h += fontSize * 0.45;
      return { ...b, fontSize, lineHeight, lines };
    });
    return { blocks, totalH: h };
  }

  const zoneTop = isLandscape
    ? wmStartY + wmGap * productImgs.length + pxH * 0.03
    : photoBoxBottom + pxH * 0.03;
  const zoneBottomLimit = panelY - pxH * 0.02;
  const availableH = zoneBottomLimit - zoneTop;

  let { blocks: measuredBlocks, totalH: totalTextH } = measureBlocks(1);
  if (totalTextH > availableH && availableH > 0 && totalTextH > 0) {
    const shrink = Math.max(0.4, availableH / totalTextH);
    ({ blocks: measuredBlocks, totalH: totalTextH } = measureBlocks(shrink));
  }

  const defaultStartY = isLandscape ? pxH * 0.60 : pxH * 0.55;
  let cursorY = Math.max(zoneTop, Math.min(defaultStartY, zoneBottomLimit - totalTextH));

  measuredBlocks.forEach(b => {
    ctx.font = `${b.weight} ${Math.round(b.fontSize)}px Prompt, sans-serif`;
    ctx.textAlign = headlineAlign;
    b.lines.forEach((ln, i) => ctx.fillText(ln, headlineX, cursorY + i * b.lineHeight));
    cursorY += b.lines.length * b.lineHeight + b.fontSize * 0.45;
  });

  // --- Bottom info panel ---
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  awRoundRect(ctx, panelX, panelY, panelW, panelH, panelH * 0.14);
  ctx.fill();
  ctx.strokeStyle = '#FF6A3D';
  ctx.lineWidth = Math.max(1, pxH * 0.004);
  awRoundRect(ctx, panelX, panelY, panelW, panelH, panelH * 0.14);
  ctx.stroke();

  ctx.fillStyle = '#081416';
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(shopFontSize)}px Prompt, sans-serif`;
  shopLines.forEach((ln, i) => ctx.fillText(ln, panelX + innerPad, panelY + innerPad + shopFontSize + i * shopLineHeight));

  ctx.fillStyle = '#3a3f42';
  ctx.font = `500 ${Math.round(contactFontSize)}px 'Noto Sans Thai', sans-serif`;
  const contactStartY = panelY + innerPad + shopLines.length * shopLineHeight + blockGap + contactFontSize;
  contactLines.forEach((ln, i) => ctx.fillText(ln, panelX + innerPad, contactStartY + i * contactLineHeight));
}

function initArtworkPage(c) {
  const a = c.artwork;
  const sizeSel = document.getElementById('aw-size');
  const bgStyleSel = document.getElementById('aw-bgstyle');
  const productSel = document.getElementById('aw-product');
  const shopInput = document.getElementById('aw-shopname');
  const contactInput = document.getElementById('aw-contact');
  const headlineInput = document.getElementById('aw-headline');
  const subheadlineInput = document.getElementById('aw-subheadline');
  const bodyInput = document.getElementById('aw-body');
  const decorManBtn = document.getElementById('aw-decor-man');
  const decorNo1Btn = document.getElementById('aw-decor-no1');
  const decorManSize = document.getElementById('aw-decor-man-size');
  const decorNo1Size = document.getElementById('aw-decor-no1-size');
  const canvas = document.getElementById('aw-canvas');
  const downloadBtn = document.getElementById('aw-download');
  const resNote = document.getElementById('aw-resolution-note');
  if (!canvas) return;

  function currentState() {
    return {
      size: sizeSel.value,
      bgStyle: bgStyleSel.value,
      product: productSel.value,
      shopName: shopInput.value,
      contact: contactInput.value,
      headline: headlineInput.value,
      subheadline: subheadlineInput.value,
      body: bodyInput.value,
      decorMan: decorManBtn.classList.contains('active'),
      decorNo1: decorNo1Btn.classList.contains('active'),
      decorManScale: Number(decorManSize.value) / 100,
      decorNo1Scale: Number(decorNo1Size.value) / 100
    };
  }

  function toggleDecor(btn) {
    const active = !btn.classList.contains('active');
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
    schedulePreview();
  }
  decorManBtn.addEventListener('click', () => toggleDecor(decorManBtn));
  decorNo1Btn.addEventListener('click', () => toggleDecor(decorNo1Btn));

  let redrawTimer = null;
  function schedulePreview() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(updatePreview, 120);
  }

  let previewGeneration = 0;
  async function updatePreview() {
    // Draw into an offscreen canvas and only commit it to the visible canvas if
    // this is still the most recent request. Without this, rapid changes (e.g.
    // dragging a size slider) can fire several overlapping async draws, and
    // whichever one's clearRect() happens to run last wins — sometimes leaving
    // the canvas blank if that call errors (a flaky image load) partway through.
    const myGen = ++previewGeneration;
    const st = currentState();
    const spec = ARTWORK_SIZES[st.size];
    const { pxW, pxH } = computePreviewPixels(spec.wCm, spec.hCm);
    const offscreen = document.createElement('canvas');
    offscreen.width = pxW;
    offscreen.height = pxH;
    try {
      await drawArtwork(offscreen.getContext('2d'), pxW, pxH, spec, st, c);
    } catch (err) {
      console.error('Artwork preview render failed, keeping last good preview', err);
      if (myGen === previewGeneration) setTimeout(() => { if (myGen === previewGeneration) updatePreview(); }, 400);
      return;
    }
    if (myGen !== previewGeneration) return;
    canvas.width = pxW;
    canvas.height = pxH;
    canvas.getContext('2d').drawImage(offscreen, 0, 0);
  }

  sizeSel.addEventListener('change', schedulePreview);
  bgStyleSel.addEventListener('change', schedulePreview);
  productSel.addEventListener('change', schedulePreview);
  shopInput.addEventListener('input', schedulePreview);
  contactInput.addEventListener('input', schedulePreview);
  headlineInput.addEventListener('input', schedulePreview);
  subheadlineInput.addEventListener('input', schedulePreview);
  bodyInput.addEventListener('input', schedulePreview);
  decorManSize.addEventListener('input', schedulePreview);
  decorNo1Size.addEventListener('input', schedulePreview);

  downloadBtn.addEventListener('click', async () => {
    downloadBtn.disabled = true;
    const originalLabel = downloadBtn.textContent;
    downloadBtn.textContent = a.downloadingLabel;
    try {
      const st = currentState();
      const spec = ARTWORK_SIZES[st.size];
      const { pxW, pxH, dpi } = computePrintPixels(spec.wCm, spec.hCm);
      const off = document.createElement('canvas');
      off.width = pxW;
      off.height = pxH;
      const ctx = off.getContext('2d');
      await drawArtwork(ctx, pxW, pxH, spec, st, c);
      const sizeLabel = st.size === 'banner'
        ? `${spec.wCm}×${spec.hCm} cm`
        : `${spec.hCm}×${spec.wCm} cm`;
      resNote.textContent = a.resolutionNote
        .replace('{px}', `${pxW}×${pxH}`)
        .replace('{dpi}', dpi)
        .replace('{size}', sizeLabel);
      off.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeName = (st.shopName || 'artwork').trim().replace(/[^a-zA-Z0-9ก-๙]+/g, '-') || 'artwork';
        link.href = url;
        link.download = `KUBOTA-${st.size}-${safeName}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, 'image/png');
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalLabel;
    }
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(updatePreview);
  } else {
    updatePreview();
  }
}

const RENDERERS = {
  home: renderHome,
  product: renderProductEngine,
  'product-engine': renderProductEngine,
  'product-tiller': renderProductTiller,
  'product-assembly': renderProductAssembly,
  parts: renderParts,
  service: renderService,
  crops: renderCrops,
  marketing: renderMarketing,
  artwork: renderArtwork,
  'materials-company': renderMaterialsCompany,
  'materials-custom': renderMaterialsCustom
};

function applyStaticText(c) {
  document.title = `${c.meta.siteName} — ${c.meta.tagline}`;
  document.querySelector('.brand-tagline').textContent = c.meta.tagline;
  document.querySelector('.hero h1').textContent = c.hero.title;
  document.querySelector('.hero p').textContent = c.hero.subtitle;
  document.querySelector('.hero .btn-primary').textContent = c.hero.cta;
  document.querySelector('.site-footer .contact').textContent = c.footer.contact;
  document.querySelector('.site-footer .note').textContent = c.footer.note;

  navButtons.forEach(btn => {
    const key = btn.dataset.navkey || btn.dataset.route;
    if (c.nav[key]) btn.textContent = c.nav[key];
  });
}

function render() {
  const c = state.content;
  if (!c) return;
  const renderer = RENDERERS[state.route] || RENDERERS.home;
  app.innerHTML = renderer(c);
  applyStaticText(c);
  setActiveNav(state.route);
  document.querySelector('.hero').hidden = state.route !== 'home';

  app.querySelectorAll('.card[data-target]').forEach(card => {
    card.addEventListener('click', () => navigate(card.dataset.target));
  });

  app.querySelectorAll('[data-subnav]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.subnav));
  });

  app.querySelectorAll('[data-ql-route]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.qlRoute, btn.dataset.qlAnchor));
  });

  app.querySelectorAll('[data-lightbox-src]').forEach(btn => {
    btn.addEventListener('click', () => openLightbox(btn.dataset.lightboxSrc, btn.dataset.lightboxAlt, btn.dataset.lightboxCaption));
  });

  if (state.route === 'artwork' || state.route === 'materials-custom') initArtworkPage(c);
}

async function setLang(lang) {
  state.lang = lang;
  localStorage.setItem('kukit_lang', lang);
  setLangDisplay(lang);
  document.documentElement.lang = lang;
  state.content = await loadContent(lang);
  state.searchIndex = buildSearchIndex(state.content);
  render();
  applyAssistantText(state.content);
  kaResetConversation(state.content);
}

/* ---------- KU-KIT Assistant: search index ---------- */

function routeLabel(route, c) {
  if (route.startsWith('product-')) {
    const sub = route.replace('product-', '');
    return `${c.nav.product}${c.product.tabs && c.product.tabs[sub] ? ' — ' + c.product.tabs[sub] : ''}`;
  }
  if (route.startsWith('materials-')) {
    const sub = route.replace('materials-', '');
    return `${c.nav.artwork}${c.materials && c.materials.tabs && c.materials.tabs[sub] ? ' — ' + c.materials.tabs[sub] : ''}`;
  }
  return c.nav[route] || route;
}

function pushEntry(index, route, title, snippet, extraText) {
  if (!title || !snippet) return;
  index.push({
    route,
    title,
    snippet: snippet.length > 160 ? snippet.slice(0, 157) + '…' : snippet,
    text: `${title} ${snippet} ${extraText || ''}`.toLowerCase()
  });
}

function buildSearchIndex(c) {
  const idx = [];

  // Product — Engine
  const e = c.product.engine;
  (e.items || []).forEach(item => pushEntry(idx, 'product-engine', item.name, item.desc,
    (item.specs || []).map(s => `${s.label} ${s.value}`).join(' ')));
  if (e.sellingPoints) (e.sellingPoints.items || []).forEach(i => pushEntry(idx, 'product-engine', i.title, i.desc));
  if (e.authenticity) (e.authenticity.points || []).forEach((pt, i) => {
    const text = typeof pt === 'string' ? pt : pt.text;
    pushEntry(idx, 'product-engine', `${e.authenticity.title} #${i + 1}`, text);
  });
  pushEntry(idx, 'product-engine', e.title, e.note);

  // Product — Tiller
  const t = c.product.tiller;
  (t.items || []).forEach(item => pushEntry(idx, 'product-tiller', item.name, item.desc,
    (item.specs || []).map(s => `${s.label} ${s.value}`).join(' ')));
  if (t.authenticity) (t.authenticity.points || []).forEach((pt, i) => {
    const text = typeof pt === 'string' ? pt : pt.text;
    pushEntry(idx, 'product-tiller', `${t.authenticity.title} #${i + 1}`, text);
  });
  pushEntry(idx, 'product-tiller', t.title, t.note);

  // Product — Assembly
  const a = c.product.assembly;
  if (a) {
    pushEntry(idx, 'product-assembly', a.tillerTitle, (a.tillerSteps || []).join(' '));
    pushEntry(idx, 'product-assembly', a.engineTitle, (a.engineSteps || []).join(' '));
  }

  // Parts
  const p = c.parts;
  (p.howToOrder || []).forEach(s => pushEntry(idx, 'parts', s.title, s.desc));
  (p.recommended || []).forEach(model => {
    (model.groups || []).forEach(g => {
      pushEntry(idx, 'parts', `${model.model} — ${g.label}`,
        (g.items || []).map(i => i.name).join(', '),
        (g.items || []).map(i => i.code).join(' '));
    });
  });
  (p.categories || []).forEach(cat => pushEntry(idx, 'parts', cat.name, cat.desc));

  // Service
  const s = c.service;
  if (s.preDelivery) (s.preDelivery.points || []).forEach(pt =>
    pushEntry(idx, 'service', pt.title, pt.desc, (pt.steps || []).join(' ')));
  if (s.startProcedure) pushEntry(idx, 'service', s.startProcedure.title, (s.startProcedure.steps || []).join(' '));
  if (s.maintenance) {
    (s.maintenance.engine.points || []).forEach(pt => pushEntry(idx, 'service', pt.title, pt.desc, (pt.steps || []).join(' ')));
    (s.maintenance.tiller.points || []).forEach(pt => pushEntry(idx, 'service', pt.title, pt.desc, (pt.steps || []).join(' ')));
  }
  (s.programs || []).forEach(pg => pushEntry(idx, 'service', pg.name, pg.desc));

  // Crops
  (c.crops.solutions || []).forEach(sol => pushEntry(idx, 'crops', sol.name, sol.desc));

  // Marketing
  const m = c.marketing;
  (m.activities || []).forEach(act => pushEntry(idx, 'marketing', act.name, act.purpose,
    [...(act.target || []), ...(act.basicActivities || []), ...(act.optionalActivities || []), act.venue, act.minParticipants, act.duration].join(' ')));

  // Events
  ((m.upcomingEvents && m.upcomingEvents.items) || []).forEach(ev => pushEntry(idx, 'marketing', ev.name, ev.desc, ev.location));

  // Marketing materials
  pushEntry(idx, 'materials-custom', c.artwork.title, c.artwork.intro);
  if (c.materials && c.materials.company) {
    pushEntry(idx, 'materials-company', c.materials.company.title, c.materials.company.intro);
  }

  return idx;
}

function searchContent(query, c) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(t => t.length >= 2);
  const bigrams = [];
  for (let i = 0; i < q.length - 1; i++) bigrams.push(q.slice(i, i + 2));

  const scored = state.searchIndex.map(entry => {
    let score = 0;
    if (entry.title.toLowerCase().includes(q)) score += 15;
    if (entry.text.includes(q)) score += 8;
    tokens.forEach(tok => {
      if (entry.title.toLowerCase().includes(tok)) score += 3;
      if (entry.text.includes(tok)) score += 1;
    });
    if (tokens.length === 0) {
      bigrams.forEach(bg => { if (entry.text.includes(bg)) score += 0.5; });
    }
    return { entry, score };
  });

  return scored
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(r => r.entry);
}

/* ---------- KU-KIT Assistant: UI ---------- */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function applyAssistantText(c) {
  const a = c.assistant;
  document.querySelector('.ka-panel-title').textContent = a.title;
  document.querySelector('.ka-panel-subtitle').textContent = a.subtitle;
  document.getElementById('ka-toggle').setAttribute('aria-label', a.toggleLabel);
  document.getElementById('ka-input').setAttribute('placeholder', a.placeholder);
}

function kaAddMessage(role, html) {
  const wrap = document.createElement('div');
  wrap.className = `ka-msg ka-msg--${role}`;
  wrap.innerHTML = html;
  document.getElementById('ka-messages').appendChild(wrap);
  const messages = document.getElementById('ka-messages');
  messages.scrollTop = messages.scrollHeight;
}

function kaResetConversation(c) {
  const messages = document.getElementById('ka-messages');
  if (!messages) return;
  messages.innerHTML = '';
  kaAddMessage('bot', escapeHtml(c.assistant.welcome));
}

function kaRenderResults(results, c) {
  if (!results.length) {
    return `<div>${escapeHtml(c.assistant.noResults)}</div>`;
  }
  const items = results.map(r => `
    <button type="button" class="ka-result" data-ka-route="${r.route}">
      <div class="ka-result-tag">${escapeHtml(routeLabel(r.route, c))}</div>
      <div class="ka-result-title">${escapeHtml(r.title)}</div>
      <div class="ka-result-snippet">${escapeHtml(r.snippet)}</div>
    </button>
  `).join('');
  return `<div>${escapeHtml(c.assistant.resultsIntro)}</div><div class="ka-results">${items}</div>`;
}

function kaHandleQuery(query) {
  const c = state.content;
  kaAddMessage('user', escapeHtml(query));
  const results = searchContent(query, c);
  kaAddMessage('bot', kaRenderResults(results, c));
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

document.querySelector('.hero .btn-primary').addEventListener('click', () => navigate('product-engine'));

langToggle.addEventListener('click', () => {
  const expanded = langToggle.getAttribute('aria-expanded') === 'true';
  langToggle.setAttribute('aria-expanded', String(!expanded));
  langMenu.hidden = expanded;
});

langMenu.addEventListener('click', (e) => {
  const opt = e.target.closest('[role="option"]');
  if (!opt) return;
  setLang(opt.dataset.lang);
  langMenu.hidden = true;
  langToggle.setAttribute('aria-expanded', 'false');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.lang-switch')) {
    langMenu.hidden = true;
    langToggle.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    langMenu.hidden = true;
    langToggle.setAttribute('aria-expanded', 'false');
  }
});

window.addEventListener('hashchange', () => {
  const route = (location.hash || '#home').replace('#', '');
  state.route = route;
  render();
});

/* ---------- Lightbox ---------- */

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxClose = document.getElementById('lightbox-close');

function openLightbox(src, alt, caption) {
  lightboxImg.src = src;
  lightboxImg.alt = alt || '';
  lightboxCaption.textContent = caption || '';
  lightbox.removeAttribute('hidden');
}

function closeLightbox() {
  lightbox.setAttribute('hidden', '');
  lightboxImg.src = '';
}

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hasAttribute('hidden')) closeLightbox();
});

/* ---------- KU-KIT Assistant: wiring ---------- */

const kaToggle = document.getElementById('ka-toggle');
const kaPanel = document.getElementById('ka-panel');
const kaClose = document.getElementById('ka-close');
const kaForm = document.getElementById('ka-form');
const kaInput = document.getElementById('ka-input');
const kaMessages = document.getElementById('ka-messages');

kaToggle.addEventListener('click', () => {
  const isHidden = kaPanel.hasAttribute('hidden');
  if (isHidden) {
    kaPanel.removeAttribute('hidden');
    kaInput.focus();
  } else {
    kaPanel.setAttribute('hidden', '');
  }
});

kaClose.addEventListener('click', () => kaPanel.setAttribute('hidden', ''));

kaForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const query = kaInput.value.trim();
  if (!query) return;
  kaHandleQuery(query);
  kaInput.value = '';
});

kaMessages.addEventListener('click', (e) => {
  const btn = e.target.closest('.ka-result');
  if (!btn) return;
  navigate(btn.dataset.kaRoute);
  if (window.innerWidth < 480) kaPanel.setAttribute('hidden', '');
});

(async function init() {
  await setLang(state.lang);
  navigate(state.route);
})();
