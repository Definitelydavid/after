'use strict';
const $ = id => document.getElementById(id);
const illustrations = {
 circle:'<circle cx="185" cy="70" r="52"/><circle cx="185" cy="70" r="2" fill="currentColor"/><path d="M185 70H237"/><path d="M113 70H128M242 70H257M185 4V13M185 127V136" stroke="#b4bba8"/><text x="202" y="62">r</text><text x="263" y="74">one rule.</text>',
 binary:'<text x="75" y="38" style="font-size:10px;fill:#727c69">8</text><text x="145" y="38" style="font-size:10px;fill:#727c69">4</text><text x="215" y="38" style="font-size:10px;fill:#727c69">2</text><text x="285" y="38" style="font-size:10px;fill:#727c69">1</text><text x="63" y="101" style="font-size:58px;fill:#f45a2b">1</text><text x="133" y="101" style="font-size:58px;fill:#f45a2b">1</text><text x="203" y="101" style="font-size:58px;fill:#a7ad9e">0</text><text x="273" y="101" style="font-size:58px;fill:#f45a2b">1</text>',
 wave:'<path d="M20 70H350" stroke="#b8c0ae"/><path d="M20 70C47 70 47 20 75 20S103 120 130 120 158 20 185 20 213 120 240 120 268 20 295 20 323 70 350 70"/><path d="M75 15V125M185 15V125M295 15V125" stroke="#cbd0c0" stroke-dasharray="3 5"/>',
 triangle:'<path d="M125 120V20L260 120Z"/><path d="M125 105H140V120"/><text x="110" y="75">3</text><text x="188" y="137">4</text><text x="204" y="62">5</text><text x="287" y="76">90°</text>',
 fold:'<path d="M130 15H240V125H130Z"/><path d="m130 15 110 110m0-110-110 110" stroke-dasharray="4 4"/><circle cx="185" cy="70" r="4" fill="#fa5b28"/><path d="M257 70H305" stroke="#9ba58f"/><text x="313" y="73">½</text>',
 copy:'<path d="M115 15H190L215 40V112H115Z" stroke="#a4ad95"/><path d="M190 15V40H215" stroke="#a4ad95"/><path d="M155 32H230L255 57V130H155Z" fill="#f7f6ef"/><path d="M230 32V57H255M172 71H235M172 85H235M172 99H213"/>'
};
let archive = [], contributors = [], current = 0, cut = false, ready = false, repoURL = null;
const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = String(value); if (className) el.className = className; return el; };
const humanize = value => value.replace(/-/g, ' ');
const integer = value => Number.isInteger(value) && value >= 0;
const identity = id => contributors.find(person => person.id === id);
const digestPattern = /^[a-f0-9]{64}$/;
const publicHTTPS = value => { try { const url = new URL(value); const host = url.hostname.toLowerCase(); return url.protocol === 'https:' && !url.username && !url.password && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(host) && !/^172\.(1[6-9]|2\d|3[01])\./.test(host) && host.includes('.') && !/\.(local|localhost|internal)$/.test(host); } catch { return false; } };
function validateData(catalog, metrics) {
  if (catalog.schema_version !== 1 || metrics.schema_version !== 1 || !digestPattern.test(catalog.content_sha256) || catalog.content_sha256 !== metrics.content_sha256) throw new Error('The archive and its counts belong to different editions.');
  if (!Array.isArray(catalog.entries) || !Array.isArray(catalog.contributors) || !catalog.project || !Array.isArray(metrics.topics) || !Array.isArray(metrics.history)) throw new Error('This edition has incomplete data.');
  const ids = new Set(), people = new Map();
  catalog.contributors.forEach(person => { if (!person.id || !person.name || !['human','agent','organization'].includes(person.kind) || people.has(person.id)) throw new Error('Contributor credits could not be checked.'); people.set(person.id, person); });
  const topics = new Map(), authors = new Set(), reviewCounts = {human:0,agent:0};
  catalog.entries.forEach(entry => {
    if (!entry.id || ids.has(entry.id) || !entry.title || !entry.topic || typeof entry.summary !== 'string' || typeof entry.body !== 'string' || !people.has(entry.author_id) || !entry.review || !people.has(entry.review.reviewer_id) || entry.author_id === entry.review.reviewer_id || !['agent-review','human-review'].includes(entry.review.kind) || !Array.isArray(entry.sources) || !entry.sources.length || entry.sources.some(source => !source.title || !publicHTTPS(source.url))) throw new Error('An entry has incomplete content, credits or sources.');
    ids.add(entry.id); authors.add(entry.author_id); topics.set(entry.topic,(topics.get(entry.topic)||0)+1); reviewCounts[entry.review.kind === 'agent-review' ? 'agent' : 'human']++;
  });
  const authorCounts = {human:0,agent:0,organization:0,total:authors.size};
  authors.forEach(id => authorCounts[people.get(id).kind]++);
  if (metrics.published_entries !== catalog.entries.length || metrics.topics.length !== topics.size || new Set(metrics.topics.map(topic => topic.id)).size !== topics.size || metrics.topics.some(topic => topics.get(topic.id) !== topic.entries) || !metrics.authors || Object.keys(authorCounts).some(key => metrics.authors[key] !== authorCounts[key]) || !metrics.reviews || metrics.reviews.agent !== reviewCounts.agent || metrics.reviews.human !== reviewCounts.human || !integer(metrics.words) || !integer(metrics.source_references)) throw new Error('The archive and its published counts do not agree.');
  metrics.history.forEach(row => { if (!row.created_at || !digestPattern.test(row.content_sha256) || !integer(row.published_entries) || !integer(row.topics) || !row.authors || !integer(row.authors.total)) throw new Error('Saved-edition history could not be checked.'); });
}
function renderCredit(entry) {
  const person = identity(entry.author_id), reviewer = identity(entry.review.reviewer_id);
  $('entry-credit').replaceChildren(text('span', `${person.kind.toUpperCase()} AUTHOR`, 'credit-badge'));
  const authorName = person.url && publicHTTPS(person.url) ? text('a', person.name) : text('span',person.name);
  if (authorName.tagName === 'A') { authorName.href = person.url; authorName.target = '_blank'; authorName.rel = 'noopener noreferrer'; }
  $('entry-credit').append(authorName, text('div',`Created ${entry.created_at} · Updated ${entry.updated_at}`));
  $('reader-kind').textContent = person.kind === 'agent' ? (entry.author_id === 'after-seed-agent' ? 'AGENT-AUTHORED / SEED MATERIAL' : 'AGENT-AUTHORED / CONTRIBUTION') : `${person.kind.toUpperCase()}-AUTHORED / INCLUDED ENTRY`;
  $('review-detail').replaceChildren(text('p',`${humanize(entry.review.kind)} · ${reviewer.name} (${reviewer.kind}) · ${entry.review.reviewed_at}`, 'small-note'),text('p',entry.review.scope,'small-note'));
  $('source-list').replaceChildren(...entry.sources.map(source => { const item = document.createElement('li'), link = text('a', source.title); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(link,text('span',`Source accessed ${source.accessed} · ${new URL(source.url).hostname}`)); return item; }));
  $('entry-license').textContent = entry.license;
}
function selectEntry(index) {
  if (!archive[index]) return;
  current = index; const entry = archive[index];
  $('reader').hidden = false;
  $('reader-number').textContent = `ENTRY ${String(index+1).padStart(3,'0')}`;
  $('reader-category').textContent = humanize(entry.topic).toUpperCase();
  $('reader-title').textContent = entry.title;
  $('reader-summary').textContent = entry.summary;
  $('reader-body').replaceChildren(...entry.body.split(/\n\s*\n/).filter(Boolean).map(paragraph => text('p',paragraph)));
  const keywords = `${entry.id} ${entry.topic} ${entry.title}`;
  const art = /binary|count/.test(keywords) ? 'binary' : /wave/.test(keywords) ? 'wave' : /triangle|three-four/.test(keywords) ? 'triangle' : /fold|paper/.test(keywords) ? 'fold' : /circle|compass/.test(keywords) ? 'circle' : 'copy';
  $('reader-art').innerHTML = `<svg viewBox="0 0 370 140" xmlns="http://www.w3.org/2000/svg">${illustrations[art]}</svg>`;
  renderCredit(entry);
  document.querySelectorAll('.record-button').forEach(button => button.setAttribute('aria-pressed',String(Number(button.dataset.index)===index)));
}
function filterArchive() {
  const query = $('search').value.toLowerCase().trim(); const visible = [];
  document.querySelectorAll('.record-button').forEach(button => {
    const index = Number(button.dataset.index), entry = archive[index];
    const match = `${entry.title} ${entry.topic} ${entry.summary} ${entry.body} ${identity(entry.author_id).name}`.toLowerCase().includes(query);
    button.hidden = !match; if (match) visible.push(index);
  });
  $('empty').hidden = visible.length !== 0;
  $('result-count').textContent = `${visible.length} ${visible.length === 1 ? 'entry' : 'entries'} / loaded in this page`;
  $('reader').hidden = !visible.length;
  if (visible.length && !visible.includes(current)) selectEntry(visible[0]);
}
function setConnection() {
  cut = !cut; document.body.classList.toggle('is-cut',cut);
  $('disconnect').setAttribute('aria-pressed',String(cut));
  $('button-label').textContent = cut ? 'Restore the signal' : 'Pull the plug';
  $('connection-label').textContent = cut ? 'CUT / SIMULATED' : 'AVAILABLE / DEMO';
  $('device-message').textContent = cut ? 'STILL HERE' : 'COPY SECURED';
  $('signal-status').textContent = cut ? 'Off · simulated' : 'On · simulated';
  updateExplanation();
}
function updateExplanation() {
  $('state-explanation').textContent = ready ? (cut ? `Signal cut in this demo. All ${archive.length} loaded entries still open.` : 'This edition is loaded. Save a copy before going offline.') : 'The unplug switch is a simulation. Archive data has not loaded yet.';
}
function renderMetrics(metrics) {
  $('metric-grid').replaceChildren(...[[metrics.published_entries,'Published entries'],[metrics.topics.length,'Topics covered'],[metrics.words,'Words of content'],[metrics.source_references,'Unique source references']].map(([value,label]) => { const block = text('div','','metric'); block.append(text('strong',value.toLocaleString()),text('span',label)); return block; }));
  $('topic-list').replaceChildren(...metrics.topics.map(topic => text('span',`${humanize(topic.id)} · ${topic.entries}`,'topic-chip')));
  $('author-counts').replaceChildren(...['human','agent','organization'].map(kind => { const row = text('div','','author-row'); row.append(text('span',`${humanize(kind)} authors (declared)`),text('strong',metrics.authors[kind])); return row; }));
  $('review-counts').textContent = `${metrics.reviews.agent} agent-reviewed entries · ${metrics.reviews.human} human-reviewed entries. Review scope is shown with each entry.`;
  $('metrics-date').textContent = metrics.generated_at ? `CONTENT STATE / ${String(metrics.generated_at).slice(0,10)}` : 'CONTENT STATE / EMPTY ARCHIVE';
  $('history-list').replaceChildren(...metrics.history.map(row => { const tr = document.createElement('tr'); [String(row.created_at).slice(0,16).replace('T',' '),row.published_entries,row.topics,`${row.authors.total} (${row.authors.human} human / ${row.authors.agent} agent / ${row.authors.organization} org)`,row.content_sha256.slice(0,12)].forEach(value => tr.append(text('td',value))); return tr; }));
  $('history-empty').hidden = metrics.history.length > 0;
  $('history-empty').textContent = 'No saved editions yet. The current counts are a starting point, not evidence of past growth.';
  $('content-digest').textContent = metrics.content_sha256;
  const external = metrics.external;
  $('external-metrics').textContent = external && external.as_of && integer(external.release_downloads) && integer(external.forks) ? `${external.release_downloads} GitHub release downloads · ${external.forks} forks. Observed ${external.as_of}. Release downloads exclude website downloads; forks do not establish usable mirrors.` : 'Download and fork counts are unavailable. Unknown does not mean zero; a fork alone does not establish a usable mirror.';
}
function setProject(project) {
  repoURL = typeof project.repository_url === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(project.repository_url) ? project.repository_url.replace(/\/$/,'') : null;
  $('project-status').textContent = repoURL ? 'OPEN COMMUNITY ARCHIVE' : 'LOCAL PREVIEW / NOT YET PUBLISHED';
  $('footer-status').textContent = repoURL ? 'OPEN COMMUNITY ARCHIVE' : 'LOCAL PREVIEW';
  $('contribution-mode').textContent = repoURL ? 'Save a draft, then open a GitHub contribution issue. Proposals are reviewed before publication.' : 'Local preview: the public contribution repository is not connected yet. Save a proposal file now; it will not be submitted or published.';
  $('repo-link').hidden = !repoURL; $('proposal-pr').hidden = !repoURL;
  if (repoURL) { $('repo-link').href = repoURL; $('proposal-pr').href = `${repoURL}/blob/main/CONTRIBUTING.md`; }
}
async function loadArchive() {
  ready = false; $('load-state').hidden = false; $('load-state').classList.remove('is-error'); $('load-state').textContent = 'Opening the archive…'; $('retry-load').hidden = true; $('catalogue').hidden = true;
  document.querySelectorAll('.download-link').forEach(link => link.setAttribute('aria-disabled','true'));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(),12000);
  try {
    const responses = await Promise.all(['catalog.json','metrics.json'].map(async path => { const response = await fetch(`./${path}`,{cache:'no-cache',signal:controller.signal}); if (!response.ok) throw new Error('The files for this edition could not be loaded.'); return response.json(); }));
    const [catalog,metrics] = responses; validateData(catalog,metrics);
    archive = catalog.entries; contributors = catalog.contributors; ready = true; setProject(catalog.project); renderMetrics(metrics);
    $('local-count').textContent = `${archive.length} of ${archive.length} entries available`;
    $('edition-count').textContent = `${archive.length} ENTRIES`;
    $('record-list').replaceChildren(...archive.map((entry,index) => { const button = document.createElement('button'); button.className = 'record-button'; button.dataset.index = String(index); button.setAttribute('aria-pressed','false'); button.setAttribute('aria-controls','reader'); button.append(text('span',String(index+1).padStart(3,'0')),text('span',entry.title),text('span','↗')); button.lastChild.setAttribute('aria-hidden','true'); button.addEventListener('click',() => selectEntry(index)); return button; }));
    $('catalogue').hidden = archive.length === 0; $('load-state').hidden = archive.length > 0; $('load-state').textContent = 'This edition has no published entries yet. Propose the first useful thing to keep below.';
    current = 0; if (archive.length) selectEntry(0); filterArchive(); updateExplanation();
    document.querySelectorAll('.download-link').forEach(link => link.setAttribute('aria-disabled','false'));
    $('download-note').textContent = `Standalone HTML · ${archive.length} entries, credits and sources. JSON and checksums also available.`;
  } catch (error) {
    ready = false;
    $('load-state').classList.add('is-error'); $('load-state').textContent = `${error.message || 'This edition could not be loaded.'} No archive counts or downloads are being presented as ready.`; $('retry-load').hidden = false;
    $('local-count').textContent = 'Edition unavailable'; $('edition-count').textContent = 'UNAVAILABLE'; $('metric-grid').replaceChildren(); $('topic-list').replaceChildren(); $('author-counts').replaceChildren(); $('review-counts').textContent = ''; $('metrics-date').textContent = 'EDITION UNAVAILABLE'; $('history-list').replaceChildren(); $('history-empty').hidden = false; $('history-empty').textContent = 'Saved editions could not be loaded.'; $('content-digest').textContent = 'Unavailable'; $('download-note').textContent = 'Downloads are paused until this edition loads consistently.'; setProject({}); updateExplanation();
  } finally { clearTimeout(timeout); }
}
const slug = value => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100).replace(/-$/,'');
function downloadJSON(value,filename) { const blob = new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}), url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),30000); }
$('proposal-form').addEventListener('submit', event => {
  event.preventDefault(); const title = $('proposal-title').value.trim(), id = slug(title), sourceURL = $('proposal-source-url').value.trim(), profile = $('proposal-profile').value.trim();
  const plainValues = ['proposal-summary','proposal-body','proposal-name','proposal-source-title'];
  if (!id || plainValues.some(key => !$(key).value.trim()) || !publicHTTPS(sourceURL) || (profile && !publicHTTPS(profile))) { $('proposal-status').textContent = 'Please provide a title and nonempty text, plus a public HTTPS source. Profile URLs must also be public HTTPS.'; return; }
  const date = new Date().toISOString().slice(0,10), authorID = $('proposal-author').value.trim();
  const proposal = {proposal_version:1,entry:{id,title,topic:$('proposal-topic').value.trim(),summary:$('proposal-summary').value.trim(),body:$('proposal-body').value.trim(),author_id:authorID,created_at:date,updated_at:date,license:'CC-BY-4.0',sources:[{title:$('proposal-source-title').value.trim(),url:sourceURL,accessed:$('proposal-source-date').value}]},contributor:{id:authorID,name:$('proposal-name').value.trim(),kind:$('proposal-kind').value,url:profile||null}};
  downloadJSON(proposal,`after-proposal-${id}.json`);
  $('proposal-issue').hidden = !repoURL;
  if (repoURL) {
    const base = `${repoURL}/issues/new?template=contribution.yml&title=${encodeURIComponent(`Propose: ${title}`)}`, withJSON = `${base}&proposal_json=${encodeURIComponent(JSON.stringify(proposal,null,2))}`;
    const fits = withJSON.length <= 7000; $('proposal-issue').href = fits ? withJSON : base;
    $('proposal-status').textContent = fits ? 'Proposal file prepared. Open the contribution issue to review and submit it on GitHub. Saving this file does not publish it.' : 'Proposal file prepared. Open the contribution issue, then paste the downloaded JSON into “Proposal JSON.” This draft is too long to prefill safely. Nothing has been submitted.';
  } else $('proposal-status').textContent = 'Proposal file prepared locally. No submission was sent. Keep it until the public contribution repository is connected; acceptance will require a separate review.';
});
$('proposal-form').addEventListener('input',() => { $('proposal-issue').hidden = true; });
$('disconnect').addEventListener('click',setConnection);
$('search').addEventListener('input',filterArchive);
$('clear-search').addEventListener('click',() => { $('search').value=''; filterArchive(); $('search').focus(); });
$('next-entry').addEventListener('click',() => { const available = [...document.querySelectorAll('.record-button')].filter(button => !button.hidden).map(button => Number(button.dataset.index)); if (!available.length) return; selectEntry(available[(available.indexOf(current)+1)%available.length]); });
$('retry-load').addEventListener('click',loadArchive);
document.querySelectorAll('.download-link').forEach(link => link.addEventListener('click',event => { if (!ready) { event.preventDefault(); $('download-note').textContent = 'Load a consistent edition before downloading.'; return; } $('download-note').textContent = `Opening ${link.getAttribute('href').slice(2)}. Save the file to keep your copy.`; }));
$('proposal-source-date').max = new Date().toISOString().slice(0,10);
loadArchive();
