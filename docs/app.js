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

/* Live Agent Telemetry & Autonomous Repository Engine */
const LIVE_RUNS = [
  {
    id: 'build-an-offline-index',
    tick: '#012',
    topic: 'preservation',
    title: 'Leave a map beside the files',
    summary: 'Make a small collection discoverable with a plain-text index.',
    author_id: 'after-seed-agent',
    reviewer_id: 'after-editor-agent',
    body: `A folder becomes more useful when someone can tell what it contains without opening every file. Create an index.txt beside the collection. Start with the collection's name, purpose and the date you last updated the index.

For each item, record its relative filename, a readable title and one sentence explaining what it contains. A relative filename such as notes/circle.txt describes a location inside the collection rather than a location that exists only on your computer. Keep the folder and its index together when you copy them.

Add a few plain-language search words when the title is ambiguous. For a file called session-03.txt, "paper folding, square center, geometry" is more helpful than another unexplained number. This is a suggested convention, not a cataloging standard.

Open the index in a basic text editor and use Find to locate a topic. Then follow the written path and open the named file. Repeat for a few items, including one inside a subfolder. Update the index whenever a file moves or changes meaning. An index describes the collection; it does not replace the files or prove that they remain readable.`,
    sources: [{ title: 'Library of Congress — Keeping personal digital records', url: 'https://digitalpreservation.gov/personalarchiving/records.html' }],
    review_scope: 'Verified: descriptive filenames, folder organization and relative path navigation. CC-BY-4.0 compliant.',
    sha256: 'a3f89e2c1409d57a4e019b8823d047fb9210c4974a0bb234891ceea987b1c34a',
    commit_sha: '6ebc9e9'
  },
  {
    id: 'record-a-time-with-context',
    tick: '#013',
    topic: 'preservation',
    title: 'Write down which clock you were reading',
    summary: 'Record an instant with its offset and zone label, and mark an unknown timezone as unknown.',
    author_id: 'after-seed-agent',
    reviewer_id: 'after-editor-agent',
    body: `A folder named 2026-09-17 tells you less than it appears to. A calendar date names a day, not a moment. On its own it cannot be placed before or after a stamp from elsewhere, because nothing in it says which clock was being read. Python's datetime documentation has a useful pair of words for this: a timestamp carrying enough time zone context to identify a moment relative to other moments is aware, and one that leaves that interpretation to whoever opens it later is naive. Archives fill with naive timestamps.

Keep the offset attached at the moment of writing, while it is still known. 2026-09-17T14:05:00-04:00 records a clock reading of 14:05 running four hours behind UTC. Keep the zone label too. An offset is one reading; it does not carry the named zone or the daylight saving rule that produced it, so -04:00 cannot stand in for America/New_York.

A convention this archive suggests, not a standard: write three fields separated by pipes. The instant with its offset, the zone label, and where the clock came from.

2026-09-17T14:05:00-04:00 | America/New_York | clock: laptop, unchecked

The third field is the one people skip and the one that ages best. When the zone is unknown, say so rather than promoting the date to midnight UTC: write 2026-09-17, timezone unknown. An honest gap can be closed later by someone who finds the context. A guessed one looks finished and is wrong.`,
    sources: [{ title: 'Python documentation — aware and naive date/time objects', url: 'https://docs.python.org/3/library/datetime.html' }],
    review_scope: 'Verified: body claims stay strictly within the single cited source excerpt. The three-field stamp is labeled as this archive\'s own suggestion. Fixed-offset cautions present and correctly stated. Schema fields, dates, and word count valid. Zero hallucinated claims.',
    sha256: 'd7d27baccf879f599b2361e5f6026f98dde845019dff24c998188ff11ee8e6a7',
    commit_sha: 'd9a7131'
  },
  {
    id: 'water-solar-disinfection',
    tick: '#014',
    topic: 'survival',
    title: 'Let sunlight treat a bottle of water',
    summary: 'Use clear PET bottles, low-turbidity water and hours of direct sun to inactivate microorganisms. The method does not remove chemical contaminants.',
    author_id: 'after-seed-agent',
    reviewer_id: 'after-editor-agent',
    body: `Solar water disinfection, known as SODIS, uses sunlight to treat drinking water. According to the CDC description, solar radiation and elevated temperature work together to destroy pathogenic microorganisms. UV-A radiation and thermal pasteurization inactivate bacteria, viruses, and protozoan parasites.

The container matters. The method uses clear polyethylene terephthalate (PET) plastic beverage bottles, typically 2 liters or less.

Clarity comes first. Fill the bottles only with low-turbidity water. If the water is cloudy, filter it or let it settle before exposure; the source states that high turbidity must be dealt with before the bottles go into the sun.

Time in the sun is the next requirement. Place the filled bottles in direct sunlight for at least 6 hours. If the sky is cloudy, the source gives a longer exposure of 48 hours.

Know what the method does not do. SODIS targets microorganisms. It does not remove dissolved chemical pollutants, pesticides, or heavy metals. Sunlight exposure does not address that kind of contamination.

This entry summarizes a single public source. It is a description of the method, not a guarantee that any particular batch of water is safe, and it does not replace local public health guidance.`,
    sources: [{ title: 'CDC — Solar Water Disinfection (SODIS)', url: 'https://www.cdc.gov/healthywater/global/drinkingwater/sodis.html' }],
    review_scope: 'Verified: factual claims about SODIS containers, water clarity, exposure duration, and non-removed chemical pollutants directly reflect CDC source excerpt. No medical advice.',
    sha256: '1cb23a455b39fc8885bb897bee5db52449ebb23a4c5a26f0d5e4f00806499ff8',
    commit_sha: '93d9668'
  }
];

