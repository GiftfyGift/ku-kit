const previewLang = new URLSearchParams(location.search).get('lang');
const supportedLangs = ['th', 'en', 'fr', 'sw', 'tl'];

const state = {
  lang: supportedLangs.includes(previewLang) ? previewLang : (localStorage.getItem('kukit_lang') || 'en'),
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
      (btnRoute.startsWith('materials') && route.startsWith('materials')) ||
      (btnRoute.startsWith('order') && route.startsWith('order'));
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
    if (v.type === 'youtube') {
      return renderYouTubeEmbed(v);
    }
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
  const videos = (resources || []).filter(r => r.type === 'video' || r.type === 'youtube');
  const docs = (resources || []).filter(r => r.type !== 'video' && r.type !== 'youtube');
  return { videos, docs };
}

function localizedDocsWithFallback(resources) {
  const docs = (resources || []).filter(r => r.type !== 'video' && r.type !== 'youtube');
  const preferredLangs = ({ th: ['TH'], en: ['EN'], sw: ['SW', 'SWA'], fr: ['FR'], tl: ['TL'] })[state.lang] || ['EN'];
  const familyKey = resource => {
    if (resource.docKey) return resource.docKey;
    const titleKey = (resource.title || '')
      .replace(/\s*\((?:TH|EN|SW|SWA|FR|TL)(?:\s*,[^)]*)?\)\s*$/i, '')
      .trim()
      .toLowerCase();
    const hrefKey = (resource.href || '')
      .replace(/[-_](?:TH|EN|SW|SWA|FR|TL)(?=\.[a-z0-9]+(?:[?#].*)?$)/i, '')
      .toLowerCase();
    return titleKey || hrefKey;
  };

  const families = new Map();
  docs.forEach(doc => {
    const key = familyKey(doc);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(doc);
  });

  return [...families.values()].map(group => {
    const preferred = group.find(doc => preferredLangs.includes((doc.lang || '').toUpperCase()));
    const english = group.find(doc => (doc.lang || '').toUpperCase() === 'EN');
    return preferred || english || group[0];
  });
}

const localizedActivityDocs = localizedDocsWithFallback;

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

function renderProductCategory(cat, id, showHeroImage = true) {
  const items = cat.items.map(item => {
    const specs = item.specs.map(s => `<tr><td>${s.label}</td><td>${s.value}</td></tr>`).join('');
    const isMultiPhoto = item.images && item.images.length > 1;
    const heading = item.logo
      ? `<img class="product-card-logo${isMultiPhoto ? ' product-card-logo--large' : ''}" src="${item.logo.src}" alt="${item.logo.alt}">`
      : `<h4>${item.name}</h4>`;
    const photos = item.images && item.images.length ? `
      <div class="product-card-photos">
        ${item.images.map(img => `
          <figure class="product-card-photo">
            <img src="${img.src}" alt="${img.alt}">
            ${img.caption ? `<figcaption>${img.caption}</figcaption>` : ''}
          </figure>
        `).join('')}
      </div>
    ` : '';
    return `
      <div class="product-card-group">
        ${photos}
        <div class="product-card">
          <div class="product-card-header">
            ${heading}
          </div>
          <div class="product-card-body">
            <p class="desc">${item.desc}</p>
            <table class="spec-table"><tbody>${specs}</tbody></table>
          </div>
        </div>
      </div>
    `;
  }).join('');
  const catNote = cat.note ? `<div class="note-callout">${cat.note}</div>` : '';
  const catImage = (showHeroImage && cat.image) ? `
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

function renderPreDeliveryBlock(pd, id) {
  if (!pd) return '';
  const labels = getEngineGuideLabels();
  const video = pd.video || { title: labels.preDeliveryVideoTitle, type: 'youtube', youtubeId: 'VjNgK_Ycirc' };
  return `
    <div class="category-block engine-guide-section" id="${id}">
      <h3 class="category-heading">${pd.title}</h3>
      <p class="section-intro">${pd.intro}</p>
      <div class="engine-guide-panel engine-guide-panel--pre-delivery">
        <section class="engine-guide-group engine-guide-group--video">
          <h4 class="engine-guide-label"><span>▶</span>${labels.video}</h4>
          <div class="video-grid engine-guide-video">${renderYouTubeEmbed(video)}</div>
        </section>
        <section class="engine-guide-group engine-guide-group--manual">
          <h4 class="engine-guide-label"><span>✓</span>${labels.manual}</h4>
          <div class="check-points ${pd.points.length === 5 ? 'check-points--five' : ''}">
            ${pd.points.map(pt => `
              <div class="check-point-card ${pt.image ? 'check-point-card--photo' : ''}">
                ${pt.image ? `<img class="check-point-photo" src="${pt.image.src}" alt="${pt.image.alt}">` : ''}
                <div class="check-point-card-body">
                  <h4>${pt.title}</h4>
                  <details class="check-point-details">
                    <summary>${labels.details}</summary>
                    <div class="check-point-details-body">
                      <p class="desc">${pt.desc}</p>
                      <ul>${pt.steps.map(st => `<li>${st}</li>`).join('')}</ul>
                    </div>
                  </details>
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      </div>
    </div>
  `;
}

function getEngineGuideLabels() {
  return ({
    th: { video: 'VDO ภาพขั้นตอนการตรวจเช็ก', manual: 'คู่มือ 5 จุดเช็กก่อนส่งมอบเครื่องยนต์ดีเซลคูโบต้า', details: 'รายละเอียดขั้นตอนตรวจเช็ก', steps: '7 ขั้นตอนการสตาร์ท', selling: 'Selling Point', sellingVideo: 'VDO แนะนำผลิตภัณฑ์', preDeliveryVideoTitle: 'VDO การตรวจเช็กเบื้องต้น เครื่องยนต์ ZT Plus', startVideoTitle: 'VDO การสตาร์ทเครื่องยนต์ที่ถูกวิธี', sellingVideoTitle: 'New ZT Plus !' },
    en: { video: 'Pre-delivery Check Video', manual: '5-Point Kubota Diesel Engine Pre-delivery Manual', details: 'View inspection details', steps: '7 Starting Steps', selling: 'Selling Points', sellingVideo: 'Product Video', preDeliveryVideoTitle: 'ZT Plus Preliminary Inspection Video', startVideoTitle: 'Correct Engine Starting Video', sellingVideoTitle: 'New ZT Plus !' },
    fr: { video: 'Vidéo de contrôle avant livraison', manual: 'Guide de livraison du moteur diesel Kubota en 5 points', details: 'Voir les détails du contrôle', steps: '7 étapes de démarrage', selling: 'Points forts', sellingVideo: 'Vidéo du produit', preDeliveryVideoTitle: 'Contrôle préliminaire du moteur ZT Plus', startVideoTitle: 'Démarrage correct du moteur', sellingVideoTitle: 'Nouveau ZT Plus !' },
    sw: { video: 'Video ya ukaguzi kabla ya kukabidhi', manual: 'Mwongozo wa hatua 5 wa kukabidhi injini ya dizeli ya Kubota', details: 'Tazama maelezo ya ukaguzi', steps: 'Hatua 7 za kuwasha', selling: 'Faida kuu', sellingVideo: 'Video ya bidhaa', preDeliveryVideoTitle: 'Ukaguzi wa awali wa injini ya ZT Plus', startVideoTitle: 'Namna sahihi ya kuwasha injini', sellingVideoTitle: 'ZT Plus Mpya!' },
    tl: { video: 'Video ng pre-delivery check', manual: '5-point na gabay sa pag-deliver ng Kubota diesel engine', details: 'Tingnan ang detalye ng pagsusuri', steps: '7 hakbang sa pag-start', selling: 'Mga Selling Point', sellingVideo: 'Video ng produkto', preDeliveryVideoTitle: 'Paunang pagsusuri ng ZT Plus engine', startVideoTitle: 'Tamang paraan ng pag-start ng engine', sellingVideoTitle: 'Bagong ZT Plus!' }
  })[state.lang] || { video: 'Video', manual: 'Manual', details: 'View details', steps: 'Starting Steps', selling: 'Selling Points', sellingVideo: 'Product Video', preDeliveryVideoTitle: 'Pre-delivery Check Video', startVideoTitle: 'Engine Starting Video', sellingVideoTitle: 'New ZT Plus !' };
}

function renderStartProcedureBlock(sp, id) {
  if (!sp) return '';
  const labels = getEngineGuideLabels();
  const video = sp.video || { title: labels.startVideoTitle, type: 'youtube', youtubeId: 'MB2sObwUZFQ' };
  return `
    <div class="category-block engine-guide-section" id="${id}">
      <h3 class="category-heading">${sp.title}</h3>
      <div class="engine-guide-panel start-guide-layout">
        <section class="engine-guide-group start-guide-video">
          <h4 class="engine-guide-label"><span>▶</span>${labels.video}</h4>
          <div class="video-grid">${renderYouTubeEmbed(video)}</div>
        </section>
        <section class="engine-guide-group start-guide-steps">
          <h4 class="engine-guide-label"><span>1–7</span>${labels.steps}</h4>
          <ol class="check-list check-list--single">${sp.steps.map(st => `<li>${st}</li>`).join('')}</ol>
        </section>
        <div class="note-callout start-guide-caution">${sp.caution.join(' ')}</div>
      </div>
      ${sp.moreFile ? `<div class="file-pill-row">${renderFilePill(sp.moreFile)}</div>` : ''}
    </div>
  `;
}

function renderApplicationExamples(app, id) {
  if (!app) return '';
  const applicationVideoTitle = ({
    th: 'VDO ภาพการใช้งานกับ Application ต่างๆ',
    en: 'Videos of Different Application Uses',
    fr: "Vidéos d’utilisation pour différentes applications",
    sw: 'Video za Matumizi katika Application Mbalimbali',
    tl: 'Mga Video ng Iba’t Ibang Application'
  })[state.lang] || 'Videos of Different Application Uses';
  const applicationVideo = id === 'engine-application'
    ? (app.video || { title: applicationVideoTitle, type: 'youtube', youtubeId: 'CuETaLudUGg' })
    : app.video;
  const applicationVideoBlock = applicationVideo ? `
    <div class="application-video-section">
      <h3 class="application-video-heading">${applicationVideoTitle}</h3>
      <div class="video-grid application-video-grid">${renderYouTubeEmbed(applicationVideo)}</div>
    </div>
  ` : '';
  // Preview branch: load the latest Application images directly from the
  // team's shared Drive folder so reviewers always see the newest uploads.
  if (app.categories && id === 'engine-application') {
    const driveImage = fileId => `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
    const previewImages = {
      'power-tiller': [
        ['Soil Preparation', '1B-BeFNTvhMk4ZMQzxBVj1OxRfMAGpL9H'],
        ['Soil Preparation', '1qMU1g2vq99Yj7dqeDezTS83CDgf02QQk'],
        ['Soil Preparation', '14bvXcL-drIo0TSYq7Z1humIZauXNICme'],
        ['Transportation with a Power Tiller', '15ZrEDr-T_T5FZZBMGA4LN36kPtoRYaaT'],
        ['Transportation with a Power Tiller', '1fbj2a3by9MRlM0oxf5JnNS8KaIt_3mBh']
      ],
      transport: [
        ['Agricultural Produce Transport Vehicle', '1hFO1YzPiHyVYClk6UazS681u2AlojSYN'],
        ['Farm Cargo Truck', '1AYLcjoxkTWY4E_qdW9kzwfUWgmWHJS7T'],
        ['Agricultural Transport Truck', '1rvxZQ-_xjg_oZ1nbGAS-3FeVDtZZ2iuo'],
        ['Heavy-Duty Farm Transport Vehicle', '1ac4__Y9ZjPF3-TSLo5KA7wyGQ6h6SXr0'],
        ['Produce Hauling Truck', '1DyK82k73jrwG2Io3UGADWmvyWyXkrn57'],
        ['Farm Utility Truck', '1O-pl5IbL96-tu88CXqtglO3wXsRDHbr3']
      ],
      'water-pump': [
        ['Mobile Water Pump', '1Z7d1YBZGtKxcjHB-mQKwxfYbwCiCXYoy'],
        ['Belt-Driven Water Pump', '1xsKrPXEZCU8ZmX1a8_KhCNJOZfZMU-9J'],
        ['Mobile Irrigation Pump', '1-UHEQjSlR8JbNZ8zn_rRy4eSO1Mdel_y'],
        ['Trailer-Mounted Water Pump', '1182081tivPg3ljSVFDiwNV6X9a_boCM6']
      ],
      'mini-tractor': [
        ['Modified Mini Tractor with Agricultural Implements', '1k96uroo8gVe5vag1OcEJgK0IpFd4jF7K'],
        ['Four-Wheel Modified Mini Tractor', '1hWFm6gqiSZL66_PYWBOEojxiuW2cpuf1'],
        ['Three-Wheel Modified Mini Tractor', '1HjzQbEitwkjdl8RePop_e8nEDTKbazdN']
      ],
      construction: [
        ['Micropile Machine', '1dooxmQ9TS2hnHlR58jPno38bLYVV4Udq'],
        ['Dumper 1', '11ghPhxghwfLED2VEerfE1OtnXEhcIXWs'],
        ['Dumper 2', '1SKLdigWuZ_Nzim_xeXglEBsu6SZhDzle'],
        ['Concrete Mixer Truck 1', '1Hn0ui95lAtpFawXixmlgmeGxlExHt3YY'],
        ['Concrete Mixer Truck 2', '1YaSQ12PL02GcNYf43YQPSDYXWW062n0N'],
        ['Concrete Sprayer', '1E_b3JZj8w6Xdf8pxNpYxlS5EX7SEHxrZ']
      ],
      livestock: [
        ['EVAP Fan (Evaporative Cooling Fan)', '14shGqImHz9U4IkWXjj9WXwe8Nnr4Gla5'],
        ['Shrimp Farm Aerator', '1SGyiz6GMYZ1Lo4QKnXtGHHcbEstnbBlK']
      ],
      'other-agricultural': [
        ['Riding Grass Mower', '1svMx-n_u33BimwuWLjwYfYA_63KMN4qv'],
        ['Straw Baler', '1BkaN-kyH8XuaVL-1-NGyhiqU6gLq4W9k'],
        ['Rice Thresher', '1RNjVb6gKul1X4dY8kafUeSYlKHndjWqA'],
        ['Generator for Drone Charger', '1_ZO69yVjLpsCpBtNtBrlNYjt-0TaZDS4'],
        ['Animal Feed Mixer', '1X-KHC4wUMJ91_IgxF-dhCISGJ2ngIUx6'],
        ['Lawn Mower', '1ssEIHZ_GnkMZli4K-eXzGIaWd3PNwM7b'],
        ['Multi-Purpose Vehicle', '1lI_ok9Oo8Q9UUQzkSbvrjmbBPB3pw3eh'],
        ['Cassava Chopper', '1AqJDIwYDYBwed58-r7ezBnWevRyOYnXn']
      ]
    };
    app.categories.forEach(category => {
      if (!previewImages[category.id]) return;
      category.items = previewImages[category.id].map(([title, fileId]) => ({
        title,
        src: driveImage(fileId),
        alt: `${title} — KUBOTA ZT Plus engine application`
      }));
    });
  }
  if (app.categories && app.categories.length) {
    const ui = Object.assign({
      categoryLabel: 'Select application category',
      previous: 'Previous image',
      next: 'Next image',
      openImage: 'Open image'
    }, app.ui || {});
    const categoryTabs = app.categories.map((category, categoryIdx) => `
      <button type="button" class="application-category-tab${categoryIdx === 0 ? ' active' : ''}"
        role="tab" aria-selected="${categoryIdx === 0}" aria-controls="application-panel-${id}-${categoryIdx}"
        id="application-tab-${id}-${categoryIdx}" data-application-tab="${categoryIdx}">${category.title}</button>
    `).join('');
    const frameHeadingText = id === 'tiller-application'
      ? ({
          th: 'อุปกรณ์ต่อพ่วงรถไถเดินตามตราช้าง',
          en: 'Implements for the TRA CHANG Power Tiller',
          fr: 'Accessoires pour le motoculteur TRA CHANG',
          sw: 'Vifaa vya Trekta la Kutembea la TRA CHANG',
          tl: 'Mga Implement para sa TRA CHANG Power Tiller'
        })[state.lang] || 'Implements for the TRA CHANG Power Tiller'
      : 'Applications of Kubota Diesel Engines';
    const frameHeadingLogo = id === 'tiller-application' ? '' :
      `<img src="https://drive.google.com/thumbnail?id=1CBjOziL8SgTOTQd-H-g_4SqkFWrE1AHt&sz=w1000" alt="ZT Plus" class="application-zt-plus-logo">`;
    const categoryPanels = app.categories.map((category, categoryIdx) => `
      <section class="application-carousel-panel" id="application-panel-${id}-${categoryIdx}"
        role="tabpanel" aria-labelledby="application-tab-${id}-${categoryIdx}"
        data-application-panel="${categoryIdx}"${categoryIdx === 0 ? '' : ' hidden'}>
        <div class="application-picture-frame-heading">
          <span>${frameHeadingText}</span>
          ${frameHeadingLogo}
        </div>
        <div class="application-carousel-frame">
          <div class="application-carousel-track">
            ${category.items.map((item, itemIdx) => `
              <button type="button" class="application-carousel-slide" data-application-slide
                data-title="${escapeHtml(item.title)}" data-desc="${escapeHtml(item.desc || '')}" data-lightbox-src="${item.src}"
                data-lightbox-alt="${escapeHtml(item.alt || item.title)}" data-lightbox-caption="${escapeHtml(item.title)}"
                aria-label="${escapeHtml(ui.openImage)}: ${escapeHtml(item.title)}">
                <span class="application-slide-backdrop" style="background-image:url('${item.src}')" aria-hidden="true"></span>
                <img src="${item.src}" alt="${escapeHtml(item.alt || item.title)}" loading="${categoryIdx === 0 && itemIdx === 0 ? 'eager' : 'lazy'}">
              </button>
            `).join('')}
          </div>
          <button type="button" class="application-carousel-arrow application-carousel-arrow--prev" data-application-prev aria-label="${escapeHtml(ui.previous)}">‹</button>
          <button type="button" class="application-carousel-arrow application-carousel-arrow--next" data-application-next aria-label="${escapeHtml(ui.next)}">›</button>
          <span class="application-carousel-count" data-application-count>01 / ${String(category.items.length).padStart(2, '0')}</span>
        </div>
        <div class="application-carousel-meta">
          <div class="application-carousel-text">
            <h4 data-application-caption>${category.items[0]?.title || ''}</h4>
            ${category.items.some(item => item.desc) ? `<p class="application-carousel-desc" data-application-desc>${category.items[0]?.desc || ''}</p>` : ''}
          </div>
          <div class="application-carousel-dots" role="group" aria-label="${escapeHtml(category.title)}">
            ${category.items.map((item, itemIdx) => `<button type="button" class="application-carousel-dot${itemIdx === 0 ? ' active' : ''}" data-application-dot="${itemIdx}" aria-label="${itemIdx + 1}: ${escapeHtml(item.title)}"></button>`).join('')}
          </div>
        </div>
      </section>
    `).join('');
    return `
      <div class="category-block"${id ? ` id="${id}"` : ''}>
        <h3 class="category-heading">${app.title}</h3>
        ${app.intro ? `<p class="section-intro">${app.intro}</p>` : ''}
        <div class="application-showcase" data-application-showcase>
          <div class="application-category-tabs" role="tablist" aria-label="${escapeHtml(ui.categoryLabel)}">${categoryTabs}</div>
          ${categoryPanels}
        </div>
        ${applicationVideoBlock}
      </div>
    `;
  }
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
      ${applicationVideoBlock}
    </div>
  `;
}

let applicationCarouselTimers = [];

function initApplicationCarousels() {
  applicationCarouselTimers.forEach(clearInterval);
  applicationCarouselTimers = [];

  app.querySelectorAll('[data-application-showcase]').forEach(showcase => {
    const tabs = Array.from(showcase.querySelectorAll('[data-application-tab]'));
    const panels = Array.from(showcase.querySelectorAll('[data-application-panel]'));

    panels.forEach(panel => {
      const track = panel.querySelector('.application-carousel-track');
      const slides = Array.from(panel.querySelectorAll('[data-application-slide]'));
      const dots = Array.from(panel.querySelectorAll('[data-application-dot]'));
      const caption = panel.querySelector('[data-application-caption]');
      const desc = panel.querySelector('[data-application-desc]');
      const count = panel.querySelector('[data-application-count]');
      let current = 0;
      let touchStartX = 0;

      const showSlide = index => {
        current = (index + slides.length) % slides.length;
        track.style.transform = `translateX(-${current * 100}%)`;
        dots.forEach((dot, dotIdx) => dot.classList.toggle('active', dotIdx === current));
        caption.textContent = slides[current]?.dataset.title || '';
        if (desc) desc.textContent = slides[current]?.dataset.desc || '';
        count.textContent = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
      };

      panel.querySelector('[data-application-prev]')?.addEventListener('click', () => showSlide(current - 1));
      panel.querySelector('[data-application-next]')?.addEventListener('click', () => showSlide(current + 1));
      dots.forEach(dot => dot.addEventListener('click', () => showSlide(Number(dot.dataset.applicationDot))));
      panel.addEventListener('touchstart', event => { touchStartX = event.changedTouches[0].clientX; }, { passive: true });
      panel.addEventListener('touchend', event => {
        const delta = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(delta) > 45) showSlide(current + (delta < 0 ? 1 : -1));
      }, { passive: true });

      if (slides.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const timer = setInterval(() => {
          if (!panel.hidden && !document.hidden) showSlide(current + 1);
        }, 4800);
        applicationCarouselTimers.push(timer);
      }
    });

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const selected = Number(tab.dataset.applicationTab);
        tabs.forEach((item, idx) => {
          item.classList.toggle('active', idx === selected);
          item.setAttribute('aria-selected', String(idx === selected));
        });
        panels.forEach((panel, idx) => { panel.hidden = idx !== selected; });
      });
    });
  });
}

function renderAuthenticityBlock(auth, id) {
  if (!auth) return '';
  const body = auth.artworkImage
    ? `<figure class="authenticity-artwork"><img src="${auth.artworkImage.src}" alt="${auth.artworkImage.alt}"></figure>`
    : renderCheckPhotoList(auth.points);
  return `
    <div class="category-block"${id ? ` id="${id}"` : ''}>
      <h3 class="category-heading">${auth.title}</h3>
      ${auth.intro ? `<p class="section-intro">${auth.intro}</p>` : ''}
      ${body}
      ${auth.moreFile ? `<div class="file-pill-row">${renderFilePill(auth.moreFile)}</div>` : ''}
    </div>
  `;
}

function renderFilePill(f) {
  return `
    <a class="file-pill" href="${f.href}" target="_blank" rel="noopener">
      <span class="file-pill-icon">${resIcon(f.type)}</span>
      <span class="file-pill-label">${f.title}${f.lang ? ` <span class="res-tag">${f.lang}</span>` : ''}</span>
    </a>
  `;
}

function renderYouTubeEmbed(v) {
  return `
    <div class="video-card">
      <div class="video-embed-wrap">
        <iframe src="https://www.youtube.com/embed/${v.youtubeId}" title="${v.title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
      </div>
      <div class="video-caption">${v.title}</div>
    </div>
  `;
}

function renderSellingPointsMedia(media) {
  const labels = getEngineGuideLabels();
  const resolvedMedia = media || {};
  const resolvedVideo = resolvedMedia.video || { title: labels.sellingVideoTitle, type: 'youtube', youtubeId: '2TyKkvsv-3I' };
  const videoHtml = `<section class="selling-media-video">
    <h4 class="engine-guide-label"><span>▶</span>${labels.sellingVideo}</h4>
    <div class="video-grid selling-video-grid">${renderYouTubeEmbed(resolvedVideo)}</div>
  </section>`;
  const filesHtml = (resolvedMedia.files && resolvedMedia.files.length) ? `<div class="file-pill-row">${resolvedMedia.files.map(renderFilePill).join('')}</div>` : '';
  return `${videoHtml}${filesHtml}`;
}

function renderEngineDifferences(section) {
  if (!section || !section.items || !section.items.length) return '';
  return `
    <div class="category-block engine-differences-section">
      <h3 class="category-heading">${section.title}</h3>
      <div class="engine-differences-grid">
        ${section.items.map((item, index) => `
          <article class="engine-difference-card">
            <figure class="engine-difference-media">
              <img src="${item.image.src}" alt="${item.image.alt}" loading="lazy" decoding="async">
              <span class="engine-difference-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
            </figure>
            <div class="engine-difference-body">
              <h4>${item.title}</h4>
              <p>${item.desc}</p>
            </div>
          </article>
        `).join('')}
      </div>
    </div>
  `;
}

function renderProductResources(p, downloadsId, usePillStyle) {
  const { videos } = splitResources(p.resources);
  const docs = localizedDocsWithFallback(p.resources);
  const videoBlock = videos.length ? `
    <div class="category-block">
      <h3 class="category-heading">${p.videosTitle}</h3>
      ${renderVideoGrid(videos)}
    </div>
  ` : '';
  const docsBody = usePillStyle
    ? `<div class="file-pill-row">${docs.map(renderFilePill).join('')}</div>`
    : renderResourceList(docs);
  const resources = docs.length ? `
    <div class="category-block"${downloadsId ? ` id="${downloadsId}"` : ''}>
      <h3 class="category-heading">${p.downloadsTitle}</h3>
      ${docsBody}
    </div>
  ` : '';
  return videoBlock + resources;
}

function renderProductEngine(c) {
  const p = c.product;
  const e = p.engine;

  const sellingPoints = e.sellingPoints ? `
    <div class="category-block selling-points-section">
      <h3 class="category-heading">${e.sellingPoints.title}</h3>
      <div class="engine-guide-panel selling-points-panel">
        <section class="selling-points-list">
          <h4 class="engine-guide-label"><span>★</span>${getEngineGuideLabels().selling}</h4>
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
        </section>
        ${renderSellingPointsMedia(e.sellingPoints.media)}
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
      ${renderEngineDifferences(e.differences)}
      ${renderStarterSystems(e.starterSystems)}
      ${renderPreDeliveryBlock(e.preDelivery, 'engine-pre-delivery')}
      ${renderStartProcedureBlock(e.startProcedure, 'engine-start-procedure')}
      ${renderAssemblyBlock(p.assembly)}
      ${renderAuthenticityBlock(e.authenticity, 'engine-authenticity')}
      ${renderApplicationExamples(e.applicationExamples, 'engine-application')}
      ${renderProductResources(e, 'engine-downloads', true)}
      <div class="note-callout">${e.note}</div>
    </section>
  `;
}

function renderStarterSystems(starterSystems) {
  if (!starterSystems?.items?.length) return '';
  return `
    <div class="category-block starter-systems-section" id="engine-starter-systems">
      <div class="starter-systems-heading">
        <h3>${starterSystems.title}</h3>
        ${starterSystems.intro ? `<p>${starterSystems.intro}</p>` : ''}
      </div>
      <div class="starter-systems-grid">
        ${starterSystems.items.map((item, index) => `
          <article class="starter-system-card starter-system-card--${item.code.toLowerCase()}">
            <div class="starter-system-visual">
              <img src="${item.image?.src || 'assets/img/product/zt155-engine-cutout.png'}" alt="${item.image?.alt || item.title}">
              <span class="starter-system-focus" aria-hidden="true"></span>
            </div>
            <div class="starter-system-body">
              <span class="starter-system-number">${index + 1}</span>
              <h4>${item.title}</h4>
              <p>${item.desc}</p>
            </div>
          </article>
        `).join('')}
      </div>
      ${starterSystems.note ? `<p class="starter-systems-note">${starterSystems.note}</p>` : ''}
    </div>
  `;
}

function renderAssemblyBlock(a) {
  if (!a) return '';
  return `
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
      ${renderProductCategory(t, 'tiller-product-info', false)}
      ${renderAssemblyBlock(p.assembly)}
      ${renderProductResources(t, 'tiller-downloads')}
      ${renderAuthenticityBlock(t.authenticity, 'tiller-authenticity')}
      ${renderApplicationExamples(t.applicationExamples, 'tiller-application')}
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
      ${renderAssemblyBlock(a)}
    </section>
  `;
}

function renderParts(c) {
  const pt = c.parts;
  const oc = c.order.catalog;

  const modelCatalog = `
    <div class="category-block">
      <div class="order-model-label">${oc.modelLabel}</div>
      <div class="product-selector" id="parts-model-selector"></div>
      <div class="pmc-tabs" role="tablist">
        <button type="button" class="pmc-tab is-active" data-pmc-tab="firstlot" role="tab" aria-selected="true">${oc.firstLotHeading}</button>
        <button type="button" class="pmc-tab" data-pmc-tab="catalog" role="tab" aria-selected="false">${oc.fullCatalogHeading}</button>
      </div>
      <div id="parts-model-catalog-body" class="order-catalog-body">
        <div class="order-loading">${oc.loading}</div>
      </div>
      <div class="note-callout">${oc.priceNote}</div>
    </div>
  `;

  const partsDocs = localizedDocsWithFallback(pt.resources);
  const resources = partsDocs.length ? `
    <div class="category-block">
      <h3 class="category-heading">${pt.downloadsTitle}</h3>
      ${renderResourceList(partsDocs)}
    </div>
  ` : '';

  return `
    <section>
      <div class="section-header-photo-wrap">
        <h2 class="section-title">${pt.title}</h2>
        <p class="section-intro">${pt.intro}</p>
        <img class="section-header-photo" src="assets/img/parts/parts-lineup.png" alt="${pt.title}">
      </div>
      ${modelCatalog}
      ${resources}
      <div class="note-callout">${pt.note}</div>
    </section>
  `;
}

let partsCatalogDataCache = null;
async function loadPartsCatalogData() {
  if (partsCatalogDataCache) return partsCatalogDataCache;
  partsCatalogDataCache = await fetch('assets/data/parts-catalog.json', { cache: 'no-store' }).then(r => r.json());
  return partsCatalogDataCache;
}

function splitModelLabel(label) {
  const prefixes = ['Kubota Diesel Engine ', 'Tra Chang Power Tiller '];
  for (const p of prefixes) {
    if (label.startsWith(p)) return [p.trim(), label.slice(p.length)];
  }
  return ['', label];
}

async function initPartsModelCatalog(c) {
  const oc = c.order.catalog;
  const selector = document.getElementById('parts-model-selector');
  const body = document.getElementById('parts-model-catalog-body');
  const tabs = document.querySelectorAll('.pmc-tab');
  if (!selector || !body) return;

  let data;
  try {
    data = await loadPartsCatalogData();
  } catch (e) {
    body.innerHTML = `<div class="order-loading">Failed to load parts data.</div>`;
    return;
  }
  if (state.route !== 'parts') return;

  const isTillerModel = (id) => id.startsWith('NC') || id.startsWith('PEM');
  let selectedModelId = data.models[0] ? data.models[0].id : null;

  selector.innerHTML = data.models.map(m => {
    const img = isTillerModel(m.id) ? c.product.tiller.image : c.product.engine.image;
    const [labelLine1, labelLine2] = splitModelLabel(m.label);
    return `
      <button type="button" class="product-select-card ${m.id === selectedModelId ? 'active' : ''}" data-parts-model="${m.id}">
        <span class="product-select-icon"><img src="${img.src}" alt="${img.alt}"></span>
        <span class="product-select-label">
          ${labelLine1 ? `<span class="product-select-label-line1">${labelLine1}</span>` : ''}
          <span class="product-select-label-line2">${labelLine2}</span>
        </span>
        <span class="product-select-check" aria-hidden="true">✓</span>
      </button>
    `;
  }).join('');

  selector.querySelectorAll('[data-parts-model]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedModelId = btn.dataset.partsModel;
      selector.querySelectorAll('[data-parts-model]').forEach(b => b.classList.toggle('active', b === btn));
      currentGroupFilter = 'ALL';
      currentSearch = '';
      renderBody();
    });
  });

  let activeTab = 'firstlot';
  let currentGroupFilter = 'ALL';
  let currentSearch = '';
  const GROUP_ORDER = ['X', 'S', 'A', 'B', 'C'];

  function renderBody() {
    const model = data.models.find(m => m.id === selectedModelId);
    if (!model) { body.innerHTML = ''; return; }

    if (activeTab === 'firstlot') {
      const total = model.firstLot.reduce((sum, item) => sum + (item.amount || 0), 0);
      body.innerHTML = `
        <p class="section-intro">${oc.firstLotIntro}</p>
        <div class="order-firstlot-grid">
          ${model.firstLot.map(item => `
            <div class="order-firstlot-card">
              ${item.image ? `<div class="order-firstlot-img-wrap"><img class="order-firstlot-img" src="${item.image}" alt="${item.name}"></div>` : ''}
              <div class="order-firstlot-name">${item.name}</div>
              <div class="order-firstlot-fn">${item.fn}</div>
              <div class="order-firstlot-meta">
                <span class="order-firstlot-code">${item.partNo}</span>
                <span class="order-firstlot-price">${orderFmtUsd(item.price)}</span>
              </div>
              <div class="order-firstlot-qty">${oc.qtyLabel}: ${item.suggestQty || '—'}</div>
            </div>
          `).join('')}
        </div>
        ${model.firstLot.length ? `<div class="note-callout">${oc.firstLotTotalLabel}: ${orderFmtUsd(total)}</div>` : ''}
      `;
    } else {
      const groupChips = `
        <button type="button" class="order-group-chip ${currentGroupFilter === 'ALL' ? 'active' : ''}" data-group-filter="ALL">${oc.groupAll}</button>
        ${GROUP_ORDER.map(g => `<button type="button" class="order-group-chip ${currentGroupFilter === g ? 'active' : ''}" data-group-filter="${g}">${oc.groupLabels[g] || g}</button>`).join('')}
      `;

      const filteredCatalog = model.catalog.filter(item => {
        if (item.group === 'D') return currentGroupFilter === 'D';
        if (currentGroupFilter !== 'ALL' && item.group !== currentGroupFilter) return false;
        if (currentSearch) {
          const q = currentSearch.toLowerCase();
          if (!item.partNo.toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) return false;
        }
        return true;
      });

      const catalogRows = filteredCatalog.map(item => `
        <tr>
          <td class="code-col">${item.partNo}</td>
          <td>${item.name}</td>
          <td>${oc.groupLabels[item.group] || item.group}</td>
          <td>${orderFmtUsd(item.price)}</td>
        </tr>
      `).join('');

      body.innerHTML = `
        <p class="section-intro">${oc.fullCatalogIntro}</p>
        <div class="order-group-filters">${groupChips}</div>
        <input type="text" class="order-search-input" id="parts-search-input" placeholder="${oc.searchPlaceholder}" value="${currentSearch.replace(/"/g, '&quot;')}">
        <div class="order-table-scroll">
          <table class="kubota-table order-parts-table">
            <thead>
              <tr>
                <th>${oc.colPartNo}</th>
                <th>${oc.colName}</th>
                <th>${oc.colGroup}</th>
                <th>${oc.colPrice}</th>
              </tr>
            </thead>
            <tbody>${catalogRows || `<tr><td colspan="4" class="order-empty-row">—</td></tr>`}</tbody>
          </table>
        </div>
      `;

      body.querySelectorAll('[data-group-filter]').forEach(btn => {
        btn.addEventListener('click', () => { currentGroupFilter = btn.dataset.groupFilter; renderBody(); });
      });

      const searchInput = document.getElementById('parts-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          currentSearch = searchInput.value;
          const selStart = searchInput.selectionStart;
          renderBody();
          const newInput = document.getElementById('parts-search-input');
          if (newInput) { newInput.focus(); newInput.setSelectionRange(selStart, selStart); }
        });
      }
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.pmcTab;
      tabs.forEach(t => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      renderBody();
    });
  });

  renderBody();
}

function renderService(c) {
  const s = c.service;

  const maintenanceVideoLabel = ({
    th: 'VDO บำรุงรักษา',
    en: 'Maintenance Video',
    fr: "Vidéo d’entretien",
    sw: 'Video ya matengenezo',
    tl: 'Video ng maintenance'
  })[state.lang] || 'Maintenance Video';

  const maintenanceVideoIds = {
    engine: ['RDNMRAZHSXs', 'qkdKWM3PbtM', '2Nykx-mqYuc', '1cQynIA1uc8', 'cSfK8SUGUlw'],
    tiller: ['xLyFjtY72I0', 'FqEE3gZRTqQ', 'sjAyoYBSHSw', 'toW72zz74xE', '9GMf1rZ5DZ4']
  };

  const resolveMaintenanceVideo = (pt, idx, productType) => pt.video || {
    title: `${maintenanceVideoLabel}: ${pt.title.replace(/^\d+\.\s*/, '')}`,
    type: 'youtube',
    youtubeId: maintenanceVideoIds[productType][idx]
  };

  const renderMaintenancePoints = (pts, idPrefix, productType) => pts.map((pt, idx) => {
    const video = resolveMaintenanceVideo(pt, idx, productType);
    return `
    <div class="check-point-item" id="${idPrefix}-${idx}">
      <div class="check-point-card ${pt.image ? 'check-point-card--photo' : ''}">
        ${pt.image ? `<img class="check-point-photo" src="${pt.image.src}" alt="${pt.image.alt}">` : ''}
        <div class="check-point-card-body">
          <h4>${pt.title}</h4>
          <div class="video-grid check-point-video-float">${renderYouTubeEmbed(video)}</div>
          <p class="desc">${pt.desc}</p>
          <ul>${pt.steps.map(st => `<li>${st}</li>`).join('')}</ul>
        </div>
      </div>
    </div>
  `;
  }).join('');

  const pointsGridClass = () => 'check-points check-points--stacked';

  const maintenanceSchedule = s.maintenanceSchedule ? `
    <div class="maint-sched-block">
      <h4 class="subsection-title">${s.maintenanceSchedule.title}</h4>
      <p class="section-intro">${s.maintenanceSchedule.intro}</p>
      <div class="maint-sched-filters" role="group">
        <button type="button" class="maint-sched-chip is-active" data-maint-type="all">${s.maintenanceSchedule.allLabel}</button>
        ${s.maintenanceSchedule.types.map(t => `<button type="button" class="maint-sched-chip" data-maint-type="${t.id}">${t.label}</button>`).join('')}
      </div>
      <div class="maint-sched-table-scroll">
        <table class="kubota-table maint-sched-table maint-sched-table--matrix">
          <thead><tr>
            <th>${s.maintenanceSchedule.columns.item}</th>
            <th>${s.maintenanceSchedule.columns.code}</th>
            ${s.maintenanceSchedule.intervalCols.map(col => `<th class="maint-sched-interval-head">${col.label}</th>`).join('')}
            <th>${s.maintenanceSchedule.columns.models}</th>
          </tr></thead>
          <tbody>
            ${s.maintenanceSchedule.items.map(item => `
              <tr data-maint-row-type="${item.type}">
                <td>${item.name}</td>
                <td class="maint-sched-code">${item.code}</td>
                ${s.maintenanceSchedule.intervalCols.map(col => `<td class="maint-sched-dot-cell">${item.intervals.includes(col.id) ? '<span class="maint-sched-dot">●</span>' : ''}</td>`).join('')}
                <td>
                  <div class="maint-sched-models-cell">
                    ${item.allModels
                      ? `<span class="maint-sched-model-tag maint-sched-model-tag--all">${s.maintenanceSchedule.allModelsLabel}</span>`
                      : item.models.map(m => `<span class="maint-sched-model-tag">${m}</span>`).join('')}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  const maintenance = s.maintenance ? `
    <div class="category-block">
      <h3 class="category-heading">${s.maintenance.title}</h3>
      <p class="section-intro">${s.maintenance.intro}</p>
      <h4 class="subsection-title">${s.maintenance.engine.title}</h4>
      <div class="${pointsGridClass()}">${renderMaintenancePoints(s.maintenance.engine.points, 'maintenance-engine', 'engine')}</div>
      ${maintenanceSchedule}
      <h4 class="subsection-title">${s.maintenance.tiller.title}</h4>
      <div class="${pointsGridClass()}">${renderMaintenancePoints(s.maintenance.tiller.points, 'maintenance-tiller', 'tiller')}</div>
    </div>
  ` : '';

  const programs = s.programs.map(p => `
    <div class="program-card">
      <h4>${p.name}</h4>
      <p>${p.desc}</p>
    </div>
  `).join('');

  const docs = localizedDocsWithFallback(s.resources);
  const resources = docs.length ? `
    <div class="category-block">
      <h3 class="category-heading">${s.downloadsTitle}</h3>
      ${renderResourceList(docs)}
    </div>
  ` : '';

  return `
    <section>
      <div class="section-header-photo-wrap">
        <h2 class="section-title">${s.title}</h2>
        <p class="section-intro">${s.intro}</p>
        <img class="section-header-photo section-header-photo--person" src="assets/img/service/service-technician.png" alt="${s.title}">
      </div>
      ${renderQuickLinksColumns(s.quickLinks)}
      ${maintenance}
      <div class="category-block">
        <h3 class="category-heading">${s.programsTitle} ${c.meta.sampleBadge ? `<span class="sample-badge">${c.meta.sampleBadge}</span>` : ''}</h3>
        <div class="program-grid">${programs}</div>
      </div>
      ${resources}
      <div class="note-callout">${s.note}</div>
    </section>
  `;
}

function initMaintenanceSchedule() {
  const filters = document.querySelector('.maint-sched-filters');
  if (!filters) return;
  const chips = filters.querySelectorAll('[data-maint-type]');
  const rows = document.querySelectorAll('[data-maint-row-type]');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const type = chip.dataset.maintType;
      rows.forEach(row => {
        row.style.display = (type === 'all' || row.dataset.maintRowType === type) ? '' : 'none';
      });
    });
  });
}

const CROP_SOLUTION_ICONS = {
  'crop-wet-paddy': ['rice', 'water'],
  'crop-dry-paddy': ['rice', 'sand'],
  'crop-cassava': ['cassava'],
  'crop-corn': ['corn']
};
const CROP_ICON_SRC = {
  rice: 'assets/img/crops/icons/rice.svg',
  water: 'assets/img/crops/icons/water.svg',
  sand: 'assets/img/crops/icons/sand.svg',
  cassava: 'assets/img/crops/icons/cassava.svg',
  corn: 'assets/img/crops/icons/corn.svg'
};