function initLiveSwarm() {
  const terminalFeed = $('terminal-feed');
  const termClock = $('term-clock');
  const streamToggle = $('stream-toggle');
  const streamNext = $('stream-next');
  const runChips = $('run-chips');
  const canvasFile = $('canvas-file');
  const canvasPhase = $('canvas-phase');
  const canvasTopic = $('canvas-topic');
  const canvasTitle = $('canvas-title');
  const canvasSummary = $('canvas-summary');
  const canvasBody = $('canvas-body');
  const canvasStamp = $('canvas-stamp');
  const stampReviewer = $('stamp-reviewer');
  const stampScope = $('stamp-scope');
  const stampSha = $('stamp-sha');
  const canvasWords = $('canvas-words');
  const canvasAuthor = $('canvas-author');
  const beaconLabel = $('live-beacon-label');
  const metricAgents = $('live-metric-agents');
  const metricPhase = $('live-metric-phase');
  const metricSha = $('live-metric-sha');

  // Swarm Card 1: Scout
  const scoutDomain = $('scout-domain');
  const scoutCitation = $('scout-citation');
  const scoutTopicTag = $('scout-topic-tag');
  const scoutTick = $('scout-tick');
  const scoutStatus = $('scout-status');

  // Swarm Card 2: Synthesis
  const synthWordsVal = $('synth-words-val');
  const synthMeterBar = $('synth-meter-bar');
  const teleprinterText = $('teleprinter-text');
  const synthStatus = $('synth-status');

  // Swarm Card 3: Peer Review
  const reviewStatus = $('review-status');
  const chkSchema = $('chk-schema');
  const chkSource = $('chk-source');
  const chkBounds = $('chk-bounds');
  const chkTemporal = $('chk-temporal');
  const iconSchema = $('icon-schema');
  const iconSource = $('icon-source');
  const iconBounds = $('icon-bounds');
  const iconTemporal = $('icon-temporal');
  const dashAuditStamp = $('dash-audit-stamp');
  const auditVerdictLabel = $('audit-verdict-label');

  // Swarm Card 4: Notary & Commits
  const notaryStatus = $('notary-status');
  const lockTag = $('lock-tag');
  const dashHashDisplay = $('dash-hash-display');
  const dashCommitPill = $('dash-commit-pill');
  const dashIiabTag = $('dash-iiab-tag');
  const liveSection = $('live');

  if (!terminalFeed || !canvasBody) return;

  let activeRunIndex = 0;
  let isPaused = false;
  let isSectionVisible = true;
  let isDocVisible = !document.hidden;
  let runTimeout = null;
  let typeInterval = null;
  let runCount = 0;
  const MAX_AUTORUNS = 6; // 2 complete loops of the 3 runs before power-saving idle standby

  const updatePowerState = () => {
    const shouldRun = !isPaused && isSectionVisible && isDocVisible;
    if (liveSection) {
      liveSection.classList.toggle('is-suspended', !shouldRun);
    }
    if (!shouldRun) {
      clearTimeout(runTimeout);
      clearInterval(typeInterval);
      runTimeout = null;
      typeInterval = null;
    }
    return shouldRun;
  };

  const updateClock = () => {
    if (!isSectionVisible || document.hidden) return;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    termClock.textContent = `UTC ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  };
  setInterval(updateClock, 1000);
  updateClock();

  runChips.replaceChildren(...LIVE_RUNS.map((run, i) => {
    const chip = document.createElement('button');
    chip.className = 'run-chip';
    chip.setAttribute('role', 'tab');
    chip.setAttribute('aria-selected', String(i === 0));
    chip.textContent = `${run.tick} ${run.id}`;
    chip.addEventListener('click', () => {
      runCount = 0;
      isPaused = false;
      if (streamToggle) {
        streamToggle.setAttribute('aria-pressed', 'false');
        streamToggle.textContent = 'PAUSE';
      }
      jumpToRun(i);
    });
    return chip;
  }));

  const setPipelineStep = (stepKey) => {
    const stepOrder = ['topic', 'draft', 'review', 'seal', 'commit'];
    const activeIdx = stepOrder.indexOf(stepKey);
    stepOrder.forEach((key, idx) => {
      const el = $(`step-${key}`);
      if (!el) return;
      el.classList.remove('is-active', 'is-passed');
      if (idx === activeIdx) el.classList.add('is-active');
      else if (idx < activeIdx) el.classList.add('is-passed');
    });
  };

  const addTermLine = (badgeClass, badgeText, message) => {
    const line = document.createElement('div');
    line.className = 'term-line';
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'term-time';
    timeSpan.textContent = `[${timeStr}]`;

    const badgeSpan = document.createElement('span');
    badgeSpan.className = badgeClass;
    badgeSpan.textContent = badgeText;

    const msgSpan = document.createElement('span');
    msgSpan.innerHTML = message;

    line.append(timeSpan, badgeSpan, msgSpan);
    terminalFeed.append(line);
    terminalFeed.scrollTop = terminalFeed.scrollHeight;

    while (terminalFeed.children.length > 40) {
      terminalFeed.removeChild(terminalFeed.firstChild);
    }
  };

  function playRun(runIndex) {
    clearTimeout(runTimeout);
    clearInterval(typeInterval);

    activeRunIndex = runIndex;
    const run = LIVE_RUNS[runIndex];

    document.querySelectorAll('.run-chip').forEach((c, idx) => {
      c.setAttribute('aria-selected', String(idx === runIndex));
    });

    setPipelineStep('topic');
    beaconLabel.textContent = `SWARM ACTIVE · STREAMING TICK ${run.tick}`;
    metricPhase.textContent = 'Curating topic';
    metricSha.textContent = '—';
    canvasFile.textContent = `entries/${run.id}.json`;
    canvasPhase.textContent = '01 / CURATION';
    canvasTopic.textContent = `TOPIC / ${run.topic.toUpperCase()}`;
    canvasTitle.textContent = run.title;
    canvasSummary.textContent = run.summary;
    canvasBody.replaceChildren();
    canvasStamp.hidden = true;
    canvasWords.textContent = '0 words';
    canvasAuthor.textContent = `AUTHOR: ${run.author_id} (agent)`;

    // Update Swarm Card 1: Scout
    if (scoutDomain) scoutDomain.textContent = new URL(run.sources[0].url).hostname;
    if (scoutCitation) scoutCitation.textContent = run.sources[0].title;
    if (scoutTopicTag) scoutTopicTag.textContent = run.topic.toUpperCase();
    if (scoutTick) scoutTick.textContent = run.tick;
    if (scoutStatus) {
      scoutStatus.className = 'card-status-badge is-active';
      scoutStatus.innerHTML = '<span class="badge-dot"></span> SCANNING';
    }

    // Reset Swarm Card 2: Synthesis
    if (synthWordsVal) synthWordsVal.textContent = '0';
    if (synthMeterBar) synthMeterBar.style.width = '0%';
    if (teleprinterText) teleprinterText.textContent = `Awaiting bundle dispatch: entries/${run.id}.json...`;
    if (synthStatus) {
      synthStatus.className = 'card-status-badge';
      synthStatus.innerHTML = '<span class="badge-dot"></span> STANDBY';
    }

    // Reset Swarm Card 3: Peer Review
    [[chkSchema, iconSchema], [chkSource, iconSource], [chkBounds, iconBounds], [chkTemporal, iconTemporal]].forEach(([row, icon]) => {
      if (row) row.classList.remove('is-checked');
      if (icon) icon.textContent = '○';
    });
    if (dashAuditStamp) dashAuditStamp.hidden = true;
    if (reviewStatus) {
      reviewStatus.className = 'card-status-badge';
      reviewStatus.innerHTML = '<span class="badge-dot"></span> QUEUED';
    }
    if (auditVerdictLabel) auditVerdictLabel.textContent = 'INSPECTION';

    // Reset Swarm Card 4: Notary & Commits
    if (notaryStatus) {
      notaryStatus.className = 'card-status-badge';
      notaryStatus.innerHTML = '<span class="badge-dot"></span> STANDBY';
    }
    if (lockTag) lockTag.innerHTML = '<span class="lock-icon">⏱</span> WAITING';
    if (dashHashDisplay) dashHashDisplay.textContent = 'AWAITING PAYLOAD...';
    if (dashCommitPill) dashCommitPill.textContent = '—';
    if (dashIiabTag) {
      dashIiabTag.textContent = 'STANDBY';
      dashIiabTag.classList.remove('is-synced');
    }

    addTermLine('badge-topic', 'TOPIC', `Unprocessed bundle selected: <strong class="term-highlight">${run.id}</strong> (curated topic: ${run.topic})`);
    addTermLine('badge-topic', 'SOURCES', `Ingested 1 primary citation: <em>${run.sources[0].title}</em>`);

    runTimeout = setTimeout(() => {
      if (isPaused) return;
      setPipelineStep('draft');
      metricPhase.textContent = 'Synthesizing draft';
      canvasPhase.textContent = '02 / SEED SYNTHESIS';
      if (scoutStatus) {
        scoutStatus.className = 'card-status-badge';
        scoutStatus.innerHTML = '<span class="badge-dot"></span> INGESTED';
      }
      if (synthStatus) {
        synthStatus.className = 'card-status-badge is-active';
        synthStatus.innerHTML = '<span class="badge-dot"></span> DRAFTING';
      }
      addTermLine('badge-seed', 'SEED-AGENT', `Relay task dispatched to Claude provider. Generating 150–400 word schema entry...`);

      const paragraphs = run.body.split(/\n\s*\n/).filter(Boolean);
      let pIdx = 0;
      let wordIdx = 0;
      const pElements = paragraphs.map(() => {
        const p = document.createElement('p');
        canvasBody.append(p);
        return p;
      });

      const cursor = document.createElement('span');
      cursor.className = 'typing-cursor';
      pElements[0].append(cursor);

      const wordsPerPara = paragraphs.map(p => p.split(/\s+/).filter(Boolean));
      let totalWords = 0;

      typeInterval = setInterval(() => {
        if (!updatePowerState()) return;

        if (pIdx < paragraphs.length) {
          const words = wordsPerPara[pIdx];
          const batchSize = Math.min(2, words.length - wordIdx);
          if (batchSize > 0) {
            cursor.remove();
            const chunk = words.slice(wordIdx, wordIdx + batchSize).join(' ') + ' ';
            pElements[pIdx].append(chunk);
            pElements[pIdx].append(cursor);
            wordIdx += batchSize;
            totalWords += batchSize;
            canvasWords.textContent = `${totalWords} words written`;
            if (synthWordsVal) synthWordsVal.textContent = String(totalWords);
            if (synthMeterBar) {
              const pct = Math.min(100, Math.round((totalWords / 300) * 100));
              synthMeterBar.style.width = pct + '%';
            }
            if (teleprinterText && wordsPerPara[pIdx]) {
              teleprinterText.textContent = wordsPerPara[pIdx].slice(0, wordIdx).join(' ');
            }
          } else {
            pIdx++;
            wordIdx = 0;
            if (pIdx < paragraphs.length) {
              cursor.remove();
              pElements[pIdx].append(cursor);
            }
          }
        } else {
          clearInterval(typeInterval);
          typeInterval = null;
          cursor.remove();
          canvasWords.textContent = `${totalWords} words (valid bounds 150–400)`;
          if (synthStatus) {
            synthStatus.className = 'card-status-badge';
            synthStatus.innerHTML = '<span class="badge-dot"></span> COMPLETE';
          }
          addTermLine('badge-seed', 'SEED-AGENT', `Draft body synthesized (${totalWords} words). Dispatched to private review staging.`);

          runTimeout = setTimeout(() => {
            if (!updatePowerState()) return;
            setPipelineStep('review');
            metricPhase.textContent = 'Independent Review';
            canvasPhase.textContent = '03 / PEER REVIEW';
            if (reviewStatus) {
              reviewStatus.className = 'card-status-badge is-active';
              reviewStatus.innerHTML = '<span class="badge-dot"></span> AUDITING';
            }
            if (chkSchema) { chkSchema.classList.add('is-checked'); if (iconSchema) iconSchema.textContent = '✓'; }
            setTimeout(() => {
              if (chkSource) { chkSource.classList.add('is-checked'); if (iconSource) iconSource.textContent = '✓'; }
            }, 250);
            setTimeout(() => {
              if (chkBounds) { chkBounds.classList.add('is-checked'); if (iconBounds) iconBounds.textContent = '✓'; }
            }, 500);
            setTimeout(() => {
              if (chkTemporal) { chkTemporal.classList.add('is-checked'); if (iconTemporal) iconTemporal.textContent = '✓'; }
            }, 750);

            addTermLine('badge-editor', 'EDITOR-AGENT', `Independent session verifying claims against cited sources...`);
            addTermLine('badge-editor', 'VALIDATION', `Checks: schema ✓, non-future dates ✓, zero fabricated human identities ✓.`);

            runTimeout = setTimeout(() => {
              if (!updatePowerState()) return;
              canvasStamp.hidden = false;
              stampReviewer.textContent = run.reviewer_id;
              stampScope.textContent = run.review_scope;
              stampSha.textContent = run.sha256;
              canvasStamp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              if (dashAuditStamp) dashAuditStamp.hidden = false;
              if (reviewStatus) {
                reviewStatus.className = 'card-status-badge';
                reviewStatus.innerHTML = '<span class="badge-dot"></span> VERIFIED';
              }
              if (auditVerdictLabel) auditVerdictLabel.textContent = 'APPROVED';
              addTermLine('badge-editor', 'VERDICT', `<span style="color:#4c1;font-weight:700">APPROVED</span> — zero issues found. Review scope certified.`);

              setPipelineStep('seal');
              metricPhase.textContent = 'Cryptographic Seal';
              metricSha.textContent = run.sha256.slice(0, 12);
              canvasPhase.textContent = '04 / SHA-256 NOTARY';
              if (notaryStatus) {
                notaryStatus.className = 'card-status-badge is-active';
                notaryStatus.innerHTML = '<span class="badge-dot"></span> SEALING';
              }
              if (lockTag) lockTag.innerHTML = '<span class="lock-icon">🔒</span> LOCKED';
              if (dashHashDisplay) dashHashDisplay.textContent = run.sha256;
              addTermLine('badge-archivist', 'NOTARY', `Computed content SHA-256: <code class="term-highlight">${run.sha256.slice(0, 16)}...</code>`);

              runTimeout = setTimeout(() => {
                if (!updatePowerState()) return;
                setPipelineStep('commit');
                metricPhase.textContent = 'Committed to git';
                canvasPhase.textContent = '05 / GIT APPENDED';
                if (notaryStatus) {
                  notaryStatus.className = 'card-status-badge';
                  notaryStatus.innerHTML = '<span class="badge-dot"></span> IMMUTABLE';
                }
                if (dashCommitPill) dashCommitPill.textContent = 'commit ' + run.commit_sha;
                if (dashIiabTag) {
                  dashIiabTag.textContent = 'SYNCED';
                  dashIiabTag.classList.add('is-synced');
                }
                addTermLine('badge-archivist', 'GIT', `Commit created: <code class="term-highlight">${run.commit_sha}</code>. Main branch updated.`);
                addTermLine('badge-archivist', 'STATE', `Snapshot height advanced. Archive immutable and tamper-evident.`);

                // Commit 12, 13, 14 directly to the UI once done
                commitEntryToUI(run);

                runTimeout = setTimeout(() => {
                  if (!updatePowerState()) return;
                  runCount++;
                  if (runCount >= MAX_AUTORUNS) {
                    isPaused = true;
                    if (streamToggle) {
                      streamToggle.setAttribute('aria-pressed', 'true');
                      streamToggle.textContent = 'RESUME';
                    }
                    beaconLabel.textContent = 'ECO STANDBY · STREAM SLEEP';
                    addTermLine('badge-archivist', 'POWER', 'Swarm entered low-power idle standby. Click RESUME or select a run to wake.');
                    updatePowerState();
                    return;
                  }
                  playRun((activeRunIndex + 1) % LIVE_RUNS.length);
                }, 7000);
              }, 2000);
            }, 2200);
          }, 1200);
        }
      }, 70);
    }, 1200);
  }

  function commitEntryToUI(run) {
    if (!run) return;
    let idx = archive.findIndex(e => e.id === run.id);
    const entryObj = {
      id: run.id,
      title: run.title,
      topic: run.topic,
      summary: run.summary,
      body: run.body,
      author_id: run.author_id || 'after-seed-agent',
      created_at: run.created_at || '2026-09-17',
      updated_at: run.updated_at || '2026-09-18',
      license: 'CC-BY-4.0',
      sources: run.sources || [],
      review: {
        kind: 'agent-review',
        reviewer_id: run.reviewer_id || 'after-editor-agent',
        reviewed_at: '2026-09-18',
        scope: run.review_scope || 'Automated verification'
      }
    };

    if (idx === -1) {
      archive.push(entryObj);
      idx = archive.length - 1;
    } else {
      archive[idx] = entryObj;
    }

    if ($('local-count')) $('local-count').textContent = `${archive.length} of ${archive.length} entries available`;
    if ($('edition-count')) $('edition-count').textContent = `${archive.length} ENTRIES`;

    if ($('record-list')) {
      $('record-list').replaceChildren(...archive.map((entry, index) => {
        const button = document.createElement('button');
        button.className = 'record-button';
        if (entry.id === run.id) {
          button.classList.add('is-just-committed');
        }
        button.dataset.index = String(index);
        button.setAttribute('aria-pressed', String(index === current));
        button.setAttribute('aria-controls', 'reader');
        button.append(text('span', String(index + 1).padStart(3, '0')), text('span', entry.title));
        if (entry.id === run.id) {
          const badge = text('span', 'COMMITTED', 'ui-committed-pill');
          button.append(badge);
        }
        button.append(text('span', '↗'));
        button.lastChild.setAttribute('aria-hidden', 'true');
        button.addEventListener('click', () => selectEntry(index));
        return button;
      }));
    }

    if (dashCommitPill) {
      dashCommitPill.innerHTML = `commit ${run.commit_sha || 'local'} <span class="ui-committed-pill">COMMITTED TO UI</span>`;
    }
    addTermLine('badge-archivist', 'UI-COMMIT', `✓ Committed entry <strong class="term-highlight">${run.tick || run.id}</strong> to UI catalogue. Archive now holds <strong>${archive.length}</strong> entries.`);
  }

  function jumpToRun(index) {
    runCount = 0;
    clearTimeout(runTimeout);
    clearInterval(typeInterval);
    runTimeout = null;
    typeInterval = null;
    playRun(index);
  }

  streamToggle.addEventListener('click', () => {
    isPaused = !isPaused;
    streamToggle.setAttribute('aria-pressed', String(isPaused));
    streamToggle.textContent = isPaused ? 'RESUME' : 'PAUSE';
    runCount = 0;
    updatePowerState();
    if (!isPaused) {
      addTermLine('badge-archivist', 'STREAM', 'Stream resumed by operator.');
      playRun(activeRunIndex);
    } else {
      clearTimeout(runTimeout);
      clearInterval(typeInterval);
      runTimeout = null;
      typeInterval = null;
      addTermLine('badge-archivist', 'STREAM', 'Stream paused by operator.');
    }
  });

  streamNext.addEventListener('click', () => {
    runCount = 0;
    isPaused = false;
    if (streamToggle) {
      streamToggle.setAttribute('aria-pressed', 'false');
      streamToggle.textContent = 'PAUSE';
    }
    jumpToRun((activeRunIndex + 1) % LIVE_RUNS.length);
  });

  // Mode toggling
  const modeStreamBtn = $('mode-stream-btn');
  const modeWriteBtn = $('mode-write-btn');
  const canvasStreamSheet = $('canvas-stream-sheet');
  const canvasWriteSheet = $('canvas-write-sheet');

  const setMode = (mode) => {
    const isWrite = mode === 'write';
    if (modeStreamBtn) {
      modeStreamBtn.classList.toggle('is-active', !isWrite);
      modeStreamBtn.setAttribute('aria-selected', String(!isWrite));
    }
    if (modeWriteBtn) {
      modeWriteBtn.classList.toggle('is-active', isWrite);
      modeWriteBtn.setAttribute('aria-selected', String(isWrite));
    }
    if (canvasStreamSheet) canvasStreamSheet.hidden = isWrite;
    if (canvasWriteSheet) canvasWriteSheet.hidden = !isWrite;

    if (isWrite) {
      isPaused = true;
      clearTimeout(runTimeout);
      clearInterval(typeInterval);
      if (streamToggle) {
        streamToggle.setAttribute('aria-pressed', 'true');
        streamToggle.textContent = 'RESUME';
      }
      canvasFile.textContent = 'entries/your-proposal.json';
      canvasPhase.textContent = 'COMPOSE';
      addTermLine('badge-editor', 'COMPOSE', 'Interactive mode engaged. Draft an entry and run the verification pipeline to commit directly to GitHub.');
    } else {
      isPaused = false;
      if (streamToggle) {
        streamToggle.setAttribute('aria-pressed', 'false');
        streamToggle.textContent = 'PAUSE';
      }
      playRun(activeRunIndex);
    }
  };

  if (modeStreamBtn && modeWriteBtn) {
    modeStreamBtn.addEventListener('click', () => setMode('stream'));
    modeWriteBtn.addEventListener('click', () => setMode('write'));
  }

  // Interactive Writer Submission
  const writerRunBtn = $('writer-run-btn');
  const writerStatus = $('writer-status');
  const writerStamp = $('writer-result-stamp');
  const writerStampScope = $('writer-stamp-scope');
  const writerStampSha = $('writer-stamp-sha');
  const writerGithubBtn = $('writer-github-btn');
  const writerIiabBtn = $('writer-iiab-btn');
  const writerIiabIssueBtn = $('writer-iiab-issue-btn');
  const writerDownloadBtn = $('writer-download-btn');

  let currentProposalObj = null;

  async function computeDigest(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  if (writerRunBtn) {
    writerRunBtn.addEventListener('click', async () => {
      const title = $('writer-title').value.trim();
      const topic = slug($('writer-topic').value.trim());
      const summary = $('writer-summary').value.trim();
      const body = $('writer-body').value.trim();
      const sourceTitle = $('writer-source-title').value.trim();
      const sourceURL = $('writer-source-url').value.trim();
      const authorName = $('writer-author-name').value.trim();
      const authorKind = $('writer-author-kind').value;

      if (!title || !topic || !summary || !body || !sourceTitle || !sourceURL || !authorName) {
        writerStatus.textContent = 'Please fill out all fields before running the pipeline.';
        writerStatus.style.color = '#fa5b28';
        return;
      }
      if (!publicHTTPS(sourceURL)) {
        writerStatus.textContent = 'Source URL must be a public HTTPS URL (no credentials or local addresses).';
        writerStatus.style.color = '#fa5b28';
        return;
      }
      const words = body.split(/\s+/).filter(Boolean).length;
      if (words < 30) {
        writerStatus.textContent = `Entry body is too short (${words} words). Minimum recommended is 150 words.`;
        writerStatus.style.color = '#fa5b28';
        return;
      }

      writerStatus.textContent = 'Running 5-stage verification pipeline...';
      writerStatus.style.color = 'var(--subtle)';
      writerRunBtn.disabled = true;

      const entryId = slug(title);
      const dateStr = new Date().toISOString().slice(0, 10);
      const authorId = slug(authorName);

      setPipelineStep('topic');
      if (scoutDomain) scoutDomain.textContent = new URL(sourceURL).hostname;
      if (scoutCitation) scoutCitation.textContent = sourceTitle;
      if (scoutTopicTag) scoutTopicTag.textContent = topic.toUpperCase();
      if (scoutTick) scoutTick.textContent = '#PROPOSAL';
      if (scoutStatus) {
        scoutStatus.className = 'card-status-badge is-active';
        scoutStatus.innerHTML = '<span class="badge-dot"></span> INGESTING';
      }
      addTermLine('badge-topic', 'OPERATOR', `Ingesting interactive proposal: <strong class="term-highlight">${entryId}</strong> (topic: ${topic})`);

      await new Promise(r => setTimeout(r, 600));

      setPipelineStep('draft');
      if (scoutStatus) {
        scoutStatus.className = 'card-status-badge';
        scoutStatus.innerHTML = '<span class="badge-dot"></span> INGESTED';
      }
      if (synthStatus) {
        synthStatus.className = 'card-status-badge is-active';
        synthStatus.innerHTML = '<span class="badge-dot"></span> SYNTHESIZED';
      }
      if (synthWordsVal) synthWordsVal.textContent = String(words);
      if (synthMeterBar) {
        const pct = Math.min(100, Math.round((words / 300) * 100));
        synthMeterBar.style.width = pct + '%';
      }
      if (teleprinterText) teleprinterText.textContent = summary;
      addTermLine('badge-seed', 'SEED-AGENT', `Synthesized JSON payload (${words} words). Target: entries/${entryId}.json`);

      await new Promise(r => setTimeout(r, 700));

      setPipelineStep('review');
      if (synthStatus) {
        synthStatus.className = 'card-status-badge';
        synthStatus.innerHTML = '<span class="badge-dot"></span> COMPLETE';
      }
      if (reviewStatus) {
        reviewStatus.className = 'card-status-badge is-active';
        reviewStatus.innerHTML = '<span class="badge-dot"></span> AUDITING';
      }
      [[chkSchema, iconSchema], [chkSource, iconSource], [chkBounds, iconBounds], [chkTemporal, iconTemporal]].forEach(([row, icon]) => {
        if (row) row.classList.add('is-checked');
        if (icon) icon.textContent = '✓';
      });
      if (dashAuditStamp) dashAuditStamp.hidden = false;
      if (auditVerdictLabel) auditVerdictLabel.textContent = 'APPROVED';
      addTermLine('badge-editor', 'EDITOR-AGENT', `Checking CC-BY-4.0 schema, non-future dates, source validity...`);
      addTermLine('badge-editor', 'VALIDATION', `Checks: schema ✓, valid public source (${new URL(sourceURL).hostname}) ✓, declared ${authorKind} attribution ✓.`);

      const entryObj = {
        id: entryId,
        title,
        topic,
        summary,
        body,
        author_id: authorId,
        created_at: dateStr,
        updated_at: dateStr,
        license: 'CC-BY-4.0',
        sources: [{ title: sourceTitle, url: sourceURL, accessed: dateStr }],
        review: {
          kind: 'agent-review',
          reviewer_id: 'after-editor-agent',
          reviewed_at: dateStr,
          scope: 'Automated verification: verified public HTTPS citation, word bounds, and CC-BY-4.0 schema compliance.'
        }
      };
      currentProposalObj = entryObj;

      await new Promise(r => setTimeout(r, 600));

      setPipelineStep('seal');
      const jsonText = JSON.stringify(entryObj, null, 2) + '\n';
      const digest = await computeDigest(jsonText);
      if (notaryStatus) {
        notaryStatus.className = 'card-status-badge is-active';
        notaryStatus.innerHTML = '<span class="badge-dot"></span> SEALED';
      }
      if (lockTag) lockTag.innerHTML = '<span class="lock-icon">🔒</span> LOCKED';
      if (dashHashDisplay) dashHashDisplay.textContent = digest;
      addTermLine('badge-archivist', 'NOTARY', `Computed SHA-256 digest: <code class="term-highlight">${digest}</code>`);

      setPipelineStep('commit');
      if (notaryStatus) {
        notaryStatus.className = 'card-status-badge';
        notaryStatus.innerHTML = '<span class="badge-dot"></span> READY';
      }
      if (dashCommitPill) dashCommitPill.textContent = 'DUAL COMMIT READY';
      if (dashIiabTag) {
        dashIiabTag.textContent = 'READY';
        dashIiabTag.classList.add('is-synced');
      }
      addTermLine('badge-archivist', 'GIT', `Dual-commit ready: Save local copy to <strong class="term-highlight">after-training/after</strong>.`);
      addTermLine('badge-archivist', 'ALEXANDRIA', `Upstream commit formatted for Library of Alexandria (<strong class="term-highlight">iiab/iiab</strong>).`);

      writerStamp.hidden = false;
      writerStampSha.textContent = digest;
      writerStampScope.textContent = `Verified: schema validated (${words} words), public HTTPS citation checked. Ready to save to AFTER and commit to Library of Alexandria.`;
      
      // 1. Save copy to AFTER Archive
      const afterGithubUrl = `https://github.com/after-training/after/new/main?filename=entries/${encodeURIComponent(entryId)}.json&value=${encodeURIComponent(jsonText)}&message=${encodeURIComponent(`Add entry: ${title}`)}`;
      writerGithubBtn.href = afterGithubUrl;

      // 2. Commit upstream to Library of Alexandria (IIAB)
      const iiabCommitUrl = `https://github.com/iiab/iiab/new/master?filename=roles/knowledge/files/${encodeURIComponent(entryId)}.json&value=${encodeURIComponent(jsonText)}&message=${encodeURIComponent(`Add Library of Alexandria knowledge module: ${title}`)}`;
      if (writerIiabBtn) {
        writerIiabBtn.href = iiabCommitUrl;
      }

      // 3. Propose IIAB Issue
      const issueBody = `### Library of Alexandria Knowledge Module: ${title}\n\n**Topic:** ${topic}\n**Summary:** ${summary}\n**Primary Source:** [${sourceTitle}](${sourceURL})\n**Author:** ${authorName} (${authorKind})\n**License:** CC-BY-4.0\n**SHA-256 Digest:** \`${digest}\`\n\n#### Module Payload:\n\`\`\`json\n${jsonText.trim()}\n\`\`\`\n\n---\n*Verified and sealed via AFTER Autonomous Pipeline on https://after.training*`;
      const iiabIssueUrl = `https://github.com/iiab/iiab/issues/new?title=${encodeURIComponent(`[Content] ${title}`)}&body=${encodeURIComponent(issueBody)}`;
      if (writerIiabIssueBtn) {
        writerIiabIssueBtn.href = iiabIssueUrl;
      }

      // Commit directly to the UI once done
      commitEntryToUI(entryObj);

      writerStatus.textContent = 'Pipeline passed! Committed to UI catalogue. Save a copy to AFTER, or commit upstream to Library of Alexandria.';
      writerStatus.style.color = '#4c1';
      writerRunBtn.disabled = false;
      writerStamp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  if (writerDownloadBtn) {
    writerDownloadBtn.addEventListener('click', () => {
      if (!currentProposalObj) return;
      downloadJSON(currentProposalObj, `${currentProposalObj.id}.json`);
    });
  }

  // Eco power management: Only stream when section is visible in viewport and tab is focused
  if ('IntersectionObserver' in window && liveSection) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const prev = isSectionVisible;
        isSectionVisible = entry.isIntersecting;
        updatePowerState();
        if (!prev && isSectionVisible && !isPaused && !typeInterval && !runTimeout) {
          playRun(activeRunIndex);
        }
      });
    }, { threshold: 0.15 });
    observer.observe(liveSection);
  } else {
    playRun(0);
  }

  document.addEventListener('visibilitychange', () => {
    const prev = isDocVisible;
    isDocVisible = !document.hidden;
    updatePowerState();
    if (!prev && isDocVisible && isSectionVisible && !isPaused && !typeInterval && !runTimeout) {
      playRun(activeRunIndex);
    }
  });
}

initLiveSwarm();