function renderCrops(c) {
  const cr = c.crops;

  const renderSolutionCard = sol => {
    const videoHtml = sol.video && sol.video.type === 'youtube'
      ? renderYouTubeEmbed(sol.video)
      : sol.video && sol.video.href
        ? `<video class="kk-video" controls preload="metadata" src="${encodeURI(sol.video.href)}"></video>`
        : `<div class="video-note">🎬 ${sol.video ? sol.video.title : ''}${sol.video && sol.video.note ? ' — ' + sol.video.note : ''}</div>`;
    const iconKeys = CROP_SOLUTION_ICONS[sol.id];
    const iconsHtml = iconKeys ? `
      <div class="solution-card-icons" aria-hidden="true">
        ${iconKeys.map(k => `
          <span class="solution-card-icon-badge">
            <span class="badge-glow"></span>
            <span class="badge-ring"></span>
            <img src="${CROP_ICON_SRC[k]}" alt="" class="solution-card-icon">
          </span>
        `).join('')}
      </div>
    ` : '';
    return `
      <div class="product-card"${sol.id ? ` id="${sol.id}"` : ''}>
        <div class="product-card-header">${iconsHtml}<h4>${sol.name}</h4></div>
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
      ${g.name ? `<h3 class="category-heading">${g.name}</h3>` : ''}
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

  const coverSets = [
    ['assets/img/activity-kfd-1.webp', 'assets/img/activity-kfd-2.webp', 'assets/img/activity-kfd-3.webp', 'assets/img/activity-kfd-4.webp'],
    ['assets/img/activity-demo-1.webp', 'assets/img/activity-demo-2.webp', 'assets/img/activity-demo-3.webp', 'assets/img/activity-demo-4.webp?v=20260820a'],
    ['assets/img/activities/mobile-service-1.webp', 'assets/img/activities/mobile-service-2.webp', 'assets/img/activities/mobile-service-3.webp'],
    ['assets/img/activities/thank-you-1.webp', 'assets/img/activities/thank-you-2.webp', 'assets/img/activities/thank-you-3.webp', 'assets/img/activities/thank-you-4.webp']
  ];
  const ui = Object.assign({
    overviewTitle: m.title,
    objective: lbl.objective || 'Objective',
    target: lbl.target,
    venue: lbl.venue,
    readMore: 'Read more',
    showLess: 'Show less',
    openGuide: 'Open the full activity guide'
  }, m.cardLabels || {});

  const activityCards = m.activities.map((a, idx) => {
    const images = coverSets[idx] || [];
    return `
      <article class="activity-overview-card activity-accent-${idx % 4}">
        <button type="button" class="activity-card-link" data-activity-detail="activity-detail-${idx}" aria-label="${ui.openGuide}: ${a.name}">
          <span class="activity-cover" data-activity-carousel>
            <span class="activity-cover-track">
              ${images.map((src, imageIdx) => `<img src="${src}" alt="${a.name} ${imageIdx + 1}" loading="${idx < 2 && imageIdx === 0 ? 'eager' : 'lazy'}">`).join('')}
            </span>
            <span class="activity-cover-count">${String(idx + 1).padStart(2, '0')} / 04</span>
          </span>
          <span class="activity-card-title">${a.name.replace(/^\d+\.\s*/, '')}</span>
        </button>
        <div class="activity-card-summary">
          <div class="activity-summary-row"><h4>${ui.objective}</h4><p>${a.purpose}</p></div>
          <div class="activity-summary-row"><h4>${ui.target}</h4><ul>${a.target.map(t => `<li>${t}</li>`).join('')}</ul></div>
          <div class="activity-summary-row"><h4>${ui.venue}</h4><p>${a.venue}</p></div>
        </div>
        <button type="button" class="activity-expand-button" aria-expanded="false" aria-controls="activity-basic-${idx}" data-activity-expand>
          <span>${ui.readMore}</span><span class="activity-expand-chevron" aria-hidden="true"></span>
          <span class="activity-expand-tooltip" role="tooltip">${lbl.basic}</span>
        </button>
        <div class="activity-basic-panel" id="activity-basic-${idx}" hidden>
          <h4>${lbl.basic}</h4>
          <ol>${a.basicActivities.map(t => `<li>${t}</li>`).join('')}</ol>
        </div>
      </article>
    `;
  }).join('');

  const hasScheduleDetail = !!m.scheduleHeaders;
  const scheduleHeaders = Object.assign({ time: lbl.duration || 'Time', activity: lbl.schedule || 'Activity', inCharge: '', whatToDo: '' }, m.scheduleHeaders || {});

  const activities = m.activities.map((a, idx) => {
    const docs = localizedActivityDocs(a.resources);
    const recommendedItems = a.recommendedItems || (a.checklist ? a.checklist.map(t => ({ label: t, details: '' })) : []);
    const recommendedItemsLabel = lbl.recommendedItems || lbl.checklist || '';
    return `
      <div class="category-block activity-guide" id="activity-detail-${idx}">
        <div class="activity-guide-index">${String(idx + 1).padStart(2, '0')}</div>
        <h3 class="category-heading">${a.name.replace(/^\d+\.\s*/, '')}</h3>
        <p class="section-intro">${a.purpose}</p>
        <div class="highlight-grid activity-facts-grid">
          <div class="highlight-card"><h4>${lbl.venue}</h4><p>${a.venue}</p></div>
          <div class="highlight-card"><h4>${lbl.target}</h4><ul>${a.target.map(t => `<li>${t}</li>`).join('')}</ul></div>
          <div class="highlight-card"><h4>${lbl.minParticipants}</h4><p>${a.minParticipants}</p></div>
        </div>
        <h4 class="subsection-title">${lbl.target}</h4>
        <ul class="check-list">${a.target.map(t => `<li>${t}</li>`).join('')}</ul>
        <h4 class="subsection-title">${lbl.basic}</h4>
        <ul class="check-list">${a.basicActivities.map(t => `<li>${t}</li>`).join('')}</ul>
        <h4 class="subsection-title">${lbl.optional}</h4>
        <ul class="check-list">${a.optionalActivities.map(t => `<li>${t}</li>`).join('')}</ul>
        <h4 class="subsection-title">${lbl.schedule}</h4>
        <div class="activity-table-scroll">
          <table class="kubota-table activity-schedule-table">
            <thead><tr>
              <th>${scheduleHeaders.time}</th>
              <th>${scheduleHeaders.activity}</th>
              ${hasScheduleDetail ? `<th>${scheduleHeaders.inCharge}</th><th>${scheduleHeaders.whatToDo}</th>` : ''}
            </tr></thead>
            <tbody>${a.schedule.map(s => `<tr><td>${s.time}</td><td>${s.activity}</td>${hasScheduleDetail ? `<td>${s.inCharge || ''}</td><td>${s.whatToDo || ''}</td>` : ''}</tr>`).join('')}</tbody>
          </table>
        </div>
        <h4 class="subsection-title">${recommendedItemsLabel}</h4>
        <div class="activity-table-scroll">
          <table class="kubota-table activity-items-table"><tbody>
            ${recommendedItems.map(item => item.details ? `<tr><th>${item.label}</th><td>${item.details}</td></tr>` : `<tr><td colspan="2">${item.label}</td></tr>`).join('')}
          </tbody></table>
        </div>
        <div class="note-callout">${a.tip}</div>
        ${docs.length ? renderResourceList(docs) : ''}
      </div>
    `;
  }).join('');

  const { videos } = splitResources(m.resources);
  const videoBlock = videos.length ? `
    <div class="category-block">
      <h3 class="category-heading">${m.videosTitle}</h3>
      ${renderVideoGrid(videos)}
    </div>
  ` : '';

  return `
    <section>
      <h2 class="section-title">${m.title}</h2>
      <p class="section-intro">${m.intro}</p>
      <div class="marketing-hero-row">
        <div class="marketing-hero-track">
          ${['activity-row-1', 'activity-row-2', 'activity-row-3', 'activity-row-4'].map((name, i) => `
            <div class="marketing-hero-row-item">
              <img src="assets/img/marketing/${name}.jpg" alt="${m.title} ${i + 1}">
            </div>
          `).join('')}
          ${['activity-row-1', 'activity-row-2', 'activity-row-3', 'activity-row-4'].map((name, i) => `
            <div class="marketing-hero-row-item" aria-hidden="true">
              <img src="assets/img/marketing/${name}.jpg" alt="">
            </div>
          `).join('')}
        </div>
      </div>
      <div class="activity-overview">
        <div class="activity-overview-heading">
          <span class="activity-overview-eyebrow">KUBOTA ACTIVITY STANDARD</span>
          <h3>${ui.overviewTitle}</h3>
        </div>
        <div class="activity-overview-grid">${activityCards}</div>
      </div>
      <div class="activity-guides-heading"><span>${m.fullDetailsTitle || m.title}</span></div>
      ${activities}
      ${videoBlock}
      <div class="note-callout">${m.note}</div>
    </section>
  `;
}

let activityCarouselTimers = [];

function initActivityCards(c) {
  activityCarouselTimers.forEach(clearInterval);
  activityCarouselTimers = [];

  app.querySelectorAll('[data-activity-carousel]').forEach((carousel, carouselIdx) => {
    const track = carousel.querySelector('.activity-cover-track');
    const slides = Array.from(track.querySelectorAll('img'));
    if (slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let current = 0;
    const advance = () => {
      current = (current + 1) % slides.length;
      track.style.transform = `translateX(-${current * 100}%)`;
    };
    const timer = setInterval(advance, 4200 + carouselIdx * 450);
    activityCarouselTimers.push(timer);
  });

  app.querySelectorAll('[data-activity-expand]').forEach(button => {
    button.addEventListener('click', () => {
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      const isOpen = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!isOpen));
      panel.hidden = isOpen;
      const label = button.querySelector('span:first-child');
      const labels = c.marketing.cardLabels || {};
      label.textContent = isOpen ? (labels.readMore || 'Read more') : (labels.showLess || 'Show less');
    });
  });

  app.querySelectorAll('[data-activity-detail]').forEach(button => {
    button.addEventListener('click', () => {
      document.getElementById(button.dataset.activityDetail)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
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

function renderMaterialsGroup(group, downloadLabel) {
  const cards = group.items.map(item => `
    <div class="materials-card">
      <button type="button" class="materials-card-open" data-lightbox-src="${item.image.src}" data-lightbox-alt="${item.image.alt}" data-lightbox-caption="${item.title}">
        <span class="materials-card-img-wrap">
          <img src="${item.image.src}" alt="${item.image.alt}" loading="lazy">
        </span>
        <span class="materials-card-title">${item.title}</span>
        <span class="materials-card-tag">${item.format}</span>
      </button>
      ${group.downloadable ? `<a class="materials-card-download" href="${item.image.src}" download><span aria-hidden="true">⬇</span>${downloadLabel}</a>` : ''}
    </div>
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
  const groups = (mc.groups || []).map(g => renderMaterialsGroup(g, mc.downloadLabel)).join('');
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

/* ---------- Order: cart + catalog data ---------- */

const ORDER_CART_KEY = 'kukit_cart';
// Set this to the deployed Google Apps Script Web App URL (Option A backend)
// to start notifying sales reps on PO submission. Left empty, submitPoWebhook()
// is a silent no-op — migrating to Option B later is just swapping this URL.
const PO_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbydrktlXuRtS5Ja1BmEb0j47XV7xDLxck_nCANFRVLPdOwPkWIPw1y0Lw6fh4G_5RSvUw/exec';

function submitPoWebhook(payload) {
  if (!PO_WEBHOOK_URL) return;
  // text/plain avoids a CORS preflight that Apps Script Web Apps don't handle;
  // the payload is still valid JSON and is parsed as such server-side.
  fetch(PO_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  }).catch(err => console.error('PO webhook failed', err));
}

const ORDER_LIST_KEY = 'kukit_orders';
const ORDER_BUYER_KEY = 'kukit_buyer';
const ORDER_TRACKING_STAGE_KEYS = ['orderConfirmed', 'paymentReceived', 'production', 'shipped', 'customs', 'delivered'];

function orderLoadCart() {
  try { return JSON.parse(localStorage.getItem(ORDER_CART_KEY)) || []; } catch (e) { return []; }
}
function orderSaveCart(cart) { localStorage.setItem(ORDER_CART_KEY, JSON.stringify(cart)); }
function orderCartCount(cart) { return cart.reduce((n, i) => n + i.qty, 0); }
function orderCartTotal(cart) { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
function orderFmtUsd(n) { return '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function orderLoadBuyer() {
  try { return JSON.parse(localStorage.getItem(ORDER_BUYER_KEY)) || {}; } catch (e) { return {}; }
}
function orderSaveBuyer(buyer) { localStorage.setItem(ORDER_BUYER_KEY, JSON.stringify(buyer)); }

function orderAddToCart(item) {
  const cart = orderLoadCart();
  const existing = cart.find(i => i.key === item.key);
  if (existing) existing.qty += item.qty;
  else cart.push(item);
  orderSaveCart(cart);
  return cart;
}

function orderCartQtyFor(key) {
  const item = orderLoadCart().find(i => i.key === key);
  return item ? item.qty : 0;
}

function orderGenNumber(prefix) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-KUKIT-${ymd}-${rand}`;
}

function orderHashStage(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % ORDER_TRACKING_STAGE_KEYS.length;
}

function orderComputeStageIndex(order) {
  if (!order || !order.createdAt) return orderHashStage(String((order && order.poNumber) || Math.random()));
  const elapsed = Date.now() - order.createdAt;
  const demoTotalMs = 3 * 60 * 1000;
  const ratio = Math.min(1, Math.max(0, elapsed / demoTotalMs));
  return Math.min(ORDER_TRACKING_STAGE_KEYS.length - 1, Math.floor(ratio * ORDER_TRACKING_STAGE_KEYS.length));
}

let orderCatalogDataCache = null;
async function orderLoadCatalogData() {
  if (orderCatalogDataCache) return orderCatalogDataCache;
  const [parts, products] = await Promise.all([
    fetch('assets/data/parts-catalog.json', { cache: 'no-store' }).then(r => r.json()),
    fetch('assets/data/products-catalog.json', { cache: 'no-store' }).then(r => r.json())
  ]);
  orderCatalogDataCache = { parts, products };
  return orderCatalogDataCache;
}

function orderUpdateCartBar() {
  const bar = document.getElementById('order-cart-bar');
  if (!bar) return;
  const cart = orderLoadCart();
  const countEl = document.getElementById('order-cart-count');
  const totalEl = document.getElementById('order-cart-total');
  if (countEl) countEl.textContent = String(orderCartCount(cart));
  if (totalEl) totalEl.textContent = orderFmtUsd(orderCartTotal(cart));
  bar.classList.toggle('is-empty', cart.length === 0);

  const preview = document.getElementById('order-cart-preview');
  if (preview) {
    const removeLabel = (state.content && state.content.order && state.content.order.checkout.remove) || 'Remove';
    preview.innerHTML = cart.map((item, i) => `
      <div class="order-cart-preview-row">
        <span class="order-cart-preview-name">${item.name}${item.modelLabel ? ` <span class="order-row-model">(${item.modelLabel})</span>` : ''}</span>
        <span class="order-cart-preview-qty">× ${item.qty}</span>
        <span class="order-cart-preview-price">${orderFmtUsd(item.price * item.qty)}</span>
        <button type="button" class="order-cart-preview-remove" data-cart-preview-remove="${i}" aria-label="${removeLabel}">✕</button>
      </div>
    `).join('');
  }
}

/* ---------- Order: PDF generation (PO / PI) ---------- */

function pdfMoney(n) {
  return (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pdfItemsTable(doc, items, startY, marginX, pageW) {
  const colNo = marginX;
  const colDesc = marginX + 26;
  const colAmount = pageW - marginX;
  const colPrice = colAmount - 110;
  const colQty = colPrice - 100;
  let y = startY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('No.', colNo, y);
  doc.text('Description', colDesc, y);
  doc.text('Qty', colQty, y, { align: 'right' });
  doc.text('Unit Price (USD)', colPrice, y, { align: 'right' });
  doc.text('Amount (USD)', colAmount, y, { align: 'right' });
  y += 4;
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageW - marginX, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  let total = 0;
  items.forEach((item, i) => {
    const amount = item.price * item.qty;
    total += amount;
    const descLines = doc.splitTextToSize(item.name, colQty - 40 - colDesc);
    doc.text(String(i + 1), colNo, y);
    doc.text(descLines, colDesc, y);
    doc.text(String(item.qty), colQty, y, { align: 'right' });
    doc.text(pdfMoney(item.price), colPrice, y, { align: 'right' });
    doc.text(pdfMoney(amount), colAmount, y, { align: 'right' });
    y += Math.max(14, descLines.length * 11 + 3);
  });
  doc.line(marginX, y, pageW - marginX, y);
  y += 16;
  return { y, total };
}

function generatePoPdf(order) {
  if (!window.jspdf) { alert('PDF library failed to load.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 42;
  let y = 50;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PURCHASE ORDER', pageW / 2, y, { align: 'center' });
  y += 26;

  doc.setFontSize(10);
  doc.text(`PO No.: ${order.poNumber}`, marginX, y);
  doc.text(`Date: ${order.date}`, pageW - marginX, y, { align: 'right' });
  y += 22;

  doc.setFont('helvetica', 'bold');
  doc.text('Buyer:', marginX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(order.buyer.company || '-', marginX + 55, y);
  y += 14;
  doc.text(doc.splitTextToSize(order.buyer.address || '-', pageW - marginX * 2 - 55), marginX + 55, y);
  y += 14;
  doc.text(`Contact: ${order.buyer.contact || '-'}   Email: ${order.buyer.email || '-'}`, marginX + 55, y);
  y += 14;
  doc.text(`Tel / WhatsApp: ${order.buyer.phone || '-'}`, marginX + 55, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.text('Supplier:', marginX, y);
  doc.setFont('helvetica', 'normal');
  doc.text('Siam Kubota Corporation Co., Ltd.', marginX + 55, y);
  y += 14;
  doc.text('700/867 Amatanakorn Industrial Estate, Chonburi, Thailand', marginX + 55, y);
  y += 22;

  doc.text(`Payment Terms: ${order.paymentTermLabel}`, marginX, y);
  y += 14;
  doc.text(`Delivery Terms: CIF ${order.buyer.destination || '-'}`, marginX, y);
  y += 14;
  doc.text('Shipping Method: By Sea', marginX, y);
  y += 22;

  const { y: afterTable, total } = pdfItemsTable(doc, order.items, y, marginX, pageW);
  y = afterTable;

  doc.setFont('helvetica', 'bold');
  doc.text('Sub-Total (USD):', pageW - marginX - 170, y);
  doc.text(pdfMoney(total), pageW - marginX, y, { align: 'right' });
  y += 16;
  doc.text('Grand Total (USD):', pageW - marginX - 170, y);
  doc.text(pdfMoney(total), pageW - marginX, y, { align: 'right' });
  y += 30;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  [
    'Important — all documents and invoices must be marked with:',
    '1. Purchase Order No.   2. Consignee address as stated above',
    '3. Invoice copy enclosed with goods, signed and stamped   4. Certificate of Origin sent by email and original'
  ].forEach(line => { doc.text(line, marginX, y); y += 13; });
  y += 20;
  doc.text('Prepared by: ___________________________', marginX, y);
  doc.text('Date: ___________________________', pageW - marginX - 160, y);

  y += 40;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Demo document generated by the KU-KIT prototype ordering tool. Not a real purchase order.', marginX, y);

  doc.save(`${order.poNumber}.pdf`);
}

function generatePiPdf(order) {
  if (!window.jspdf) { alert('PDF library failed to load.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 42;
  const buyer = order.buyer || {};
  const destination = buyer.country || buyer.destination || '-';
  const consignee = order.consignee ? order.consignee : null;
  let y = 50;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PROFORMA INVOICE', pageW / 2, y, { align: 'center' });
  y += 26;

  // Follows the real Siam Kubota PI field layout (Invoice No. / Consigned to /
  // Buyer / Sales Confirmation No. / Buyer's Order No. / Shipped Per / On or
  // About / Port of Loading / Port of Discharge / Terms of Payment / Place of
  // Delivery / Country of Origin) so the fields match what customs and banks
  // expect to see, even though this is still a KU-KIT prototype output.
  doc.setFontSize(10);
  doc.text(`Invoice No.: ${order.piNumber}`, marginX, y);
  doc.text(`Date: ${order.date}`, pageW - marginX, y, { align: 'right' });
  y += 16;
  doc.text('Sales Confirmation No.: (issued after order confirmation)', marginX, y);
  y += 16;
  doc.text(`Buyer's Order No.: ${buyer.customerRef || '-'}`, marginX, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.text('Consigned to Messrs.:', marginX, y);
  doc.text('Buyer:', pageW / 2 + 6, y);
  doc.setFont('helvetica', 'normal');
  y += 14;
  const colW = pageW / 2 - marginX - 10;
  doc.text(doc.splitTextToSize(consignee || buyer.company || '-', colW), marginX, y);
  doc.text(doc.splitTextToSize(buyer.company || '-', colW), pageW / 2 + 6, y);
  y += 14;
  doc.text(doc.splitTextToSize(buyer.address || '-', colW), pageW / 2 + 6, y);
  y += 30;

  doc.text(`Shipping Marks & Nos.: ${buyer.company || '-'} / DIESEL ENGINE / POWER TILLER AND IMPLEMENTS`, marginX, y);
  y += 18;

  doc.text(`Shipped Per: ${order.shippedPer || 'By Sea'}`, marginX, y);
  doc.text(`On or About: ${order.deliveryDate || '-'}`, pageW / 2 + 6, y);
  y += 14;
  doc.text(`Port of Loading: ${order.portOfLoading || 'Any port'}`, marginX, y);
  doc.text(`Port of Discharge: ${order.port || destination}`, pageW / 2 + 6, y);
  y += 14;
  doc.text(`Place of Delivery: ${destination}`, marginX, y);
  doc.text('Country of Origin: Thailand', pageW / 2 + 6, y);
  y += 14;
  doc.text(`Terms of Payment: ${order.paymentTermLabel || '-'}`, marginX, y);
  y += 22;

  const { y: afterTable, total } = pdfItemsTable(doc, order.items, y, marginX, pageW);
  y = afterTable;

  doc.setFont('helvetica', 'bold');
  doc.text(`*** TOTAL ${order.incotermCode || 'CIF'} ${order.port || destination} ***`, marginX, y);
  doc.text(pdfMoney(total), pageW - marginX, y, { align: 'right' });
  y += 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Packing List: Per Carton', marginX, y);
  doc.text('Bank Detail:', pageW / 2 + 6, y);
  y += 13;
  doc.setFont('helvetica', 'normal');
  doc.text('N.W. ___ KGS.   G.W. ___ KGS.', marginX, y);
  doc.text('MIZUHO BANK, LTD.', pageW / 2 + 6, y);
  y += 13;
  doc.text('Dimension ___ CMS.   Total ___ Cartons', marginX, y);
  doc.text('Account No.: F15-764-917686   Swift: MHCBTHBKXXX', pageW / 2 + 6, y);
  y += 13;
  doc.text('A/C Name: Siam Kubota Corporation Co., Ltd.', pageW / 2 + 6, y);
  y += 26;

  doc.text('E. & O.E.                                                    Origin of Thailand', marginX, y);
  y += 30;
  doc.text('(Authorized Signature)', pageW - marginX - 150, y);
  doc.text('Siam Kubota Corporation Co., Ltd.', pageW - marginX - 150, y + 13);

  y += 46;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Demo document generated by the KU-KIT prototype ordering tool. Not a real invoice.', marginX, y);

  doc.save(`${order.piNumber}.pdf`);
}

/* ---------- Order: page selector ---------- */

function renderOrderSelector(c, active) {
  const t = c.order.tabs;
  const card = (key, label, icon) => `
    <button type="button" class="product-select-card ${active === key ? 'active' : ''}" data-subnav="order-${key}">
      <span class="product-select-icon"><span class="product-select-icon-emoji">${icon}</span></span>
      <span class="product-select-label">${label}</span>
      <span class="product-select-check" aria-hidden="true">✓</span>
    </button>
  `;
  return `
    <div class="product-selector">
      ${card('catalog', t.catalog, '🛒')}
      ${card('checkout', t.checkout, '📄')}
      ${card('tracking', t.tracking, '🚚')}
    </div>
  `;
}

/* ---------- Order: catalog & cart page ---------- */

function renderOrderCatalog(c) {
  const o = c.order;
  const oc = o.catalog;
  return `
    <section>
      <h2 class="section-title">${o.title}</h2>
      <p class="section-intro">${o.intro}</p>
      ${renderOrderSelector(c, 'catalog')}
      <div class="order-cart-bar is-empty" id="order-cart-bar">
        <button type="button" class="order-cart-bar-toggle" id="order-cart-bar-toggle" aria-expanded="false">
          <span class="order-cart-bar-icon" aria-hidden="true">🛒</span>
          <span class="order-cart-bar-count" id="order-cart-count">0</span>
          <span class="order-cart-bar-label">${oc.cartHeading}</span>
          <span class="order-cart-bar-caret" aria-hidden="true">▾</span>
        </button>
        <span class="order-cart-bar-total" id="order-cart-total">$0.00</span>
        <button type="button" class="order-btn order-cart-bar-btn" id="order-cart-checkout-btn">${oc.goCheckout}</button>
      </div>
      <div class="order-cart-preview" id="order-cart-preview" hidden></div>
      <div class="order-model-picker">
        <label class="order-model-label" for="order-model-select">${oc.modelLabel}</label>
        <select id="order-model-select" class="order-model-select"></select>
      </div>
      <div id="order-catalog-body" class="order-catalog-body">
        <div class="order-loading">${oc.loading}</div>
      </div>
      <div class="note-callout">${oc.priceNote}</div>
    </section>
  `;
}

async function initOrderCatalogPage(c) {
  const oc = c.order.catalog;
  const select = document.getElementById('order-model-select');
  const body = document.getElementById('order-catalog-body');
  const checkoutBtn = document.getElementById('order-cart-checkout-btn');
  if (checkoutBtn) checkoutBtn.addEventListener('click', () => navigate('order-checkout'));

  let catalogReady = false;
  const cartBarToggle = document.getElementById('order-cart-bar-toggle');
  const cartPreview = document.getElementById('order-cart-preview');
  if (cartBarToggle && cartPreview) {
    cartBarToggle.addEventListener('click', () => {
      const expanded = cartBarToggle.getAttribute('aria-expanded') === 'true';
      cartBarToggle.setAttribute('aria-expanded', String(!expanded));
      cartPreview.hidden = expanded;
    });
    cartPreview.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-cart-preview-remove]');
      if (!removeBtn) return;
      const cart = orderLoadCart();
      cart.splice(Number(removeBtn.dataset.cartPreviewRemove), 1);
      orderSaveCart(cart);
      orderUpdateCartBar();
      if (catalogReady) renderBody();
    });
  }

  orderUpdateCartBar();

  let data;
  try {
    data = await orderLoadCatalogData();
  } catch (e) {
    body.innerHTML = `<div class="order-loading">Failed to load catalog data.</div>`;
    return;
  }
  if (state.route !== 'order-catalog') return;

  const { parts, products } = data;
  catalogReady = true;

  select.innerHTML = parts.models.map(m => `<option value="${m.id}">${m.label}</option>`).join('');

  let currentGroupFilter = 'ALL';
  let currentSearch = '';
  const GROUP_ORDER = ['X', 'S', 'A', 'B', 'C'];

  function findProduct(modelId) {
    return products.engines.find(p => p.id === modelId) || products.tillers.find(p => p.id === modelId);
  }

  function renderBody() {
    const modelId = select.value;
    const model = parts.models.find(m => m.id === modelId);
    const product = findProduct(modelId);
    const isTiller = !!products.tillers.find(p => p.id === modelId);

    const productCartQty = product ? orderCartQtyFor(`product:${product.id}`) : 0;
    const productCardHtml = product ? `
      <div class="category-block">
        <h3 class="category-heading">${oc.productHeading}</h3>
        <div class="order-product-card">
          <div class="order-product-info">
            <div class="order-product-name">${product.label}</div>
            <div class="order-product-price">${orderFmtUsd(product.basePrice)} <span class="order-price-tag">(${product.priceSource})</span></div>
          </div>
          <div class="order-product-actions">
            <input type="number" min="1" value="1" class="order-qty-input" id="order-product-qty">
            <button type="button" class="order-btn order-add-btn ${productCartQty ? 'is-added' : ''}" data-add-product="1">${productCartQty ? `✓ ${oc.added} (${productCartQty})` : oc.addToCart}</button>
          </div>
        </div>
      </div>
    ` : '';

    const implementsHtml = isTiller && products.implements.length ? `
      <div class="category-block">
        <h3 class="category-heading">${oc.implementsHeading}</h3>
        <div class="order-implements-grid">
          ${products.implements.map(imp => {
            const q = orderCartQtyFor(`implement:${imp.id}`);
            return `
            <div class="order-implement-card">
              <div class="order-implement-name">${imp.label}</div>
              <div class="order-implement-price">${orderFmtUsd(imp.basePrice)}</div>
              <div class="order-product-actions">
                <input type="number" min="1" value="1" class="order-qty-input" id="order-implement-qty-${imp.id}">
                <button type="button" class="order-add-btn-small ${q ? 'is-added' : ''}" data-add-implement="${imp.id}">${q ? `✓ ${oc.added} (${q})` : oc.addToCart}</button>
              </div>
            </div>
          `;
          }).join('')}
        </div>
      </div>
    ` : '';

    const firstLotHtml = model.firstLot.length ? `
      <div class="category-block">
        <h3 class="category-heading">${oc.firstLotHeading}</h3>
        <p class="section-intro">${oc.firstLotIntro}</p>
        <div class="order-firstlot-grid">
          ${model.firstLot.map(item => {
            const q = orderCartQtyFor(`part:${modelId}:${item.partNo}`);
            return `
            <div class="order-firstlot-card">
              ${item.image ? `<div class="order-firstlot-img-wrap"><img class="order-firstlot-img" src="${item.image}" alt="${item.name}"></div>` : ''}
              <div class="order-firstlot-name">${item.name}</div>
              <div class="order-firstlot-fn">${item.fn}</div>
              <div class="order-firstlot-meta">
                <span class="order-firstlot-code">${item.partNo}</span>
                <span class="order-firstlot-price">${orderFmtUsd(item.price)}</span>
              </div>
              <div class="order-product-actions">
                <input type="number" min="1" value="${item.suggestQty || 1}" class="order-qty-input" id="order-fl-qty-${item.partNo}">
                <button type="button" class="order-add-btn-small ${q ? 'is-added' : ''}" data-add-part="${item.partNo}" data-part-kind="firstlot">${q ? `✓ ${oc.added} (${q})` : oc.addToCart}</button>
              </div>
            </div>
          `;
          }).join('')}
        </div>
      </div>
    ` : '';

    const groupChips = `
      <button type="button" class="order-group-chip ${currentGroupFilter === 'ALL' ? 'active' : ''}" data-group-filter="ALL">${oc.groupAll}</button>
      ${GROUP_ORDER.map(g => `<button type="button" class="order-group-chip ${currentGroupFilter === g ? 'active' : ''}" data-group-filter="${g}">${oc.groupLabels[g] || g}</button>`).join('')}
    `;

    const filteredCatalog = model.catalog.filter(item => {
      if (item.group === 'D') return currentGroupFilter === 'D';
      if (currentGroupFilter !== 'ALL' && item.group !== currentGroupFilter) return false;
      if (currentSearch) {
        const q = currentSearch.toLowerCase();
        if (!item.partNo.toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const catalogRows = filteredCatalog.map(item => {
      const q = orderCartQtyFor(`part:${modelId}:${item.partNo}`);
      return `
      <tr>
        <td class="code-col">${item.partNo}</td>
        <td>${item.name}</td>
        <td>${oc.groupLabels[item.group] || item.group}</td>
        <td>${orderFmtUsd(item.price)}</td>
        <td>
          <div class="order-table-actions">
            <input type="number" min="1" value="1" class="order-qty-input order-qty-input-sm" id="order-cat-qty-${item.partNo}">
            <button type="button" class="order-add-btn-small ${q ? 'is-added' : ''}" data-add-part="${item.partNo}" data-part-kind="catalog">${q ? `✓ ${oc.added} (${q})` : oc.addToCart}</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');

    const fullCatalogHtml = `
      <div class="category-block">
        <h3 class="category-heading">${oc.fullCatalogHeading}</h3>
        <p class="section-intro">${oc.fullCatalogIntro}</p>
        <div class="order-group-filters">${groupChips}</div>
        <input type="text" class="order-search-input" id="order-search-input" placeholder="${oc.searchPlaceholder}" value="${currentSearch.replace(/"/g, '&quot;')}">
        <div class="order-table-scroll">
          <table class="kubota-table order-parts-table">
            <thead>
              <tr>
                <th>${oc.colPartNo}</th>
                <th>${oc.colName}</th>
                <th>${oc.colGroup}</th>
                <th>${oc.colPrice}</th>
                <th>${oc.colAction}</th>
              </tr>
            </thead>
            <tbody>${catalogRows || `<tr><td colspan="5" class="order-empty-row">—</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;

    body.innerHTML = productCardHtml + implementsHtml + firstLotHtml + fullCatalogHtml;

    const productBtn = body.querySelector('[data-add-product]');
    if (productBtn) {
      productBtn.addEventListener('click', () => {
        const qtyInput = document.getElementById('order-product-qty');
        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        orderAddToCart({ key: `product:${product.id}`, kind: 'product', modelId: product.id, code: product.id, name: product.label, price: product.basePrice, qty });
        orderUpdateCartBar();
        renderBody();
      });
    }

    body.querySelectorAll('[data-add-implement]').forEach(btn => {
      btn.addEventListener('click', () => {
        const impId = btn.dataset.addImplement;
        const imp = products.implements.find(x => x.id === impId);
        const qtyInput = document.getElementById(`order-implement-qty-${impId}`);
        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        orderAddToCart({ key: `implement:${impId}`, kind: 'implement', modelId: null, code: impId, name: imp.label, price: imp.basePrice, qty });
        orderUpdateCartBar();
        renderBody();
      });
    });

    body.querySelectorAll('[data-add-part]').forEach(btn => {
      btn.addEventListener('click', () => {
        const partNo = btn.dataset.addPart;
        const kindTag = btn.dataset.partKind;
        const source = kindTag === 'firstlot' ? model.firstLot : model.catalog;
        const partItem = source.find(x => x.partNo === partNo);
        if (!partItem) return;
        const qtyInputId = kindTag === 'firstlot' ? `order-fl-qty-${partNo}` : `order-cat-qty-${partNo}`;
        const qtyInput = document.getElementById(qtyInputId);
        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        orderAddToCart({ key: `part:${modelId}:${partNo}`, kind: 'part', modelId, modelLabel: model.label, code: partNo, name: partItem.name, price: partItem.price || 0, qty });
        orderUpdateCartBar();
        renderBody();
      });
    });

    body.querySelectorAll('[data-group-filter]').forEach(btn => {
      btn.addEventListener('click', () => { currentGroupFilter = btn.dataset.groupFilter; renderBody(); });
    });

    const searchInput = document.getElementById('order-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        currentSearch = searchInput.value;
        const selStart = searchInput.selectionStart;
        renderBody();
        const newInput = document.getElementById('order-search-input');
        if (newInput) { newInput.focus(); newInput.setSelectionRange(selStart, selStart); }
      });
    }
  }

  select.addEventListener('change', () => { currentGroupFilter = 'ALL'; currentSearch = ''; renderBody(); });
  renderBody();
}

/* ---------- Order: checkout page ---------- */

function renderOrderCheckout(c) {
  const o = c.order;
  return `
    <section>
      <h2 class="section-title">${o.title}</h2>
      <p class="section-intro">${o.intro}</p>
      ${renderOrderSelector(c, 'checkout')}
      <div id="order-checkout-body" class="order-checkout-body"></div>
    </section>
  `;
}

function initOrderCheckoutPage(c) {
  const co = c.order.checkout;
  const catLabels = c.order.catalog;
  const body = document.getElementById('order-checkout-body');

  if (!orderLoadCart().length) {
    body.innerHTML = `
      <div class="order-empty-state">
        <p>${co.emptyHeading}</p>
        <p class="order-empty-body">${co.emptyBody}</p>
        <button type="button" class="order-btn" id="order-back-catalog-btn">${co.backToCatalog}</button>
      </div>
    `;
    document.getElementById('order-back-catalog-btn').addEventListener('click', () => navigate('order-catalog'));
    return;
  }

  let paymentTerms = [];
  let selectedTermId = null;

  function renderCartTable() {
    const cart = orderLoadCart();
    const rows = cart.map((item, i) => `
      <tr>
        <td>${item.name}${item.modelLabel ? ` <span class="order-row-model">(${item.modelLabel})</span>` : ''}</td>
        <td class="order-num-col"><input type="number" min="1" value="${item.qty}" class="order-qty-input order-qty-input-sm" data-cart-qty="${i}"></td>
        <td class="order-num-col">${orderFmtUsd(item.price)}</td>
        <td class="order-num-col">${orderFmtUsd(item.price * item.qty)}</td>
        <td><button type="button" class="order-remove-btn" data-cart-remove="${i}">${co.remove}</button></td>
      </tr>
    `).join('');
    return `
      <div class="order-table-scroll">
        <table class="kubota-table order-cart-table">
          <thead><tr><th>${catLabels.colName}</th><th>${co.colQty}</th><th>${co.colUnitPrice}</th><th>${co.colAmount}</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="order-cart-subtotal">${co.subtotal}: <strong>${orderFmtUsd(orderCartTotal(cart))}</strong></div>
    `;
  }

  function wireCartTableEvents() {
    const wrap = document.getElementById('order-cart-table-wrap');
    wrap.querySelectorAll('[data-cart-qty]').forEach(input => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.cartQty);
        const cart = orderLoadCart();
        cart[idx].qty = Math.max(1, parseInt(input.value, 10) || 1);
        orderSaveCart(cart);
        orderUpdateCartBar();
        refreshCartAndPayment();
      });
    });
    wrap.querySelectorAll('[data-cart-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.cartRemove);
        const cart = orderLoadCart();
        cart.splice(idx, 1);
        orderSaveCart(cart);
        orderUpdateCartBar();
        if (!cart.length) { initOrderCheckoutPage(c); return; }
        refreshCartAndPayment();
      });
    });
  }

  function refreshCartAndPayment() {
    document.getElementById('order-cart-table-wrap').innerHTML = renderCartTable();
    wireCartTableEvents();
    renderPaymentSection();
  }

  function renderPaymentSection() {
    const el = document.getElementById('order-payment-section');
    if (!el || !paymentTerms.length) return;
    const cart = orderLoadCart();
    el.innerHTML = `
      <div class="order-table-scroll">
        <table class="kubota-table order-price-table">
          <thead><tr><th></th><th>${co.colTerm}</th><th>${co.colTotal}</th></tr></thead>
          <tbody>
            ${paymentTerms.map(term => {
              const total = cart.reduce((s, i) => s + (i.kind === 'part' ? i.price : i.price * term.premium) * i.qty, 0);
              return `
                <tr class="${selectedTermId === term.id ? 'is-selected' : ''}">
                  <td><input type="radio" name="order-payment-term" value="${term.id}" ${selectedTermId === term.id ? 'checked' : ''}></td>
                  <td>${term.label}</td>
                  <td class="order-num-col">${orderFmtUsd(total)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    el.querySelectorAll('input[name="order-payment-term"]').forEach(radio => {
      radio.addEventListener('change', () => { selectedTermId = radio.value; renderPaymentSection(); });
    });
  }

  body.innerHTML = `
    <div class="order-step-card">
      <h3 class="order-step-title">${co.step1Title}</h3>
      <div class="order-buyer-form" id="order-buyer-form"></div>
    </div>
    <div class="order-step-card">
      <h3 class="order-step-title">${co.step2Title}</h3>
      <div id="order-cart-table-wrap">${renderCartTable()}</div>
    </div>
    <div class="order-step-card">
      <h3 class="order-step-title">${co.step3Title}</h3>
      <p class="section-intro">${co.step3Body}</p>
      <button type="button" class="order-btn" id="order-generate-po-btn">${co.generatePo}</button>
    </div>
    <div class="order-step-card">
      <h3 class="order-step-title">${co.step4Title}</h3>
      <p class="section-intro">${co.step4Body}</p>
      <div id="order-payment-section"><div class="order-loading">${catLabels.loading}</div></div>
    </div>
    <div class="order-step-card">
      <h3 class="order-step-title">${co.step5Title}</h3>
      <p class="section-intro">${co.step5Body}</p>
      <button type="button" class="order-btn" id="order-generate-pi-btn">${co.generatePi}</button>
    </div>
    <div class="order-step-card">
      <h3 class="order-step-title">${co.step6Title}</h3>
      <p class="section-intro">${co.confirmBody}</p>
      <button type="button" class="order-btn order-confirm-btn" id="order-confirm-btn">${co.confirmBtn}</button>
    </div>
    <div class="note-callout">${co.disclaimer}</div>
  `;

  const buyer = orderLoadBuyer();
  const buyerForm = document.getElementById('order-buyer-form');
  const fieldDefs = [
    ['company', co.fields.company, 'text'],
    ['address', co.fields.address, 'text'],
    ['contact', co.fields.contact, 'text'],
    ['email', co.fields.email, 'email'],
    ['phone', co.fields.phone, 'text'],
    ['destination', co.fields.destination, 'text']
  ];
  buyerForm.innerHTML = fieldDefs.map(([key, label, type]) =>
    `<label>${label}<input type="${type}" id="order-buyer-${key}" value="${(buyer[key] || '').replace(/"/g, '&quot;')}"></label>`
  ).join('');
  fieldDefs.forEach(([key]) => {
    document.getElementById(`order-buyer-${key}`).addEventListener('input', (e) => {
      const b = orderLoadBuyer();
      b[key] = e.target.value;
      orderSaveBuyer(b);
    });
  });

  wireCartTableEvents();

  document.getElementById('order-generate-po-btn').addEventListener('click', () => {
    const cart = orderLoadCart();
    const poNumber = orderGenNumber('PO');
    generatePoPdf({
      poNumber,
      date: new Date().toLocaleDateString('en-GB'),
      buyer: orderLoadBuyer(),
      items: cart,
      paymentTermLabel: selectedTermId ? paymentTerms.find(t => t.id === selectedTermId).label : (paymentTerms[0] ? paymentTerms[0].label : 'T/T in Advance')
    });
    sessionStorage.setItem('kukit_last_po', poNumber);
  });

  document.getElementById('order-generate-pi-btn').addEventListener('click', () => {
    if (!selectedTermId) { alert(co.requirePayment); return; }
    const cart = orderLoadCart();
    const term = paymentTerms.find(t => t.id === selectedTermId);
    const piNumber = orderGenNumber('PI');
    generatePiPdf({
      piNumber,
      date: new Date().toLocaleDateString('en-GB'),
      buyer: orderLoadBuyer(),
      items: cart.map(i => ({ ...i, price: i.kind === 'part' ? i.price : i.price * term.premium })),
      paymentTermLabel: term.label
    });
    sessionStorage.setItem('kukit_last_pi', piNumber);
  });

  document.getElementById('order-confirm-btn').addEventListener('click', () => {
    const cart = orderLoadCart();
    if (!cart.length) return;
    const term = selectedTermId ? paymentTerms.find(t => t.id === selectedTermId) : paymentTerms[0];
    const poNumber = sessionStorage.getItem('kukit_last_po') || orderGenNumber('PO');
    const piNumber = sessionStorage.getItem('kukit_last_pi') || orderGenNumber('PI');
    const total = cart.reduce((s, i) => s + (i.kind === 'part' ? i.price : i.price * term.premium) * i.qty, 0);
    const orders = JSON.parse(localStorage.getItem(ORDER_LIST_KEY) || '[]');
    orders.push({ poNumber, piNumber, buyer: orderLoadBuyer(), items: cart, paymentTermId: term.id, paymentTermLabel: term.label, total, createdAt: Date.now() });
    localStorage.setItem(ORDER_LIST_KEY, JSON.stringify(orders));
    orderSaveCart([]);
    sessionStorage.removeItem('kukit_last_po');
    sessionStorage.removeItem('kukit_last_pi');
    orderUpdateCartBar();

    body.innerHTML = `
      <div class="order-confirmed-card">
        <h3>${co.confirmedTitle}</h3>
        <p>${co.confirmedBody} <strong>${poNumber}</strong></p>
        <button type="button" class="order-btn" id="order-goto-tracking-btn">${co.goTracking}</button>
      </div>
    `;
    document.getElementById('order-goto-tracking-btn').addEventListener('click', () => {
      sessionStorage.setItem('kukit_prefill_tracking', poNumber);
      navigate('order-tracking');
    });
  });

  orderLoadCatalogData().then(data => {
    if (state.route !== 'order-checkout') return;
    paymentTerms = data.products.paymentTerms;
    selectedTermId = paymentTerms[0].id;
    renderPaymentSection();
  });
}

/* ---------- Order: tracking page ---------- */

function renderOrderTracking(c) {
  const o = c.order;
  const tr = o.tracking;
  return `
    <section>
      <h2 class="section-title">${o.title}</h2>
      <p class="section-intro">${o.intro}</p>
      ${renderOrderSelector(c, 'tracking')}
      <div class="order-tracking-search">
        <label for="order-tracking-input">${tr.poInputLabel}</label>
        <div class="order-tracking-search-row">
          <input type="text" id="order-tracking-input" placeholder="PO-KUKIT-...">
          <button type="button" class="order-btn" id="order-tracking-btn">${tr.lookupBtn}</button>
        </div>
      </div>
      <div id="order-tracking-recent" class="order-tracking-recent"></div>
      <div id="order-tracking-result" class="order-tracking-result"></div>
      <div class="note-callout">${tr.disclaimer}</div>
    </section>
  `;
}

function orderRenderProgress(order, stageIdx, tr, notFound) {
  const steps = ORDER_TRACKING_STAGE_KEYS.map((key, i) => `
    <div class="order-tracking-step ${i <= stageIdx ? 'is-done' : ''} ${i === stageIdx ? 'is-current' : ''}">
      <div class="order-tracking-dot">${i < stageIdx ? '✓' : i + 1}</div>
      <div class="order-tracking-step-label">${tr.stages[key]}</div>
    </div>
  `).join('<div class="order-tracking-connector"></div>');

  return `
    ${notFound ? `<div class="order-tracking-note">${tr.notFoundNote}</div>` : ''}
    <div class="order-tracking-summary">
      <div><strong>${order.poNumber || '—'}</strong>${order.piNumber ? ` / ${order.piNumber}` : ''}</div>
      ${order.paymentTermLabel ? `<div class="order-tracking-meta">${order.paymentTermLabel}</div>` : ''}
    </div>
    <div class="order-tracking-progress">${steps}</div>
  `;
}

function initOrderTrackingPage(c) {
  const tr = c.order.tracking;
  const input = document.getElementById('order-tracking-input');
  const btn = document.getElementById('order-tracking-btn');
  const recentEl = document.getElementById('order-tracking-recent');
  const resultEl = document.getElementById('order-tracking-result');

  const orders = JSON.parse(localStorage.getItem(ORDER_LIST_KEY) || '[]');

  if (orders.length) {
    recentEl.innerHTML = `
      <div class="order-tracking-recent-label">${tr.recentHeading}</div>
      <div class="order-tracking-recent-chips">
        ${orders.slice(-5).reverse().map(o => `<button type="button" class="order-tracking-chip" data-track-po="${o.poNumber}">${o.poNumber}</button>`).join('')}
      </div>
    `;
    recentEl.querySelectorAll('[data-track-po]').forEach(chip => {
      chip.addEventListener('click', () => { input.value = chip.dataset.trackPo; lookup(); });
    });
  }

  function lookup() {
    const q = input.value.trim();
    if (!q) return;
    const found = orders.find(o => o.poNumber === q || o.piNumber === q);
    if (found) {
      resultEl.innerHTML = orderRenderProgress(found, orderComputeStageIndex(found), tr, false);
    } else {
      resultEl.innerHTML = orderRenderProgress({ poNumber: q }, orderHashStage(q), tr, true);
    }
  }

  btn.addEventListener('click', lookup);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup(); });

  // Not cleared here: navigate() triggers both an immediate render and an async
  // hashchange-driven re-render, which re-runs this init a second time. Leaving
  // the key in place keeps the prefill idempotent across that double render
  // instead of losing it on the second pass. sessionStorage clears on tab close.
  const prefill = sessionStorage.getItem('kukit_prefill_tracking');
  if (prefill) {
    input.value = prefill;
    lookup();
  }
}

/* ---------- PO Request (standardized dealer/distributor purchase order) ---------- */

function renderPoRequest(c) {
  const pr = c.poRequest;
  return `
    <section>
      <h2 class="section-title">${pr.title}</h2>
      <p class="section-intro">${pr.intro}</p>
      <div class="note-callout">${pr.disclaimer}</div>
      <div id="po-request-body" class="po-request-body"></div>
    </section>
  `;
}

function poReqFmtUsd(n) { return orderFmtUsd(n); }

function initPoRequestPage(c) {
  const pr = c.poRequest;
  const body = document.getElementById('po-request-body');

  let catalogModels = [];
  let paymentTerms = [];
  let items = [{ modelId: '', qty: 1 }];
  let selectedTermId = null;
  let piWanted = null;

  function customerFieldsHtml() {
    const cust = pr.customer;
    const known = cust.knownCustomers || [];
    const saved = orderLoadBuyer();
    return `
      <label class="po-req-field">
        <span>${cust.selectLabel}</span>
        <select id="po-req-known-customer">
          <option value="">${cust.newCustomerOption}</option>
          ${known.map(k => `<option value="${k.id}">${k.label}</option>`).join('')}
        </select>
      </label>
      <p class="po-req-hint">${cust.autoFillNote}</p>
      <div class="po-req-field-grid">
        <label class="po-req-field"><span>${cust.fields.company}</span><input type="text" id="po-req-company" value="${(saved.company || '').replace(/"/g, '&quot;')}"></label>
        <label class="po-req-field"><span>${cust.fields.country}</span><input type="text" id="po-req-country" value="${(saved.country || '').replace(/"/g, '&quot;')}"></label>
        <label class="po-req-field po-req-field--wide"><span>${cust.fields.address}</span><input type="text" id="po-req-address" value="${(saved.address || '').replace(/"/g, '&quot;')}"></label>
        <label class="po-req-field"><span>${cust.fields.contact}</span><input type="text" id="po-req-contact" value="${(saved.contact || '').replace(/"/g, '&quot;')}"></label>
        <label class="po-req-field"><span>${cust.fields.email}</span><input type="email" id="po-req-email" value="${(saved.email || '').replace(/"/g, '&quot;')}"></label>
        <label class="po-req-field"><span>${cust.fields.phone}</span><input type="text" id="po-req-phone" value="${(saved.phone || '').replace(/"/g, '&quot;')}"></label>
        <label class="po-req-field"><span>${cust.fields.customerRef}</span><input type="text" id="po-req-customer-ref" value="${(saved.customerRef || '').replace(/"/g, '&quot;')}"></label>
      </div>
    `;
  }

  function wireCustomerFields() {
    const keys = ['company', 'address', 'country', 'contact', 'email', 'phone', 'customerRef'];
    keys.forEach(key => {
      const el = document.getElementById(`po-req-${key === 'customerRef' ? 'customer-ref' : key}`);
      el.addEventListener('input', () => {
        const b = orderLoadBuyer();
        b[key] = el.value;
        orderSaveBuyer(b);
      });
    });
    document.getElementById('po-req-known-customer').addEventListener('change', (e) => {
      const known = (pr.customer.knownCustomers || []).find(k => k.id === e.target.value);
      if (!known) return;
      const map = { company: known.company, address: known.address, country: known.country, contact: known.contact, email: known.email, phone: known.phone };
      const b = orderLoadBuyer();
      Object.keys(map).forEach(key => {
        document.getElementById(`po-req-${key}`).value = map[key] || '';
        b[key] = map[key] || '';
      });
      orderSaveBuyer(b);
    });
  }

  function currentBuyer() {
    return {
      company: document.getElementById('po-req-company').value,
      address: document.getElementById('po-req-address').value,
      country: document.getElementById('po-req-country').value,
      contact: document.getElementById('po-req-contact').value,
      email: document.getElementById('po-req-email').value,
      phone: document.getElementById('po-req-phone').value,
      customerRef: document.getElementById('po-req-customer-ref').value
    };
  }

  function modelPrice(modelId) {
    const m = catalogModels.find(x => x.id === modelId);
    return m ? m.basePrice : 0;
  }

  function termPremium() {
    const term = paymentTerms.find(t => t.id === selectedTermId);
    return term ? term.premium : 1;
  }

  function itemsTableHtml() {
    const it = pr.items;
    const premium = termPremium();
    const rows = items.map((row, i) => {
      const unit = modelPrice(row.modelId) * premium;
      const amount = unit * (row.qty || 0);
      return `
        <tr>
          <td>
            <select class="order-model-inline-select" data-item-model="${i}">
              <option value="">${it.modelLabel}</option>
              ${catalogModels.map(m => `<option value="${m.id}" ${m.id === row.modelId ? 'selected' : ''}>${m.label}</option>`).join('')}
            </select>
          </td>
          <td class="order-num-col"><input type="number" min="1" value="${row.qty}" class="order-qty-input order-qty-input-sm" data-item-qty="${i}"></td>
          <td class="order-num-col">${row.modelId ? poReqFmtUsd(unit) : '—'}</td>
          <td class="order-num-col">${row.modelId ? poReqFmtUsd(amount) : '—'}</td>
          <td><button type="button" class="order-remove-btn" data-item-remove="${i}">${it.removeLine}</button></td>
        </tr>
      `;
    }).join('');
    const subtotal = items.reduce((s, row) => s + modelPrice(row.modelId) * premium * (row.qty || 0), 0);
    return `
      <div class="order-table-scroll">
        <table class="kubota-table order-cart-table">
          <thead><tr><th>${it.colModel}</th><th>${it.colQty}</th><th>${it.colUnitPrice}</th><th>${it.colAmount}</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <button type="button" class="order-btn order-btn--ghost" id="po-req-add-line">${it.addLine}</button>
      <div class="order-cart-subtotal">${it.subtotal}: <strong>${poReqFmtUsd(subtotal)}</strong></div>
    `;
  }

  function refreshItemsTable() {
    document.getElementById('po-req-items-wrap').innerHTML = itemsTableHtml();
    wireItemsTable();
    updateItemCount();
  }

  function updateItemCount() {
    const badge = document.getElementById('po-req-item-count');
    if (!badge) return;
    const count = items.filter(row => row.modelId).length;
    badge.textContent = count ? `+${count}` : '';
    badge.classList.toggle('is-visible', count > 0);
  }

  function wireItemsTable() {
    const wrap = document.getElementById('po-req-items-wrap');
    wrap.querySelectorAll('[data-item-model]').forEach(sel => {
      sel.addEventListener('change', () => { items[Number(sel.dataset.itemModel)].modelId = sel.value; refreshItemsTable(); });
    });
    wrap.querySelectorAll('[data-item-qty]').forEach(input => {
      input.addEventListener('change', () => { items[Number(input.dataset.itemQty)].qty = Math.max(1, parseInt(input.value, 10) || 1); refreshItemsTable(); });
    });
    wrap.querySelectorAll('[data-item-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.itemRemove);
        if (items.length === 1) { items = [{ modelId: '', qty: 1 }]; } else { items.splice(idx, 1); }
        refreshItemsTable();
      });
    });
    const addBtn = document.getElementById('po-req-add-line');
    if (addBtn) addBtn.addEventListener('click', () => { items.push({ modelId: '', qty: 1 }); refreshItemsTable(); });
  }

  function termsHtml() {
    const t = pr.terms;
    const todayIso = new Date().toISOString().slice(0, 10);
    return `
      <div class="po-req-field-grid">
        <label class="po-req-field">
          <span>${t.incotermLabel}</span>
          <select id="po-req-incoterm">${t.incoterms.map(i => `<option value="${i.id}">${i.label}</option>`).join('')}</select>
        </label>
        <label class="po-req-field"><span>${t.portOfLoadingLabel}</span><input type="text" id="po-req-port-of-loading"></label>
        <label class="po-req-field"><span>${t.portLabel}</span><input type="text" id="po-req-port"></label>
        <label class="po-req-field">
          <span>${t.paymentLabel}</span>
          <select id="po-req-payment">${paymentTerms.map(term => `<option value="${term.id}">${term.label}</option>`).join('')}</select>
        </label>
        <label class="po-req-field">
          <span>${t.shippingLabel}</span>
          <select id="po-req-shipping">${t.shippingMethods.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
        </label>
        <label class="po-req-field"><span>${t.deliveryDateLabel}</span><input type="date" id="po-req-delivery-date" min="${todayIso}"></label>
      </div>
    `;
  }

  function piHtml() {
    const pi = pr.pi;
    return `
      <div class="po-req-pi-toggle" role="radiogroup">
        <label><input type="radio" name="po-req-pi" value="yes"> ${pi.yes}</label>
        <label><input type="radio" name="po-req-pi" value="no"> ${pi.no}</label>
      </div>
      <p class="po-req-hint">${pi.helpText}</p>
      <label class="po-req-field po-req-field--wide" id="po-req-consignee-field" hidden>
        <span>${pi.consigneeLabel}</span>
        <textarea id="po-req-consignee" rows="2" placeholder="${pi.consigneePlaceholder}"></textarea>
      </label>
    `;
  }

  function renderForm() {
    body.innerHTML = `
      <div class="po-req-progress">
        <div class="po-req-progress-dot po-req-progress-dot--1"><span>1</span></div>
        <div class="po-req-progress-dot po-req-progress-dot--2"><span>2</span></div>
        <div class="po-req-progress-dot po-req-progress-dot--3"><span>3</span></div>
        <div class="po-req-progress-dot po-req-progress-dot--4"><span>4</span></div>
        <div class="po-req-progress-dot po-req-progress-dot--5"><span>5</span></div>
      </div>
      <div class="order-step-card po-req-step po-req-step--1">
        <h3 class="order-step-title"><span class="po-req-step-badge">1</span><span class="po-req-step-icon">🏢</span>${pr.customer.heading}</h3>
        ${customerFieldsHtml()}
      </div>
      <div class="order-step-card po-req-step po-req-step--2">
        <h3 class="order-step-title"><span class="po-req-step-badge">2</span><span class="po-req-step-icon">📦</span>${pr.items.heading}<span class="po-req-item-count" id="po-req-item-count"></span></h3>
        <div id="po-req-items-wrap">${itemsTableHtml()}</div>
      </div>
      <div class="order-step-card po-req-step po-req-step--3">
        <h3 class="order-step-title"><span class="po-req-step-badge">3</span><span class="po-req-step-icon">🚢</span>${pr.terms.heading}</h3>
        ${termsHtml()}
      </div>
      <div class="order-step-card po-req-step po-req-step--4">
        <h3 class="order-step-title"><span class="po-req-step-badge">4</span><span class="po-req-step-icon">📄</span>${pr.pi.heading}</h3>
        ${piHtml()}
      </div>
      <div class="order-step-card po-req-step po-req-step--5">
        <h3 class="order-step-title"><span class="po-req-step-badge">5</span><span class="po-req-step-icon">📝</span>${pr.notesLabel}</h3>
        <textarea id="po-req-notes" class="po-req-notes" placeholder="${pr.notesPlaceholder}"></textarea>
      </div>
      <button type="button" class="order-btn order-confirm-btn po-req-submit-btn" id="po-req-submit-btn"><span>🚀</span>${pr.submitBtn}</button>
    `;

    wireCustomerFields();
    wireItemsTable();
    updateItemCount();

    document.getElementById('po-req-payment').addEventListener('change', (e) => { selectedTermId = e.target.value; refreshItemsTable(); });
    document.getElementById('po-req-incoterm').addEventListener('change', (e) => {
      document.getElementById('po-req-port').closest('.po-req-field').style.display = e.target.value === 'cif' ? '' : 'none';
    });
    document.getElementById('po-req-port').closest('.po-req-field').style.display = 'none';

    body.querySelectorAll('input[name="po-req-pi"]').forEach(radio => {
      radio.addEventListener('change', () => {
        piWanted = radio.value;
        document.getElementById('po-req-consignee-field').hidden = piWanted !== 'yes';
      });
    });

    document.getElementById('po-req-submit-btn').addEventListener('click', onSubmit);
  }

  function onSubmit() {
    const buyer = currentBuyer();
    if (!buyer.company || !buyer.email) { alert(pr.requireFieldsNote); return; }
    const validItems = items.filter(row => row.modelId && row.qty > 0);
    if (!validItems.length) { alert(pr.requireItemsNote); return; }
    const deliveryDateValue = document.getElementById('po-req-delivery-date').value;
    if (deliveryDateValue && deliveryDateValue < new Date().toISOString().slice(0, 10)) {
      alert(pr.invalidDeliveryDateNote);
      return;
    }

    const premium = termPremium();
    const pdfItems = validItems.map(row => {
      const m = catalogModels.find(x => x.id === row.modelId);
      return { name: m.label, price: m.basePrice * premium, qty: row.qty };
    });

    const poNumber = orderGenNumber('PO');
    const incoterm = pr.terms.incoterms.find(i => i.id === document.getElementById('po-req-incoterm').value);
    const shippingId = document.getElementById('po-req-shipping').value;
    const shipping = pr.terms.shippingMethods.find(s => s.id === shippingId);
    const term = paymentTerms.find(t => t.id === selectedTermId) || paymentTerms[0];

    const order = {
      poNumber,
      date: new Date().toLocaleDateString('en-GB'),
      buyer,
      items: pdfItems,
      paymentTermLabel: term ? term.label : '',
      incotermLabel: incoterm ? incoterm.label : '',
      incotermCode: incoterm && incoterm.id === 'fob_bkk' ? 'FOB' : incoterm && incoterm.id === 'cif' ? 'CIF' : '',
      portOfLoading: document.getElementById('po-req-port-of-loading').value,
      port: document.getElementById('po-req-port').value,
      shippedPer: shippingId.startsWith('air') ? 'By Air' : 'By Sea',
      shippingLabel: shipping ? shipping.label : '',
      deliveryDate: document.getElementById('po-req-delivery-date').value,
      consignee: document.getElementById('po-req-consignee').value,
      piWanted: piWanted === 'yes',
      piWantedSet: piWanted !== null,
      notes: document.getElementById('po-req-notes').value
    };
    lastPoRequestOrder = order;
    generatePoRequestPdf(order, pr);
    if (order.piWanted) {
      order.piNumber = orderGenNumber('PI');
      generatePiPdf(order);
    }
    submitPoWebhook(order);

    body.innerHTML = `
      <div class="order-confirmed-card po-req-confirmed">
        <div class="po-req-confirmed-check"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27l7 7 17-17"/></svg></div>
        <h3>${pr.confirmedTitle}</h3>
        <p>${pr.confirmedBody} <strong>${poNumber}</strong></p>
        <p class="po-req-hint">${pr.nextStepsNote}</p>
        <div class="po-req-confirmed-actions">
          <button type="button" class="order-btn" id="po-req-download-again-btn">${pr.downloadAgainBtn}</button>
          ${order.piWanted ? `<button type="button" class="order-btn" id="po-req-download-pi-again-btn">${pr.pi.downloadPiBtn}</button>` : ''}
          <button type="button" class="order-btn order-btn--ghost" id="po-req-new-btn">${pr.newRequestBtn}</button>
        </div>
      </div>
    `;
    document.getElementById('po-req-download-again-btn').addEventListener('click', () => generatePoRequestPdf(lastPoRequestOrder, pr));
    const downloadPiAgainBtn = document.getElementById('po-req-download-pi-again-btn');
    if (downloadPiAgainBtn) downloadPiAgainBtn.addEventListener('click', () => generatePiPdf(lastPoRequestOrder));
    document.getElementById('po-req-new-btn').addEventListener('click', () => { items = [{ modelId: '', qty: 1 }]; piWanted = null; renderForm(); });
  }

  body.innerHTML = `<div class="order-loading">${pr.items.loading}</div>`;
  orderLoadCatalogData().then(data => {
    if (state.route !== 'po-request') return;
    catalogModels = [...data.products.engines, ...data.products.tillers, ...data.products.implements];
    paymentTerms = data.products.paymentTerms;
    selectedTermId = paymentTerms[0].id;
    renderForm();
  });
}

let lastPoRequestOrder = null;

function generatePoRequestPdf(order, pr) {
  if (!window.jspdf) { alert('PDF library failed to load.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 42;
  let y = 50;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PURCHASE ORDER', pageW / 2, y, { align: 'center' });
  y += 26;

  doc.setFontSize(10);
  doc.text(`PO No.: ${order.poNumber}`, marginX, y);
  doc.text(`Date: ${order.date}`, pageW - marginX, y, { align: 'right' });
  y += 22;

  doc.setFont('helvetica', 'bold');
  doc.text('Buyer:', marginX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(order.buyer.company || '-', marginX + 90, y);
  y += 14;
  doc.text(doc.splitTextToSize(order.buyer.address || '-', pageW - marginX * 2 - 90), marginX + 90, y);
  y += 14;
  doc.text(`Country: ${order.buyer.country || '-'}`, marginX + 90, y);
  y += 14;
  doc.text(`Contact: ${order.buyer.contact || '-'}   Email: ${order.buyer.email || '-'}`, marginX + 90, y);
  y += 14;
  doc.text(`Tel / WhatsApp: ${order.buyer.phone || '-'}`, marginX + 90, y);
  y += 14;
  if (order.buyer.customerRef) { doc.text(`Buyer's Order No.: ${order.buyer.customerRef}`, marginX + 90, y); y += 14; }
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Supplier:', marginX, y);
  doc.setFont('helvetica', 'normal');
  doc.text('Siam Kubota Corporation Co., Ltd.', marginX + 90, y);
  y += 14;
  doc.text('700/867 Amatanakorn Industrial Estate, Chonburi, Thailand', marginX + 90, y);
  y += 22;

  doc.text(`Terms of Payment: ${order.paymentTermLabel || '-'}`, marginX, y);
  y += 14;
  doc.text(`Incoterm: ${order.incotermLabel || '-'}${order.port ? ` (${order.port})` : ''}`, marginX, y);
  y += 14;
  doc.text(`Shipping Method: ${order.shippingLabel || '-'}`, marginX, y);
  y += 14;
  doc.text(`Requested Delivery Date: ${order.deliveryDate || '-'}`, marginX, y);
  y += 14;
  doc.text(`Proforma Invoice Requested: ${order.piWantedSet ? (order.piWanted ? 'Yes' : 'No') : '-'}`, marginX, y);
  y += 22;

  const { y: afterTable, total } = pdfItemsTable(doc, order.items, y, marginX, pageW);
  y = afterTable;

  doc.setFont('helvetica', 'bold');
  doc.text('Grand Total (USD):', pageW - marginX - 170, y);
  doc.text(pdfMoney(total), pageW - marginX, y, { align: 'right' });
  y += 26;

  if (order.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Notes:', marginX, y);
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(order.notes, pageW - marginX * 2), marginX, y);
    y += 24;
  }

  y += 10;
  doc.text('Prepared by: ___________________________', marginX, y);
  doc.text('Date: ___________________________', pageW - marginX - 160, y);

  y += 40;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Generated by the KU-KIT PO request form. Confirm all details with your Siam Kubota sales contact', marginX, y);
  y += 11;
  doc.text('before proceeding — automatic sales-team notification is not yet connected to this form.', marginX, y);

  doc.save(`${order.poNumber}.pdf`);
}

function getArtworkEditorLabels() {
  const labels = {
    th: {
      body: 'ข้อความรายละเอียด', uploadLogo: 'เพิ่มโลโก้ร้านค้า', replaceLogo: 'เปลี่ยนโลโก้ร้านค้า',
      uploadHint: 'รองรับ PNG, JPG และ WebP (พื้นหลังโปร่งใสจะสวยที่สุด)', layers: 'เลือกสิ่งที่ต้องการแก้บนแบบ',
      text: 'ข้อความ', product: 'รูปสินค้า', brand: 'โลโก้แบรนด์', modelLogo: 'โลโก้รุ่นสินค้า', shopLogo: 'โลโก้ร้าน',
      selected: 'กำลังแก้ไข', selectHint: 'คลิกสิ่งที่ต้องการบนภาพ หรือเลือกจากปุ่มด้านล่าง',
      smaller: 'เล็กลง', larger: 'ใหญ่ขึ้น', rotateLeft: 'หมุนซ้าย', rotateRight: 'หมุนขวา',
      reset: 'คืนตำแหน่ง', remove: 'ลบออก', restore: 'นำกลับมา', hidden: 'ซ่อนอยู่',
      size: 'ขนาด', directHint: 'ลากเพื่อย้าย • ลากจุดมุมขวาล่างเพื่อย่อ–ขยาย • กด Delete เพื่อลบ',
      invalidLogo: 'กรุณาเลือกไฟล์รูป PNG, JPG หรือ WebP ขนาดไม่เกิน 8 MB'
    },
    en: {
      body: 'Body text', uploadLogo: 'Insert shop logo', replaceLogo: 'Replace shop logo',
      uploadHint: 'PNG, JPG or WebP (a transparent background works best)', layers: 'Select an element to edit',
      text: 'Text', product: 'Product image', brand: 'Brand logo', modelLogo: 'Model logo', shopLogo: 'Shop logo',
      selected: 'Editing', selectHint: 'Click an element on the artwork or choose it below',
      smaller: 'Smaller', larger: 'Larger', rotateLeft: 'Rotate left', rotateRight: 'Rotate right',
      reset: 'Reset position', remove: 'Remove', restore: 'Restore', hidden: 'Hidden',
      size: 'Size', directHint: 'Drag to move • drag the bottom-right handle to resize • press Delete to remove',
      invalidLogo: 'Choose a PNG, JPG or WebP image no larger than 8 MB.'
    },
    sw: {
      body: 'Maandishi ya maelezo', uploadLogo: 'Weka nembo ya duka', replaceLogo: 'Badilisha nembo ya duka',
      uploadHint: 'PNG, JPG au WebP (mandharinyuma wazi yanafaa zaidi)', layers: 'Chagua kipengele cha kuhariri',
      text: 'Maandishi', product: 'Picha ya bidhaa', brand: 'Nembo ya chapa', modelLogo: 'Nembo ya mfano', shopLogo: 'Nembo ya duka',
      selected: 'Unahariri', selectHint: 'Bofya kipengele kwenye mchoro au ukichague hapa chini',
      smaller: 'Punguza', larger: 'Ongeza', rotateLeft: 'Zungusha kushoto', rotateRight: 'Zungusha kulia',
      reset: 'Rudisha nafasi', remove: 'Ondoa', restore: 'Rudisha', hidden: 'Imefichwa',
      size: 'Ukubwa', directHint: 'Buruta kuhamisha • buruta kishikio cha chini kulia kubadili ukubwa • bonyeza Delete kuondoa',
      invalidLogo: 'Chagua picha ya PNG, JPG au WebP isiyozidi MB 8.'
    },
    fr: {
      body: 'Corps du texte', uploadLogo: 'Insérer le logo du magasin', replaceLogo: 'Remplacer le logo',
      uploadHint: 'PNG, JPG ou WebP (fond transparent recommandé)', layers: 'Sélectionnez un élément à modifier',
      text: 'Texte', product: 'Image produit', brand: 'Logo de marque', modelLogo: 'Logo du modèle', shopLogo: 'Logo magasin',
      selected: 'Modification', selectHint: "Cliquez sur un élément de l’affiche ou choisissez-le ci-dessous",
      smaller: 'Réduire', larger: 'Agrandir', rotateLeft: 'Tourner à gauche', rotateRight: 'Tourner à droite',
      reset: 'Réinitialiser', remove: 'Supprimer', restore: 'Restaurer', hidden: 'Masqué',
      size: 'Taille', directHint: 'Glissez pour déplacer • tirez la poignée en bas à droite pour redimensionner • Suppr pour retirer',
      invalidLogo: 'Choisissez une image PNG, JPG ou WebP de 8 Mo maximum.'
    },
    tl: {
      body: 'Detalye ng teksto', uploadLogo: 'Ilagay ang logo ng tindahan', replaceLogo: 'Palitan ang logo',
      uploadHint: 'PNG, JPG o WebP (pinakamaganda ang transparent na background)', layers: 'Pumili ng elementong ie-edit',
      text: 'Teksto', product: 'Larawan ng produkto', brand: 'Brand logo', modelLogo: 'Logo ng modelo', shopLogo: 'Logo ng tindahan',
      selected: 'Ine-edit', selectHint: 'I-click ang elemento sa artwork o piliin ito sa ibaba',
      smaller: 'Liitan', larger: 'Lakihan', rotateLeft: 'Ikutin pakaliwa', rotateRight: 'Ikutin pakanan',
      reset: 'I-reset ang posisyon', remove: 'Alisin', restore: 'Ibalik', hidden: 'Nakatago',
      size: 'Laki', directHint: 'I-drag para ilipat • i-drag ang handle sa ibabang kanan para baguhin ang laki • Delete para alisin',
      invalidLogo: 'Pumili ng PNG, JPG o WebP na hindi lalampas sa 8 MB.'
    }
  };
  return labels[state.lang] || labels.en;
}

function renderArtworkStepper(id, label, value, min, max, step) {
  return `
    <div class="artwork-stepper" data-aw-stepper="${id}">
      <span class="artwork-stepper-label">${label}</span>
      <button type="button" data-aw-step="-${step}" aria-label="− ${label}">−</button>
      <output id="${id}-output">${value}%</output>
      <button type="button" data-aw-step="${step}" aria-label="+ ${label}">+</button>
      <input type="hidden" id="${id}" value="${value}" data-min="${min}" data-max="${max}">
    </div>`;
}

function renderArtworkBody(c) {
  const a = c.artwork;
  const ui = getArtworkEditorLabels();
  return `
      <div class="artwork-layout">
        <div class="artwork-form">
          <h3>${a.formTitle}</h3>
          <label class="artwork-field">
            <span>${a.sizeLabel}</span>
            <select id="aw-size">
              <option value="banner">${a.sizes.banner}</option>
              <option value="standee">${a.sizes.standee}</option>
              <option value="beachflag">${a.sizes.beachflag}</option>
              <option value="rollup">${a.sizes.rollup}</option>
              <option value="aframe">${a.sizes.aframe}</option>
            </select>
          </label>
          <div class="artwork-field artwork-size-inputs">
            <label class="artwork-field artwork-field--inline">
              <span>${a.widthLabel}</span>
              <input type="number" id="aw-width-cm" min="10" max="1000" step="1">
            </label>
            <label class="artwork-field artwork-field--inline">
              <span>${a.heightLabel}</span>
              <input type="number" id="aw-height-cm" min="10" max="1000" step="1">
            </label>
          </div>
          <p class="po-req-hint">${a.sizeHint}</p>
          <div class="artwork-field">
            <span>${a.bgStyleLabel}</span>
            <div class="artwork-swatch-group" id="aw-bgstyle-group" role="radiogroup">
              <button type="button" class="artwork-swatch artwork-swatch--bg-diagonal active" data-value="diagonal" aria-pressed="true" title="${a.bgStyles.diagonal}"></button>
              <button type="button" class="artwork-swatch artwork-swatch--bg-dark" data-value="dark" aria-pressed="false" title="${a.bgStyles.dark}"></button>
              <button type="button" class="artwork-swatch artwork-swatch--bg-frame" data-value="frame" aria-pressed="false" title="${a.bgStyles.frame}"></button>
              <button type="button" class="artwork-swatch artwork-swatch--bg-corners" data-value="corners" aria-pressed="false" title="${a.bgStyles.corners}"></button>
              <button type="button" class="artwork-swatch artwork-swatch--bg-photo-rainbow" data-value="photo-rainbow" aria-pressed="false" title="${a.bgStyles.photoRainbow}"></button>
              <button type="button" class="artwork-swatch artwork-swatch--bg-photo-sky" data-value="photo-sky" aria-pressed="false" title="${a.bgStyles.photoSky}"></button>
            </div>
          </div>
          <label class="artwork-field">
            <span>${a.productLabel}</span>
            <select id="aw-product">
              <option value="engine">${a.products.engine}</option>
              <option value="tiller">${a.products.tiller}</option>
              <option value="both">${a.products.both}</option>
            </select>
          </label>
          <div class="artwork-field artwork-upload-field">
            <button type="button" id="aw-logo-upload" class="artwork-upload-btn"><span aria-hidden="true">＋</span><span id="aw-logo-upload-label">${ui.uploadLogo}</span></button>
            <input type="file" id="aw-logo-file" accept="image/png,image/jpeg,image/webp" hidden>
            <small>${ui.uploadHint}</small>
          </div>
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
            ${renderArtworkStepper('aw-headline-scale', a.textScaleLabel, 100, 50, 200, 5)}
          </label>
          <label class="artwork-field">
            <span>${a.subheadlineLabel}</span>
            <input type="text" id="aw-subheadline" placeholder="${a.subheadlinePlaceholder}" maxlength="80">
            ${renderArtworkStepper('aw-subheadline-scale', a.textScaleLabel, 100, 50, 200, 5)}
          </label>
          <label class="artwork-field">
            <span>${a.bodyLabel || ui.body}</span>
            <textarea id="aw-body" rows="2" placeholder="${a.bodyPlaceholder || ''}" maxlength="180"></textarea>
            ${renderArtworkStepper('aw-body-scale', a.textScaleLabel, 100, 50, 200, 5)}
          </label>
          <div class="artwork-field">
            <span>${a.textStyleLabel}</span>
            <div class="artwork-swatch-group" id="aw-text-style-group" role="radiogroup">
              <button type="button" class="artwork-swatch artwork-swatch--text-orange active" data-value="orange" aria-pressed="true" title="${a.textStyles.orange}"></button>
              <button type="button" class="artwork-swatch artwork-swatch--text-chrome" data-value="chrome" aria-pressed="false" title="${a.textStyles.chrome}"></button>
              <button type="button" class="artwork-swatch artwork-swatch--text-red" data-value="red" aria-pressed="false" title="${a.textStyles.red}"></button>
            </div>
          </div>
          <input type="hidden" id="aw-text-offset-x" value="0">
          <input type="hidden" id="aw-text-offset-y" value="0">
          <input type="hidden" id="aw-text-scale" value="100">
          <input type="hidden" id="aw-text-rotation" value="0">
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
              ${renderArtworkStepper('aw-decor-man-size', `${a.decorations.man} — ${a.decorations.sizeLabel}`, 100, 40, 220, 10)}
              ${renderArtworkStepper('aw-decor-no1-size', `${a.decorations.no1} — ${a.decorations.sizeLabel}`, 100, 40, 220, 10)}
            </div>
          </div>
          <button type="button" id="aw-download" class="file-pill artwork-download-btn">${a.downloadButton}</button>
          <p class="artwork-resolution-note" id="aw-resolution-note"></p>
        </div>
        <div class="artwork-preview">
          <h3>${a.previewTitle}</h3>
          <div class="artwork-canvas-hint">
            <span class="artwork-canvas-hint-icon" aria-hidden="true">✋</span>
            <span>${ui.directHint}</span>
          </div>
          <div class="artwork-layer-panel">
            <div class="artwork-layer-panel-head"><strong>${ui.layers}</strong><span>${ui.selectHint}</span></div>
            <div class="artwork-layer-list" id="aw-layer-list">
              <button type="button" data-aw-layer="headline"><span>✎</span>${ui.text}</button>
              <button type="button" data-aw-layer="photo"><span>▣</span>${ui.product}</button>
              <button type="button" data-aw-layer="logo"><span>Ⓚ</span>${ui.brand}</button>
              <button type="button" data-aw-layer="wordmark"><span>▤</span>${ui.modelLogo}</button>
              <button type="button" data-aw-layer="customLogo"><span>＋</span>${ui.shopLogo}</button>
            </div>
            <div class="artwork-element-toolbar" id="aw-element-toolbar">
              <div class="artwork-element-title"><small>${ui.selected}</small><strong id="aw-selected-label">${ui.text}</strong><span id="aw-selected-state"></span></div>
              <div class="artwork-element-actions">
                <button type="button" id="aw-smaller" title="${ui.smaller}" aria-label="${ui.smaller}">−</button>
                <output id="aw-selected-scale">100%</output>
                <button type="button" id="aw-larger" title="${ui.larger}" aria-label="${ui.larger}">+</button>
                <span class="artwork-toolbar-divider"></span>
                <button type="button" id="aw-rotate-left" title="${ui.rotateLeft}" aria-label="${ui.rotateLeft}">↶</button>
                <button type="button" id="aw-rotate-right" title="${ui.rotateRight}" aria-label="${ui.rotateRight}">↷</button>
                <button type="button" id="aw-reset-element" class="artwork-action-text">${ui.reset}</button>
                <button type="button" id="aw-remove-element" class="artwork-action-text artwork-action-danger">${ui.remove}</button>
              </div>
            </div>
          </div>
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
  standee: { wCm: 80, hCm: 160 },
  beachflag: { wCm: 65, hCm: 250 },
  rollup: { wCm: 80, hCm: 200 },
  aframe: { wCm: 60, hCm: 80 }
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

// Glossy/embossed marketing-poster text: a solid extrusion (stacked offset
// copies) for depth, a heavy outline for edge definition, then a top-lit
// gradient fill so the letters read as a lit 3D object rather than flat ink.
const AW_TEXT_THEMES = {
  orange: { hi: '#FFEAB0', mid: '#FFB35C', base: '#FF6A3D', deep: '#9C2E0B', outline: '#1a0e05' },
  chrome: { hi: '#FFFFFF', mid: '#D8E0E4', base: '#8B98A1', deep: '#20262a', outline: '#050607' },
  red:    { hi: '#FFD3C4', mid: '#FF6A4D', base: '#D42A1B', deep: '#5C0E07', outline: '#1a0403' }
};

function awDrawImpactText(ctx, lines, cx, startY, lineHeight, fontSize, theme, strength) {
  const t = AW_TEXT_THEMES[theme] || AW_TEXT_THEMES.orange;
  // A chunky stepped extrusion (many thin offset copies, each a touch darker)
  // reads as a solid 3D block viewed from a slight angle — the single/shallow
  // offset used before looked more like a drop shadow than actual depth.
  const steps = Math.max(4, Math.round(14 * strength));
  const depth = fontSize * 0.16 * strength;

  lines.forEach((ln, i) => {
    const ly = startY + i * lineHeight;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = fontSize * 0.16;
    ctx.shadowOffsetX = fontSize * 0.03;
    ctx.shadowOffsetY = fontSize * 0.1;
    for (let s = steps; s >= 1; s--) {
      const k = s / steps;
      // Darken further back in the stack so the extrusion itself looks lit
      // from the same direction as the face, not a flat silhouette.
      ctx.fillStyle = k > 0.5 ? t.deep : t.outline;
      ctx.fillText(ln, cx + k * depth, ly + k * depth);
      ctx.shadowColor = 'transparent'; // only the frontmost extrusion layer casts the ground shadow
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(1, fontSize * 0.1 * strength);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = t.outline;
    ctx.strokeText(ln, cx, ly);
    ctx.restore();

    // Beveled highlight rim: a thin light stroke nudged toward the light
    // source (up-left) so a sliver of it peeks out past the dark outline —
    // the classic emboss/chrome edge-catch-the-light look.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(1, fontSize * 0.045 * strength);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = t.hi;
    ctx.globalAlpha = 0.9;
    ctx.strokeText(ln, cx - fontSize * 0.02, ly - fontSize * 0.02);
    ctx.restore();

    const grad = ctx.createLinearGradient(0, ly - fontSize * 0.85, 0, ly + fontSize * 0.35);
    grad.addColorStop(0, t.hi);
    grad.addColorStop(0.22, t.mid);
    grad.addColorStop(0.5, t.base);
    grad.addColorStop(0.8, t.base);
    grad.addColorStop(1, t.deep);
    ctx.fillStyle = grad;
    ctx.textAlign = 'center';
    ctx.fillText(ln, cx, ly);
  });
}

const AW_PHOTO_BACKGROUNDS = {
  'photo-rainbow': 'assets/img/artwork/backgrounds/bg-rice-field-rainbow.jpg',
  'photo-sky': 'assets/img/artwork/backgrounds/bg-farm-field-sky.jpg'
};

function awPaintBackground(ctx, pxW, pxH, isLandscape, bgStyle, pad, logoH, photoImg) {
  if (photoImg) {
    const scale = Math.max(pxW / photoImg.width, pxH / photoImg.height);
    const dw = photoImg.width * scale;
    const dh = photoImg.height * scale;
    const dx = (pxW - dw) / 2;
    const dy = (pxH - dh) / 2;
    ctx.drawImage(photoImg, dx, dy, dw, dh);

    // Dark gradients top and bottom so the logo band and headline/contact
    // text stay legible over whatever the photo looks like underneath.
    const gradTop = ctx.createLinearGradient(0, 0, 0, pxH * 0.28);
    gradTop.addColorStop(0, 'rgba(8,20,22,0.55)');
    gradTop.addColorStop(1, 'rgba(8,20,22,0)');
    ctx.fillStyle = gradTop;
    ctx.fillRect(0, 0, pxW, pxH * 0.28);

    const gradBottom = ctx.createLinearGradient(0, pxH * 0.45, 0, pxH);
    gradBottom.addColorStop(0, 'rgba(8,20,22,0)');
    gradBottom.addColorStop(1, 'rgba(8,20,22,0.8)');
    ctx.fillStyle = gradBottom;
    ctx.fillRect(0, pxH * 0.45, pxW, pxH * 0.55);
    return;
  }

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

  if (bgStyle === 'corners') {
    ctx.fillStyle = (() => {
      const g = ctx.createLinearGradient(0, 0, 0, pxH);
      g.addColorStop(0, '#FF6A3D');
      g.addColorStop(0.55, '#F7F5F0');
      g.addColorStop(1, '#FFFFFF');
      return g;
    })();
    ctx.fillRect(0, 0, pxW, pxH);

    // Dark angular corner wedges with orange accent stripes, echoing the
    // event-backdrop reference (logos/text from that reference are not
    // reproduced here — this is background decoration only).
    const wedgeW = pxW * 0.16;
    const wedgeH = pxH * 0.16;
    const drawCorner = (flipX, flipY) => {
      ctx.save();
      ctx.translate(flipX ? pxW : 0, flipY ? pxH : 0);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);

      ctx.fillStyle = '#081416';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(wedgeW, 0);
      ctx.lineTo(wedgeW * 0.55, wedgeH * 0.4);
      ctx.lineTo(0, wedgeH);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(wedgeW, 0);
      ctx.lineTo(wedgeW * 0.55, wedgeH * 0.4);
      ctx.lineTo(0, wedgeH);
      ctx.closePath();
      ctx.clip();
      const stripeGrad = ctx.createLinearGradient(0, 0, wedgeW, 0);
      stripeGrad.addColorStop(0, '#FF6A3D');
      stripeGrad.addColorStop(1, '#FFB35C');
      ctx.fillStyle = stripeGrad;
      const stripeW = wedgeW * 0.09;
      for (let i = 0; i < 3; i++) {
        const sx = wedgeW * 0.22 + i * stripeW * 2.1;
        ctx.beginPath();
        ctx.moveTo(sx, -wedgeH * 0.3);
        ctx.lineTo(sx + stripeW, -wedgeH * 0.3);
        ctx.lineTo(sx - wedgeW * 0.18, wedgeH * 1.1);
        ctx.lineTo(sx - wedgeW * 0.18 - stripeW, wedgeH * 1.1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.restore();
    };
    drawCorner(false, false);
    drawCorner(true, false);
    drawCorner(false, true);
    drawCorner(true, true);
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
  // Fractions of pxW/pxH (not raw px) so a drag made on the small preview
  // canvas still lands in the same relative spot on the full-resolution
  // print canvas — same trick the text offset sliders already use.
  const logoOffsetXpx = (st.logoOffsetXFrac || 0) * pxW;
  const logoOffsetYpx = (st.logoOffsetYFrac || 0) * pxH;
  const wordmarkOffsetXpx = (st.wordmarkOffsetXFrac || 0) * pxW;
  const wordmarkOffsetYpx = (st.wordmarkOffsetYFrac || 0) * pxH;
  const photoOffsetXpx = (st.photoOffsetXFrac || 0) * pxW;
  const photoOffsetYpx = (st.photoOffsetYFrac || 0) * pxH;
  const customLogoOffsetXpx = (st.customLogoOffsetXFrac || 0) * pxW;
  const customLogoOffsetYpx = (st.customLogoOffsetYFrac || 0) * pxH;
  const logoScale = st.logoScale || 1;
  const wordmarkScale = st.wordmarkScale || 1;
  const photoScale = st.photoScale || 1;
  const customLogoScale = st.customLogoScale || 1;
  const logoVisible = st.logoVisible !== false;
  const wordmarkVisible = st.wordmarkVisible !== false;
  const photoVisible = st.photoVisible !== false;
  const textVisible = st.textVisible !== false;
  // The "Kubota" mark and its product-category text ("Diesel Engine" /
  // "Power Tiller") used to be one baked-in image, so switching the product
  // never updated the category word. Draw the Kubota mark from a cropped
  // logo-only asset and the category word as real text instead, so it can
  // track the selected product; both share the same canvas font so they
  // always match regardless of which word is showing.
  const kubotaImg = await loadArtworkImage('assets/img/artwork/kubota-logo-only.png');
  const kubotaAspect = kubotaImg.width / kubotaImg.height;
  const categoryText = st.product === 'engine' ? 'Diesel Engine'
    : st.product === 'tiller' ? 'Power Tiller'
    : 'Diesel Engine & Power Tiller';

  let logoH = pxH * (isLandscape ? 0.09 : 0.05) * 1.2 * logoScale;
  let logoImgW = logoH * kubotaAspect;
  const categoryFontPx = () => Math.round(logoH * 0.42);
  const categoryGap = () => logoH * 0.16;
  ctx.font = `600 ${categoryFontPx()}px Prompt, sans-serif`;
  let logoW = logoImgW + categoryGap() + ctx.measureText(categoryText).width;
  // The cropped wordmark is quite wide relative to its height; on the narrower
  // portrait canvas a height-based size can overflow both edges, so cap it to
  // a safe share of the width there and derive the height from that instead.
  const maxLogoW = isLandscape ? pxW * 0.5 : pxW * 0.74;
  if (logoW > maxLogoW) {
    const shrink = maxLogoW / logoW;
    logoH *= shrink;
    logoImgW = logoH * kubotaAspect;
    ctx.font = `600 ${categoryFontPx()}px Prompt, sans-serif`;
    logoW = logoImgW + categoryGap() + ctx.measureText(categoryText).width;
  }

  const photoBg = AW_PHOTO_BACKGROUNDS[bgStyle] ? await loadArtworkImage(AW_PHOTO_BACKGROUNDS[bgStyle]) : null;
  awPaintBackground(ctx, pxW, pxH, isLandscape, bgStyle, pad, logoH, photoBg);

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

  const logoX = (isLandscape ? pad : (pxW - logoW) / 2) + logoOffsetXpx;
  const logoY = pad + logoOffsetYpx;
  if (logoVisible && bgStyle !== 'diagonal') ctx.filter = 'invert(1)';
  if (logoVisible) {
    ctx.drawImage(kubotaImg, logoX, logoY, logoImgW, logoH);
    ctx.font = `600 ${categoryFontPx()}px Prompt, sans-serif`;
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.fillText(categoryText, logoX + logoImgW + categoryGap(), logoY + logoH / 2);
  }
  ctx.filter = 'none';

  const wmHBase = pxH * (isLandscape ? 0.045 : 0.028) * 1.2 * wordmarkScale;
  const wmGap = wmHBase * 1.3;
  const maxWmW = isLandscape ? pxW * 0.4 : pxW * 0.7;
  // The "frame" style's orange band already holds the Kubota logo; when there's
  // room beside it, tuck the product wordmark(s) into that same band instead of
  // letting them hang below into the body area, where they crowd the farmer
  // decoration and promo text.
  const bandAreaW = (pxW - pad) - (logoX + logoW + pad * 0.6);
  const inlineWm = bgStyle === 'frame' && isLandscape && bandAreaW > pxW * 0.15;
  // Base position (no drag offsets applied) — used for the text-layout math
  // below so dragging the logo or the wordmark doesn't reshuffle where the
  // headline block is allowed to sit; only the drawn elements actually move.
  const wmBaseY = pad + logoH + (bgStyle === 'frame' ? pad * 0.9 : pxH * 0.015);
  let wmStartY = wmBaseY + wordmarkOffsetYpx;
  let wmBelowCount = productImgs.length;
  // The logo and wordmark(s) are now independently draggable groups, each
  // with its own bounding box (no longer merged into one).
  const wmRects = [];
  if (wordmarkVisible && inlineWm) {
    wmBelowCount = 0;
    const areaX = logoX + logoW + pad * 0.6 + wordmarkOffsetXpx;
    const areaY = pad + wordmarkOffsetYpx;
    const rowGap = logoH * 0.12;
    const rowH = (logoH - rowGap * (productImgs.length - 1)) / productImgs.length;
    productImgs.forEach((p, i) => {
      const wmAspect = p.wordmark.width / p.wordmark.height;
      let wmH = rowH;
      let wmW = wmH * wmAspect;
      if (wmW > bandAreaW) {
        wmW = bandAreaW;
        wmH = wmW / wmAspect;
      }
      const wmY = areaY + i * (rowH + rowGap) + (rowH - wmH) / 2;
      ctx.drawImage(p.wordmark, areaX, wmY, wmW, wmH);
      wmRects.push({ x: areaX, y: wmY, w: wmW, h: wmH });
    });
  } else if (wordmarkVisible) {
    productImgs.forEach((p, i) => {
      const wmAspect = p.wordmark.width / p.wordmark.height;
      let wmH = wmHBase;
      let wmW = wmH * wmAspect;
      if (wmW > maxWmW) {
        wmW = maxWmW;
        wmH = wmW / wmAspect;
      }
      const wmX = (isLandscape ? pad : (pxW - wmW) / 2) + wordmarkOffsetXpx;
      const wmY = wmStartY + i * wmGap;
      ctx.drawImage(p.wordmark, wmX, wmY, wmW, wmH);
      wmRects.push({ x: wmX, y: wmY, w: wmW, h: wmH });
    });
  }

  const wmStartYForLayout = wmBaseY;

  const logoBounds = logoVisible ? { x: logoX, y: logoY, w: logoW, h: logoH } : null;
  let wordmarkBounds = null;
  wmRects.forEach(r => {
    if (!wordmarkBounds) { wordmarkBounds = { ...r }; return; }
    const x2 = Math.max(wordmarkBounds.x + wordmarkBounds.w, r.x + r.w);
    const y2 = Math.max(wordmarkBounds.y + wordmarkBounds.h, r.y + r.h);
    wordmarkBounds.x = Math.min(wordmarkBounds.x, r.x);
    wordmarkBounds.y = Math.min(wordmarkBounds.y, r.y);
    wordmarkBounds.w = x2 - wordmarkBounds.x;
    wordmarkBounds.h = y2 - wordmarkBounds.y;
  });

  // --- Bottom info panel geometry: sized to fit shop name + contact so text never overflows ---
  // Computed before the product photo box below so the photo's height can be
  // bounded by where the panel actually starts (the panel grows taller when the
  // address wraps to more lines), instead of a fixed ratio that can overlap it.
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

  // photoBoxBottom stays based on the un-offset box (it only feeds the text
  // zone in portrait mode) so dragging the packshot doesn't also reshuffle
  // the headline block — same reasoning as wmStartYForLayout above.
  let photoBoxBottom = 0;
  let photoBounds = null;
  const scaledPhotoBox = (x, y, w, h) => {
    const sw = w * photoScale;
    const sh = h * photoScale;
    return { x: x + (w - sw) / 2, y: y + (h - sh) / 2, w: sw, h: sh };
  };
  if (isLandscape) {
    const photoBoxXBase = pxW * 0.62;
    const photoBoxW = pxW - pad - photoBoxXBase;
    const photoBoxYBase = pxH * 0.10;
    // The pxH*0.15 floor only guards against a degenerate near-zero box (e.g. an
    // absurdly long address) — it must stay well below the normal clearance so it
    // can never win out over avoiding the panel and cause an overlap.
    const photoBoxH = Math.max(pxH * 0.15, panelY - pxH * 0.045 - photoBoxYBase);
    photoBoxBottom = photoBoxYBase + photoBoxH;
    const photoBoxX = photoBoxXBase + photoOffsetXpx;
    const photoBoxY = photoBoxYBase + photoOffsetYpx;
    photoBounds = scaledPhotoBox(photoBoxX, photoBoxY, photoBoxW, photoBoxH);
    if (photoVisible && productImgs.length === 1) {
      awDrawImageContain(ctx, productImgs[0].photo, photoBounds.x, photoBounds.y, photoBounds.w, photoBounds.h);
    } else if (photoVisible && productImgs.length === 2) {
      awDrawImageContain(ctx, productImgs[0].photo, photoBounds.x, photoBounds.y, photoBounds.w, photoBounds.h * 0.48);
      awDrawImageContain(ctx, productImgs[1].photo, photoBounds.x, photoBounds.y + photoBounds.h * 0.52, photoBounds.w, photoBounds.h * 0.48);
    }
  } else {
    const photoBoxW = pxW * 0.86;
    const photoBoxXBase = (pxW - photoBoxW) / 2;
    const photoBoxYBase = pxH * 0.16;
    const photoBoxX = photoBoxXBase + photoOffsetXpx;
    const photoBoxY = photoBoxYBase + photoOffsetYpx;
    if (productImgs.length === 1) {
      photoBoxBottom = photoBoxYBase + pxH * 0.34;
      photoBounds = scaledPhotoBox(photoBoxX, photoBoxY, photoBoxW, pxH * 0.34);
      if (photoVisible) awDrawImageContain(ctx, productImgs[0].photo, photoBounds.x, photoBounds.y, photoBounds.w, photoBounds.h);
    } else if (productImgs.length === 2) {
      photoBoxBottom = photoBoxYBase + pxH * 0.35;
      photoBounds = scaledPhotoBox(photoBoxX, photoBoxY, photoBoxW, pxH * 0.35);
      if (photoVisible) {
        awDrawImageContain(ctx, productImgs[0].photo, photoBounds.x, photoBounds.y, photoBounds.w, photoBounds.h * 0.48);
        awDrawImageContain(ctx, productImgs[1].photo, photoBounds.x, photoBounds.y + photoBounds.h * 0.52, photoBounds.w, photoBounds.h * 0.48);
      }
    } else {
      photoBoxBottom = photoBoxYBase;
    }
  }

  let customLogoBounds = null;
  if (st.customLogoDataUrl && st.customLogoVisible !== false) {
    const customLogoImg = await loadArtworkImage(st.customLogoDataUrl);
    const boxW = pxW * (isLandscape ? 0.18 : 0.28) * customLogoScale;
    const boxH = pxH * (isLandscape ? 0.16 : 0.10) * customLogoScale;
    const boxX = pxW - pad - boxW + customLogoOffsetXpx;
    const boxY = pad + customLogoOffsetYpx;
    customLogoBounds = { x: boxX, y: boxY, w: boxW, h: boxH };
    awDrawImageContain(ctx, customLogoImg, boxX, boxY, boxW, boxH);
  }

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

  // --- Headline / sub-headline / body, stacked and centered as one block ---
  // Centered on the artwork itself (the glow/stroke on the headline is what keeps
  // it readable even sitting over the product photo). The only thing this block
  // still dodges is the farmer decoration, since that's opaque artwork drawn in
  // the same area, not a background photo the text can float over.
  const textOnDark = bgStyle === 'dark' || !!AW_PHOTO_BACKGROUNDS[bgStyle];
  const manGap = manW ? pxW * 0.03 : 0;
  const farmerRightEdge = manW ? pad + manW + manGap : pad;
  const headlineMaxW = isLandscape ? pxW * 0.62 : pxW * 0.86;
  const textOffsetXpx = ((st.textOffsetX || 0) / 100) * pxW * 0.12;
  const textOffsetYpx = ((st.textOffsetY || 0) / 100) * pxH * 0.10;
  const userTextScale = (st.textScale || 100) / 100;
  const textRotationDeg = st.textRotation || 0;
  const textStyle = st.textStyle || 'orange';
  const headlineX = Math.max(pxW / 2, farmerRightEdge + headlineMaxW / 2) + textOffsetXpx;
  const baseFontSize = pxH * (isLandscape ? 0.075 : 0.035);
  ctx.fillStyle = textOnDark ? '#FFFFFF' : '#081416';

  // Measure every filled block first so the whole stack can be positioned to fit
  // between the logo/photo area and the info panel, instead of a fixed Y that can overflow.
  const rawBlocks = (textVisible ? [
    { key: 'headline', text: st.headline, ratio: 1.1 * (st.headlineScale || 1), weight: 800 },
    { key: 'subheadline', text: st.subheadline, ratio: 0.62 * (st.subheadlineScale || 1), weight: 600 },
    { key: 'body', text: st.body, ratio: 0.42 * (st.bodyScale || 1), weight: 400 }
  ] : [])
    .map(b => ({ ...b, text: b.text && b.text.trim() }))
    .filter(b => b.text);

  function awBlockFont(b, fontSize) {
    // Headline/sub-headline get a slight italic slant — the dynamic angled
    // lettering that reads as "professionally designed" rather than a plain
    // upright label; body copy stays upright since it's read as fine print.
    const style = b.key === 'body' ? '' : 'italic ';
    return `${style}${b.weight} ${Math.round(fontSize)}px Prompt, sans-serif`;
  }

  function measureBlocks(scale) {
    let h = 0;
    const blocks = rawBlocks.map((b, i) => {
      const fontSize = baseFontSize * b.ratio * scale;
      ctx.font = awBlockFont(b, fontSize);
      const lines = awWrapLines(ctx, b.text, headlineMaxW);
      const lineHeight = fontSize * 1.28;
      h += lines.length * lineHeight;
      if (i < rawBlocks.length - 1) h += fontSize * 0.12;
      return { ...b, fontSize, lineHeight, lines };
    });
    return { blocks, totalH: h };
  }

  const zoneTop = isLandscape
    ? wmStartYForLayout + wmGap * wmBelowCount + pxH * 0.03
    : photoBoxBottom + pxH * 0.03;
  const zoneBottomLimit = panelY - pxH * 0.02;
  const availableH = zoneBottomLimit - zoneTop;

  let { blocks: measuredBlocks, totalH: totalTextH } = measureBlocks(userTextScale);
  if (totalTextH > availableH && availableH > 0 && totalTextH > 0) {
    const shrink = Math.max(0.4, availableH / totalTextH);
    ({ blocks: measuredBlocks, totalH: totalTextH } = measureBlocks(userTextScale * shrink));
  }

  // Centered — "the artwork" reads as one balanced block, not pinned to a fixed line.
  // The manual offset is applied after centering/clamping so it nudges the whole
  // block from its balanced position rather than fighting the auto-fit logic.
  let cursorY = zoneTop + Math.max(0, (availableH - totalTextH) / 2);
  cursorY = Math.max(zoneTop, Math.min(cursorY, zoneBottomLimit - totalTextH));
  cursorY += textOffsetYpx;
  const textBlockStartY = cursorY;

  // Tilt the whole headline/sub-headline/body stack together around its own
  // center, like rotating a text layer in a design tool — everything after
  // this transform is drawn in the rotated space and ctx.restore() below
  // undoes it before the info panel is drawn (which must stay level).
  const pivotY = cursorY + totalTextH / 2;
  ctx.save();
  if (textRotationDeg) {
    ctx.translate(headlineX, pivotY);
    ctx.rotate(textRotationDeg * Math.PI / 180);
    ctx.translate(-headlineX, -pivotY);
  }

  measuredBlocks.forEach(b => {
    ctx.font = awBlockFont(b, b.fontSize);
    ctx.textAlign = 'center';
    if (b.key === 'headline') {
      awDrawImpactText(ctx, b.lines, headlineX, cursorY, b.lineHeight, b.fontSize, textStyle, 1);
    } else if (b.key === 'subheadline') {
      // Same glossy theme as the headline but toned down — a lighter outline
      // and shallower extrusion so it reads as secondary, not competing.
      awDrawImpactText(ctx, b.lines, headlineX, cursorY, b.lineHeight, b.fontSize, textStyle, 0.5);
    } else {
      ctx.fillStyle = textOnDark ? '#FFFFFF' : '#081416';
      b.lines.forEach((ln, i) => ctx.fillText(ln, headlineX, cursorY + i * b.lineHeight));
    }
    cursorY += b.lines.length * b.lineHeight + b.fontSize * 0.12;
  });
  ctx.restore();

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

  // If the shop name/contact text is short, the panel has unused width to its
  // right (the box is sized to fit the longest possible line, not the actual
  // one) — fill that dead space with a small packshot + a tool-icon badge
  // instead of leaving it blank.
  ctx.font = `700 ${Math.round(shopFontSize)}px Prompt, sans-serif`;
  const shopMaxW = shopLines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
  ctx.font = `500 ${Math.round(contactFontSize)}px 'Noto Sans Thai', sans-serif`;
  const contactMaxW = contactLines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
  const panelLeftoverW = panelW - innerPad * 3 - Math.max(shopMaxW, contactMaxW);
  if (panelLeftoverW > panelH * 0.85 && productImgs.length && photoVisible) {
    const fillAreaH = panelH - innerPad * 1.4;
    const fillAreaW = Math.min(panelLeftoverW - innerPad, fillAreaH * 1.15);
    const fillAreaX = panelX + panelW - innerPad - fillAreaW;
    const fillAreaY = panelY + innerPad * 0.7;
    awDrawImageContain(ctx, productImgs[0].photo, fillAreaX, fillAreaY, fillAreaW, fillAreaH);
    const wrenchSize = fillAreaH * 0.34;
    ctx.save();
    ctx.font = `${Math.round(wrenchSize)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = wrenchSize * 0.3;
    ctx.fillText('🔧', fillAreaX + fillAreaW - wrenchSize * 0.35, fillAreaY + wrenchSize * 0.35);
    ctx.restore();
  }

  // Hand back the (unrotated) bounding boxes for every independently
  // draggable group — headline stack, logo + wordmark(s), and the packshot —
  // so the caller can hit-test mouse/touch drags against them and convert a
  // drag delta back into the same offset units drawArtwork reads here.
  return {
    headlineBounds: measuredBlocks.length
      ? { x: headlineX - headlineMaxW / 2, y: textBlockStartY, w: headlineMaxW, h: totalTextH, rotationDeg: textRotationDeg, pivotX: headlineX, pivotY }
      : null,
    logoBounds,
    wordmarkBounds,
    photoBounds: productImgs.length && photoVisible ? photoBounds : null,
    customLogoBounds
  };
}

function initArtworkPage(c) {
  const a = c.artwork;
  const sizeSel = document.getElementById('aw-size');
  const widthInput = document.getElementById('aw-width-cm');
  const heightInput = document.getElementById('aw-height-cm');
  const bgStyleGroup = document.getElementById('aw-bgstyle-group');
  const productSel = document.getElementById('aw-product');
  const shopInput = document.getElementById('aw-shopname');
  const contactInput = document.getElementById('aw-contact');
  const headlineInput = document.getElementById('aw-headline');
  const subheadlineInput = document.getElementById('aw-subheadline');
  const bodyInput = document.getElementById('aw-body');
  const headlineScaleInput = document.getElementById('aw-headline-scale');
  const subheadlineScaleInput = document.getElementById('aw-subheadline-scale');
  const bodyScaleInput = document.getElementById('aw-body-scale');
  const textStyleGroup = document.getElementById('aw-text-style-group');
  const textOffsetX = document.getElementById('aw-text-offset-x');
  const textOffsetY = document.getElementById('aw-text-offset-y');
  const textScale = document.getElementById('aw-text-scale');
  const textRotation = document.getElementById('aw-text-rotation');
  const decorManBtn = document.getElementById('aw-decor-man');
  const decorNo1Btn = document.getElementById('aw-decor-no1');
  const decorManSize = document.getElementById('aw-decor-man-size');
  const decorNo1Size = document.getElementById('aw-decor-no1-size');
  const canvas = document.getElementById('aw-canvas');
  const downloadBtn = document.getElementById('aw-download');
  const resNote = document.getElementById('aw-resolution-note');
  if (!canvas) return;
  const ui = getArtworkEditorLabels();
  const logoUploadBtn = document.getElementById('aw-logo-upload');
  const logoUploadLabel = document.getElementById('aw-logo-upload-label');
  const logoFileInput = document.getElementById('aw-logo-file');
  const selectedLabel = document.getElementById('aw-selected-label');
  const selectedState = document.getElementById('aw-selected-state');
  const selectedScaleOutput = document.getElementById('aw-selected-scale');
  const smallerBtn = document.getElementById('aw-smaller');
  const largerBtn = document.getElementById('aw-larger');
  const rotateLeftBtn = document.getElementById('aw-rotate-left');
  const rotateRightBtn = document.getElementById('aw-rotate-right');
  const resetElementBtn = document.getElementById('aw-reset-element');
  const removeElementBtn = document.getElementById('aw-remove-element');
  const layerButtons = Array.from(document.querySelectorAll('[data-aw-layer]'));

  let selectedGroup = 'headline';
  let logoOffsetXFrac = 0, logoOffsetYFrac = 0;
  let wordmarkOffsetXFrac = 0, wordmarkOffsetYFrac = 0;
  let photoOffsetXFrac = 0, photoOffsetYFrac = 0;
  let customLogoOffsetXFrac = 0, customLogoOffsetYFrac = 0;
  let logoScale = 1, wordmarkScale = 1, photoScale = 1, customLogoScale = 1;
  let logoVisible = true, wordmarkVisible = true, photoVisible = true, textVisible = true, customLogoVisible = true;
  let customLogoDataUrl = '';

  function swatchValue(group, fallback) {
    const active = group.querySelector('.artwork-swatch.active');
    return active ? active.dataset.value : fallback;
  }

  function wireSwatchGroup(group, onChange) {
    group.querySelectorAll('.artwork-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.artwork-swatch').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
        onChange();
      });
    });
  }

  function currentSpec() {
    const preset = ARTWORK_SIZES[sizeSel.value] || ARTWORK_SIZES.banner;
    const wCm = Math.max(10, Number(widthInput.value) || preset.wCm);
    const hCm = Math.max(10, Number(heightInput.value) || preset.hCm);
    return { wCm, hCm };
  }

  function applyPresetSize() {
    const preset = ARTWORK_SIZES[sizeSel.value] || ARTWORK_SIZES.banner;
    widthInput.value = preset.wCm;
    heightInput.value = preset.hCm;
  }
  applyPresetSize();

  function currentState() {
    return {
      size: sizeSel.value,
      bgStyle: swatchValue(bgStyleGroup, 'diagonal'),
      product: productSel.value,
      shopName: shopInput.value,
      contact: contactInput.value,
      headline: headlineInput.value,
      subheadline: subheadlineInput.value,
      body: bodyInput.value,
      headlineScale: Number(headlineScaleInput.value) / 100,
      subheadlineScale: Number(subheadlineScaleInput.value) / 100,
      bodyScale: Number(bodyScaleInput.value) / 100,
      textStyle: swatchValue(textStyleGroup, 'orange'),
      textOffsetX: Number(textOffsetX.value),
      textOffsetY: Number(textOffsetY.value),
      textScale: Number(textScale.value),
      textRotation: Number(textRotation.value),
      logoOffsetXFrac,
      logoOffsetYFrac,
      wordmarkOffsetXFrac,
      wordmarkOffsetYFrac,
      photoOffsetXFrac,
      photoOffsetYFrac,
      customLogoOffsetXFrac,
      customLogoOffsetYFrac,
      logoScale,
      wordmarkScale,
      photoScale,
      customLogoScale,
      logoVisible,
      wordmarkVisible,
      photoVisible,
      textVisible,
      customLogoVisible,
      customLogoDataUrl,
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

  document.querySelectorAll('[data-aw-stepper]').forEach(stepper => {
    const input = document.getElementById(stepper.dataset.awStepper);
    const output = document.getElementById(`${stepper.dataset.awStepper}-output`);
    if (!input || !output) return;
    stepper.querySelectorAll('[data-aw-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        const min = Number(input.dataset.min);
        const max = Number(input.dataset.max);
        input.value = clamp(Number(input.value) + Number(btn.dataset.awStep), min, max);
        output.textContent = `${input.value}%`;
        schedulePreview();
      });
    });
  });

  const layerLabels = { headline: ui.text, photo: ui.product, logo: ui.brand, wordmark: ui.modelLogo, customLogo: ui.shopLogo };

  function groupVisible(group) {
    if (group === 'headline') return textVisible;
    if (group === 'photo') return photoVisible;
    if (group === 'logo') return logoVisible;
    if (group === 'wordmark') return wordmarkVisible;
    return !!customLogoDataUrl && customLogoVisible;
  }

  function groupScale(group) {
    if (group === 'headline') return Number(textScale.value) / 100;
    if (group === 'logo') return logoScale;
    if (group === 'wordmark') return wordmarkScale;
    if (group === 'photo') return photoScale;
    return customLogoScale;
  }

  function setGroupScale(group, scale) {
    const next = clamp(scale, 0.3, 2.5);
    if (group === 'headline') textScale.value = Math.round(next * 100);
    else if (group === 'logo') logoScale = next;
    else if (group === 'wordmark') wordmarkScale = next;
    else if (group === 'photo') photoScale = next;
    else customLogoScale = next;
  }

  function setGroupVisible(group, visible) {
    if (group === 'headline') textVisible = visible;
    else if (group === 'photo') photoVisible = visible;
    else if (group === 'logo') logoVisible = visible;
    else if (group === 'wordmark') wordmarkVisible = visible;
    else customLogoVisible = visible;
  }

  function updateEditorUi() {
    layerButtons.forEach(btn => {
      const group = btn.dataset.awLayer;
      const available = group !== 'customLogo' || !!customLogoDataUrl;
      const visible = groupVisible(group);
      btn.classList.toggle('active', group === selectedGroup);
      btn.classList.toggle('is-hidden', available && !visible);
      btn.classList.toggle('is-empty', !available);
      btn.setAttribute('aria-pressed', String(group === selectedGroup));
    });
    const hasCustomLogo = !!customLogoDataUrl;
    logoUploadLabel.textContent = hasCustomLogo ? ui.replaceLogo : ui.uploadLogo;
    selectedLabel.textContent = layerLabels[selectedGroup] || ui.text;
    const visible = groupVisible(selectedGroup);
    selectedState.textContent = visible ? '' : ui.hidden;
    selectedScaleOutput.textContent = `${Math.round(groupScale(selectedGroup) * 100)}%`;
    const canTransform = selectedGroup !== 'customLogo' || hasCustomLogo;
    [smallerBtn, largerBtn, resetElementBtn, removeElementBtn].forEach(btn => { btn.disabled = !canTransform; });
    rotateLeftBtn.disabled = selectedGroup !== 'headline' || !canTransform;
    rotateRightBtn.disabled = selectedGroup !== 'headline' || !canTransform;
    removeElementBtn.textContent = visible ? ui.remove : ui.restore;
    removeElementBtn.classList.toggle('artwork-action-danger', visible);
  }

  function selectGroup(group) {
    if (group === 'customLogo' && !customLogoDataUrl) {
      logoFileInput.click();
      return;
    }
    selectedGroup = group;
    updateEditorUi();
    schedulePreview(0);
  }

  layerButtons.forEach(btn => btn.addEventListener('click', () => selectGroup(btn.dataset.awLayer)));

  function adjustSelectedScale(delta) {
    if (selectedGroup === 'customLogo' && !customLogoDataUrl) return;
    setGroupScale(selectedGroup, groupScale(selectedGroup) + delta);
    updateEditorUi();
    schedulePreview(0);
  }
  smallerBtn.addEventListener('click', () => adjustSelectedScale(-0.1));
  largerBtn.addEventListener('click', () => adjustSelectedScale(0.1));
  rotateLeftBtn.addEventListener('click', () => {
    textRotation.value = clamp(Number(textRotation.value) - 5, -45, 45);
    schedulePreview(0);
  });
  rotateRightBtn.addEventListener('click', () => {
    textRotation.value = clamp(Number(textRotation.value) + 5, -45, 45);
    schedulePreview(0);
  });

  function resetGroup(group) {
    if (group === 'headline') {
      textOffsetX.value = 0; textOffsetY.value = 0; textScale.value = 100; textRotation.value = 0;
    } else if (group === 'logo') {
      logoOffsetXFrac = 0; logoOffsetYFrac = 0; logoScale = 1;
    } else if (group === 'wordmark') {
      wordmarkOffsetXFrac = 0; wordmarkOffsetYFrac = 0; wordmarkScale = 1;
    } else if (group === 'photo') {
      photoOffsetXFrac = 0; photoOffsetYFrac = 0; photoScale = 1;
    } else {
      customLogoOffsetXFrac = 0; customLogoOffsetYFrac = 0; customLogoScale = 1;
    }
    setGroupVisible(group, true);
    updateEditorUi();
    schedulePreview(0);
  }
  resetElementBtn.addEventListener('click', () => resetGroup(selectedGroup));
  removeElementBtn.addEventListener('click', () => {
    if (selectedGroup === 'customLogo' && !customLogoDataUrl) return;
    setGroupVisible(selectedGroup, !groupVisible(selectedGroup));
    updateEditorUi();
    schedulePreview(0);
  });

  logoUploadBtn.addEventListener('click', () => logoFileInput.click());
  logoFileInput.addEventListener('change', () => {
    const file = logoFileInput.files && logoFileInput.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) {
      window.alert(ui.invalidLogo);
      logoFileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      customLogoDataUrl = String(reader.result || '');
      customLogoVisible = true;
      customLogoOffsetXFrac = 0;
      customLogoOffsetYFrac = 0;
      customLogoScale = 1;
      selectedGroup = 'customLogo';
      updateEditorUi();
      schedulePreview(0);
    };
    reader.readAsDataURL(file);
  });

  let redrawTimer = null;
  function schedulePreview(delay = 35) {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(updatePreview, delay);
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
    const spec = currentSpec();
    const { pxW, pxH } = computePreviewPixels(spec.wCm, spec.hCm);
    const offscreen = document.createElement('canvas');
    offscreen.width = pxW;
    offscreen.height = pxH;
    let result;
    try {
      result = await drawArtwork(offscreen.getContext('2d'), pxW, pxH, spec, st, c);
    } catch (err) {
      console.error('Artwork preview render failed, keeping last good preview', err);
      if (myGen === previewGeneration) setTimeout(() => { if (myGen === previewGeneration) updatePreview(); }, 400);
      return;
    }
    if (myGen !== previewGeneration) return;
    canvas.width = pxW;
    canvas.height = pxH;
    canvas.getContext('2d').drawImage(offscreen, 0, 0);
    // Remembered so the drag handlers below can hit-test each draggable group
    // and convert a pointer delta into the same px→percent scale drawArtwork
    // used to place it.
    lastBounds = result ? {
      headline: result.headlineBounds,
      logo: result.logoBounds,
      wordmark: result.wordmarkBounds,
      photo: result.photoBounds,
      customLogo: result.customLogoBounds
    } : { headline: null, logo: null, wordmark: null, photo: null, customLogo: null };
    lastPxW = pxW;
    lastPxH = pxH;
    drawSelectionOverlay();
    updateEditorUi();
  }

  // --- Drag the headline block, the logo/wordmark(s), or the packshot photo
  // directly on the canvas — three independently movable groups sharing one
  // pointer handler, distinguished by which group's bounding box was hit.
  let lastBounds = { headline: null, logo: null, wordmark: null, photo: null, customLogo: null };
  let lastPxW = 0;
  let lastPxH = 0;
  let dragState = null;

  function handleRadius() {
    return Math.max(9, Math.min(canvas.width, canvas.height) * 0.022);
  }

  function resizeHandle(group) {
    const b = lastBounds[group];
    return b ? { x: b.x + b.w, y: b.y + b.h, r: handleRadius() } : null;
  }

  function drawSelectionOverlay() {
    const b = lastBounds[selectedGroup];
    if (!b || !groupVisible(selectedGroup)) return;
    const ctx = canvas.getContext('2d');
    const line = Math.max(2, Math.min(canvas.width, canvas.height) * 0.004);
    const h = resizeHandle(selectedGroup);
    ctx.save();
    ctx.strokeStyle = '#FF6A3D';
    ctx.lineWidth = line;
    ctx.setLineDash([line * 3, line * 2]);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#FF6A3D';
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FF6A3D';
    ctx.font = `700 ${Math.round(h.r * 1.25)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↘', h.x, h.y);
    ctx.restore();
  }

  function hitResizeHandle(pt) {
    const h = resizeHandle(selectedGroup);
    if (!h || !groupVisible(selectedGroup)) return false;
    return Math.hypot(pt.x - h.x, pt.y - h.y) <= h.r * 1.7;
  }

  function canvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function hitBounds(b, pt) {
    if (!b) return false;
    if (b.rotationDeg) {
      // Undo the block's own rotation around its pivot before the axis-aligned
      // bounds test, so dragging still hit-tests correctly when tilted.
      const angle = -(b.rotationDeg || 0) * Math.PI / 180;
      const dx = pt.x - b.pivotX;
      const dy = pt.y - b.pivotY;
      const rx = dx * Math.cos(angle) - dy * Math.sin(angle) + b.pivotX;
      const ry = dx * Math.sin(angle) + dy * Math.cos(angle) + b.pivotY;
      return rx >= b.x && rx <= b.x + b.w && ry >= b.y && ry <= b.y + b.h;
    }
    return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
  }

  function hitGroup(pt) {
    if (hitBounds(lastBounds.customLogo, pt)) return 'customLogo';
    if (hitBounds(lastBounds.headline, pt)) return 'headline';
    if (hitBounds(lastBounds.photo, pt)) return 'photo';
    if (hitBounds(lastBounds.wordmark, pt)) return 'wordmark';
    if (hitBounds(lastBounds.logo, pt)) return 'logo';
    return null;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function groupOffset(group) {
    if (group === 'headline') return { x: Number(textOffsetX.value), y: Number(textOffsetY.value) };
    if (group === 'logo') return { x: logoOffsetXFrac, y: logoOffsetYFrac };
    if (group === 'wordmark') return { x: wordmarkOffsetXFrac, y: wordmarkOffsetYFrac };
    if (group === 'photo') return { x: photoOffsetXFrac, y: photoOffsetYFrac };
    return { x: customLogoOffsetXFrac, y: customLogoOffsetYFrac };
  }

  function pointerDown(clientX, clientY) {
    const pt = canvasPoint(clientX, clientY);
    if (hitResizeHandle(pt)) {
      dragState = {
        group: selectedGroup,
        mode: 'resize',
        startX: pt.x,
        startY: pt.y,
        startScale: groupScale(selectedGroup)
      };
      canvas.classList.add('is-dragging');
      return true;
    }
    const group = hitGroup(pt);
    if (!group) return false;
    selectedGroup = group;
    updateEditorUi();
    const start = groupOffset(group);
    dragState = { group, mode: 'move', startX: pt.x, startY: pt.y, startOffsetX: start.x, startOffsetY: start.y };
    canvas.classList.add('is-dragging');
    return true;
  }

  function pointerMove(clientX, clientY) {
    if (!dragState) {
      const pt = canvasPoint(clientX, clientY);
      canvas.classList.toggle('is-resizable', hitResizeHandle(pt));
      canvas.classList.toggle('is-draggable', !hitResizeHandle(pt) && !!hitGroup(pt));
      return;
    }
    const pt = canvasPoint(clientX, clientY);
    const dx = pt.x - dragState.startX;
    const dy = pt.y - dragState.startY;
    if (dragState.mode === 'resize') {
      const basis = Math.max(80, Math.min(lastPxW, lastPxH) * 0.45);
      setGroupScale(dragState.group, dragState.startScale + (dx + dy) / basis);
      updateEditorUi();
    } else if (dragState.group === 'headline') {
      // Same px↔percent mapping drawArtwork uses for textOffsetXpx/textOffsetYpx,
      // inverted here so a drag of N canvas pixels moves the text by exactly
      // that many pixels rather than some slider-scaled amount.
      const dxPct = lastPxW ? (dx / (lastPxW * 0.12)) * 100 : 0;
      const dyPct = lastPxH ? (dy / (lastPxH * 0.10)) * 100 : 0;
      textOffsetX.value = clamp(Math.round(dragState.startOffsetX + dxPct), -100, 100);
      textOffsetY.value = clamp(Math.round(dragState.startOffsetY + dyPct), -100, 100);
    } else {
      // Logo/photo offsets are stored as a plain fraction of pxW/pxH (1:1 with
      // the drag, no slider involved), clamped so a wild drag can't push the
      // element fully off-canvas.
      const dxFrac = clamp((lastPxW ? dx / lastPxW : 0), -0.35, 0.35);
      const dyFrac = clamp((lastPxH ? dy / lastPxH : 0), -0.35, 0.35);
      const newX = clamp(dragState.startOffsetX + dxFrac, -0.35, 0.35);
      const newY = clamp(dragState.startOffsetY + dyFrac, -0.35, 0.35);
      if (dragState.group === 'logo') { logoOffsetXFrac = newX; logoOffsetYFrac = newY; }
      else if (dragState.group === 'wordmark') { wordmarkOffsetXFrac = newX; wordmarkOffsetYFrac = newY; }
      else if (dragState.group === 'photo') { photoOffsetXFrac = newX; photoOffsetYFrac = newY; }
      else { customLogoOffsetXFrac = newX; customLogoOffsetYFrac = newY; }
    }
    schedulePreview(16);
  }

  function pointerUp() {
    if (!dragState) return;
    dragState = null;
    canvas.classList.remove('is-dragging');
    canvas.classList.remove('is-resizable');
  }

  function pointerReset(clientX, clientY) {
    const group = hitGroup(canvasPoint(clientX, clientY));
    if (!group) return;
    selectedGroup = group;
    resetGroup(group);
  }

  canvas.addEventListener('mousedown', e => { if (pointerDown(e.clientX, e.clientY)) e.preventDefault(); });
  window.addEventListener('mousemove', e => pointerMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', pointerUp);
  // A stray element can't otherwise be recovered once no slider tracks its
  // position — double-click/tap snaps whichever group was clicked back to its
  // default spot.
  canvas.addEventListener('dblclick', e => pointerReset(e.clientX, e.clientY));

  canvas.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (t && pointerDown(t.clientX, t.clientY)) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (t && dragState) { pointerMove(t.clientX, t.clientY); e.preventDefault(); }
  }, { passive: false });
  canvas.addEventListener('touchend', pointerUp);

  sizeSel.addEventListener('change', () => { applyPresetSize(); schedulePreview(); });
  widthInput.addEventListener('input', schedulePreview);
  heightInput.addEventListener('input', schedulePreview);
  wireSwatchGroup(bgStyleGroup, schedulePreview);
  productSel.addEventListener('change', () => { photoVisible = true; schedulePreview(); });
  shopInput.addEventListener('input', schedulePreview);
  contactInput.addEventListener('input', schedulePreview);
  headlineInput.addEventListener('input', schedulePreview);
  subheadlineInput.addEventListener('input', schedulePreview);
  bodyInput.addEventListener('input', schedulePreview);
  wireSwatchGroup(textStyleGroup, schedulePreview);
  textOffsetX.addEventListener('input', schedulePreview);
  textOffsetY.addEventListener('input', schedulePreview);
  textScale.addEventListener('input', schedulePreview);
  textRotation.addEventListener('input', schedulePreview);
  decorManSize.addEventListener('input', schedulePreview);
  decorNo1Size.addEventListener('input', schedulePreview);

  window.addEventListener('keydown', e => {
    const tag = document.activeElement && document.activeElement.tagName;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
      if (selectedGroup === 'customLogo' && !customLogoDataUrl) return;
      setGroupVisible(selectedGroup, false);
      updateEditorUi();
      schedulePreview(0);
      e.preventDefault();
    }
  });

  downloadBtn.addEventListener('click', async () => {
    downloadBtn.disabled = true;
    const originalLabel = downloadBtn.textContent;
    downloadBtn.textContent = a.downloadingLabel;
    try {
      const st = currentState();
      const spec = currentSpec();
      const { pxW, pxH, dpi } = computePrintPixels(spec.wCm, spec.hCm);
      const off = document.createElement('canvas');
      off.width = pxW;
      off.height = pxH;
      const ctx = off.getContext('2d');
      await drawArtwork(ctx, pxW, pxH, spec, st, c);
      const sizeLabel = spec.wCm >= spec.hCm
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

  updateEditorUi();
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
  'materials-custom': renderMaterialsCustom,
  'order-catalog': renderOrderCatalog,
  'order-checkout': renderOrderCheckout,
  'order-tracking': renderOrderTracking,
  'po-request': renderPoRequest
};

function applyStaticText(c) {
  document.title = `${c.meta.siteName} — ${c.meta.tagline}`;
  document.querySelector('.brand-tagline').textContent = c.meta.tagline;
  document.querySelector('.hero h1').textContent = c.hero.title;
  document.querySelector('.hero p').textContent = c.hero.subtitle;
  document.querySelector('.hero .hero-cta-label').textContent = c.hero.cta;
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

  app.querySelectorAll('.file-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.add('is-loading');
      setTimeout(() => pill.classList.remove('is-loading'), 900);
    });
  });

  app.querySelectorAll('[data-lightbox-src]').forEach(btn => {
    btn.addEventListener('click', () => openLightbox(btn.dataset.lightboxSrc, btn.dataset.lightboxAlt, btn.dataset.lightboxCaption));
  });

  if (state.route === 'artwork' || state.route === 'materials-custom') initArtworkPage(c);
  if (state.route === 'product' || state.route === 'product-engine' || state.route === 'product-tiller') initApplicationCarousels();
  if (state.route === 'marketing') initActivityCards(c);
  if (state.route === 'service') initMaintenanceSchedule();
  if (state.route === 'parts') initPartsModelCatalog(c);
  if (state.route === 'order-catalog') initOrderCatalogPage(c);
  if (state.route === 'order-checkout') initOrderCheckoutPage(c);
  if (state.route === 'order-tracking') initOrderTrackingPage(c);
  if (state.route === 'po-request') initPoRequestPage(c);
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
  if (route.startsWith('order-')) {
    const sub = route.replace('order-', '');
    return `${c.nav.order}${c.order && c.order.tabs && c.order.tabs[sub] ? ' — ' + c.order.tabs[sub] : ''}`;
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
  if (e.differences) (e.differences.items || []).forEach(i => pushEntry(idx, 'product-engine', i.title, i.desc));
  if (e.starterSystems) (e.starterSystems.items || []).forEach(i => pushEntry(idx, 'product-engine', i.title, i.desc, e.starterSystems.title));
  if (e.authenticity) (e.authenticity.points || []).forEach((pt, i) => {
    const text = typeof pt === 'string' ? pt : pt.text;
    pushEntry(idx, 'product-engine', `${e.authenticity.title} #${i + 1}`, text);
  });
  if (e.preDelivery) (e.preDelivery.points || []).forEach(pt =>
    pushEntry(idx, 'product-engine', pt.title, pt.desc, (pt.steps || []).join(' ')));
  if (e.startProcedure) pushEntry(idx, 'product-engine', e.startProcedure.title, (e.startProcedure.steps || []).join(' '));
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
  pushEntry(idx, 'parts', p.title, p.intro);

  // Service
  const s = c.service;
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

  // Marketing materials
  pushEntry(idx, 'materials-custom', c.artwork.title, c.artwork.intro);
  if (c.materials && c.materials.company) {
    pushEntry(idx, 'materials-company', c.materials.company.title, c.materials.company.intro);
  }

  // Order
  if (c.order) {
    pushEntry(idx, 'order-catalog', c.order.title, c.order.intro);
    pushEntry(idx, 'order-checkout', c.order.tabs.checkout, c.order.checkout.step3Body);
    pushEntry(idx, 'order-tracking', c.order.tabs.tracking, c.order.tracking.disclaimer);
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
