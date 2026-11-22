// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable table, a per-protocol detail view with the model's own inputs and
// the protocol's farm plan, and the live-token view. No network: every byte it shows is in data.js.
// State rides in the hash, so #detail=<slug> opens a protocol and #cat=<category> filters the board.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var state = { tab: 'board', q: '', category: 'all', chain: 'all', watch: false, sort: 'implied', dir: -1, selected: null };
  var rows = DATA.rows || [];
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var nf = new Intl.NumberFormat('en-US');
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (html !== undefined) node.innerHTML = html;
    return node;
  }
  function categoryOf(row) { return row.category === null || row.category === undefined ? 'Uncategorised' : row.category; }
  function compFor(row) {
    var list = DATA.categories || [];
    for (var i = 0; i < list.length; i++) if (list[i].category === categoryOf(row)) return list[i];
    return null;
  }

  // ---- header stats ----
  var stats = document.getElementById('stats');
  var watchSet = {};
  (DATA.watchlist || []).forEach(function (s) { watchSet[s] = true; });
  stats.innerHTML =
    '<div><dt>Snapshot</dt><dd>' + esc(DATA.as_of) + '</dd></div>' +
    '<div><dt>Watchlist</dt><dd>' + nf.format(DATA.watchlist_size) + '</dd></div>' +
    '<div><dt>Board rows</dt><dd>' + nf.format(DATA.board_size) + '</dd></div>' +
    '<div><dt>Early finds</dt><dd>' + nf.format(DATA.early_size) + '</dd></div>' +
    '<div><dt>Top implied value</dt><dd>' + fmtUsd(rows.length ? rows[0].implied_value_usd : 0) + '</dd></div>';
  document.getElementById('src').textContent = DATA.source;

  // ---- hash state ----
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    var out = {};
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return out;
  }
  function writeHash() {
    var parts = [];
    if (state.tab !== 'board') parts.push('tab=' + state.tab);
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('cat=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.watch) parts.push('watch=1');
    if (state.selected) parts.push('detail=' + encodeURIComponent(state.selected));
    var next = parts.length ? '#' + parts.join('&') : '#';
    if (location.hash !== next) history.replaceState(null, '', next);
  }
  function applyHash() {
    var h = readHash();
    if (h.tab === 'live' || h.tab === 'how') state.tab = h.tab;
    if (h.q !== undefined) state.q = h.q;
    if (h.cat !== undefined) state.category = h.cat;
    if (h.chain !== undefined) state.chain = h.chain;
    state.watch = h.watch === '1';
    if (h.detail !== undefined && bySlug[h.detail]) state.selected = h.detail;
  }

  // ---- sorting / filtering ----
  var SORTS = {
    implied: function (a, b) { return a.implied_value_usd - b.implied_value_usd; },
    rank: function (a, b) { return a.rank - b.rank; },
    tvl: function (a, b) { return a.tvl_usd - b.tvl_usd; },
    growth: function (a, b) { return (a.change_7d || 0) - (b.change_7d || 0); },
    age: function (a, b) { return (a.age_days || 0) - (b.age_days || 0); },
    name: function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; },
  };
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.watch && !watchSet[r.slug]) return false;
      if (state.category !== 'all' && categoryOf(r) !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) { return SORTS[state.sort](a, b) * state.dir; });
  }

  // ---- board ----
  function renderBoard() {
    var panel = el('section', { 'class': 'panel' });
    var controls = el('div', { 'class': 'controls' });
    var search = el('input', { type: 'search', placeholder: 'Search a protocol…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; state.selected = null; writeHash(); render(); });
    controls.appendChild(search);
    var cats = ['all'].concat(Array.from(new Set(rows.map(categoryOf))).sort());
    var catSel = el('select', { 'aria-label': 'Category' });
    cats.forEach(function (c) {
      var o = el('option', { value: c }, c === 'all' ? 'All categories' : esc(c));
      if (c === state.category) o.selected = true;
      catSel.appendChild(o);
    });
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    controls.appendChild(catSel);
    var chains = ['all'].concat(Array.from(new Set(rows.reduce(function (acc, r) { return acc.concat(r.chains); }, []))).sort());
    var chainSel = el('select', { 'aria-label': 'Chain' });
    chains.forEach(function (c) {
      var o = el('option', { value: c }, c === 'all' ? 'All chains' : esc(c));
      if (c === state.chain) o.selected = true;
      chainSel.appendChild(o);
    });
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    controls.appendChild(chainSel);
    var watchLab = el('label');
    var watchBox = el('input', { type: 'checkbox' });
    watchBox.checked = state.watch;
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); render(); });
    watchLab.appendChild(watchBox);
    watchLab.appendChild(document.createTextNode(' Watchlist only'));
    controls.appendChild(watchLab);
    var list = filteredRows();
    controls.appendChild(el('span', { 'class': 'count' }, nf.format(list.length) + ' of ' + nf.format(rows.length) + ' rows'));
    panel.appendChild(controls);
    // The selected protocol's detail sits above the table, so it is visible at once.
    if (state.selected && bySlug[state.selected]) panel.appendChild(renderDetail(bySlug[state.selected]));

    var table = el('table');
    var cols = [
      ['rank', 'Rank'], ['name', 'Protocol'], ['category', 'Category'], ['chains', 'Chains'],
      ['tvl', 'TVL'], ['growth', '7d'], ['age', 'Age'], ['implied', 'Implied value'],
    ];
    var head = '<tr>' + cols.map(function (c) {
      var arrow = state.sort === c[0] ? ' <span class="dir">' + (state.dir === -1 ? '▼' : '▲') + '</span>' : '';
      return '<th class="' + (c[0] === 'tvl' || c[0] === 'growth' || c[0] === 'age' || c[0] === 'implied' ? 'num' : '') + (c[0] === 'chains' || c[0] === 'age' ? ' hide-m' : '') + '"><button type="button" data-sort="' + c[0] + '">' + c[1] + arrow + '</button></th>';
    }).join('') + '</tr>';
    table.innerHTML = '<thead>' + head + '</thead>';
    var body = el('tbody');
    if (list.length === 0) {
      panel.appendChild(el('p', { 'class': 'empty' }, 'Nothing matches these filters. Clear the search or widen the category.'));
    }
    list.forEach(function (r) {
      var tr = el('tr', { 'class': 'row' + (state.selected === r.slug ? ' sel' : ''), 'data-slug': r.slug, tabindex: '0' });
      var pct = r.change_7d;
      var pctCls = pct === null ? '' : pct >= 0 ? 'up' : 'down';
      tr.innerHTML =
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + (watchSet[r.slug] ? '<span class="badge">WATCHLIST</span>' : '') + '<small>' + esc(r.slug) + '</small></td>' +
        '<td>' + esc(categoryOf(r)) + '</td>' +
        '<td class="hide-m">' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctCls + '">' + fmtPct(pct) + '</td>' +
        '<td class="num hide-m">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><strong>' + fmtUsd(r.implied_value_usd) + '</strong></td>';
      tr.addEventListener('click', function () { select(r.slug); });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.slug); } });
      body.appendChild(tr);
    });
    table.appendChild(body);
    panel.appendChild(table);
    table.querySelectorAll('button[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
        render();
      });
    });
    return panel;
  }

  // ---- detail view ----
  function renderDetail(r) {
    var comp = compFor(r);
    var d = el('article', { 'class': 'detail', id: 'detail' });
    var head = '<h2>' + esc(r.name) + ' <small>#' + r.rank + ' · ' + esc(r.slug) + (watchSet[r.slug] ? ' · watchlist' : '') + '</small></h2>' +
      '<p class="sub">' + esc(categoryOf(r)) + ' · ' + esc(r.chains.join(', ') || 'no chain listed') +
      ' · records no token (no market cap, no CoinGecko id, no symbol in its DefiLlama record).</p>';
    var kv = '<dl class="kv">' +
      '<div><dt>Implied value</dt><dd>' + fmtUsd(r.implied_value_usd) + '</dd></div>' +
      '<div><dt>TVL</dt><dd>' + fmtUsd(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day TVL change</dt><dd>' + fmtPct(r.change_7d) + '</dd></div>' +
      '<div><dt>Tracked since</dt><dd>' + esc(r.listed_at || 'unknown') + ' (' + fmtAge(r.age_days) + ')</dd></div>' +
      '<div><dt>Category multiple</dt><dd>×' + r.category_multiple.toFixed(3) + ' (' + r.comps + ' comps)</dd></div>' +
      '<div><dt>Growth × Maturity</dt><dd>×' + r.growth_multiplier.toFixed(3) + ' × ' + r.maturity_multiplier.toFixed(3) + '</dd></div></dl>';
    var formula = '<p class="formula">' + fmtUsd(r.tvl_usd) + ' TVL × ' + r.category_multiple.toFixed(3) +
      ' (' + esc(categoryOf(r)) + ' median mcap/TVL' + (comp && comp.comps >= DATA.model.min_comps ? ', ' + comp.comps + ' live comparables' : ', snapshot-wide median — too few live comparables') +
      ') × ' + r.growth_multiplier.toFixed(3) + ' (growth) × ' + r.maturity_multiplier.toFixed(3) +
      ' (maturity) = ' + fmtUsd(r.implied_value_usd) + '</p>';
    d.innerHTML = head + kv + formula;
    if (comp && comp.top && comp.top.length) {
      var ch = el('div');
      ch.innerHTML = '<h3>Comparables — live-token ' + esc(categoryOf(r)) + ' protocols priced by the market</h3>';
      var ct = el('table', { 'class': 'comps' });
      ct.innerHTML = '<thead><tr><th>Protocol</th><th class="num">Market cap</th><th class="num">TVL</th><th class="num">mcap / TVL</th></tr></thead><tbody>' +
        comp.top.map(function (t) {
          return '<tr><td>' + esc(t.name) + '</td><td class="num">' + fmtUsd(t.mcap_usd) + '</td><td class="num">' + fmtUsd(t.tvl_usd) + '</td><td class="num">' + t.ratio.toFixed(3) + '</td></tr>';
        }).join('') + '</tbody>';
      ch.appendChild(ct);
      d.appendChild(ch);
    }
    var fh = el('h3', {}, 'Farm plan — what to do, what it costs, how long it takes');
    d.appendChild(fh);
    var ol = el('ol', { 'class': 'steps' });
    r.farm_steps.forEach(function (s) { ol.appendChild(el('li', {}, esc(s))); });
    d.appendChild(ol);
    return d;
  }

  // ---- live-token view ----
  function renderLive() {
    var panel = el('section', { 'class': 'panel' });
    panel.innerHTML = '<p style="color:var(--muted);margin-top:0">These protocols already trade. The board never ranks them: ' +
      'it shows the market\u2019s own value, so the reader can see what a launch is priced against. ' +
      'The top ' + nf.format(DATA.live_size) + ' by market cap.</p>';
    var table = el('table');
    table.innerHTML = '<thead><tr><th>Protocol</th><th>Category</th><th class="num">Market cap</th><th class="num">TVL</th><th class="num">mcap / TVL</th><th class="num">7d</th></tr></thead>';
    var body = el('tbody');
    (DATA.live || []).forEach(function (p) {
      var tr = el('tr');
      var ratio = p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(3) : 'n/a';
      tr.innerHTML = '<td class="name">' + esc(p.name) + '<small>' + esc(p.slug) + '</small></td><td>' + esc(p.category || 'Uncategorised') +
        '</td><td class="num">' + fmtUsd(p.mcap_usd) + '</td><td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + ratio +
        '</td><td class="num ' + (p.change_7d === null ? '' : p.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(p.change_7d) + '</td>';
      body.appendChild(tr);
    });
    table.appendChild(body);
    panel.appendChild(table);
    return panel;
  }

  // ---- how it works ----
  function renderHow() {
    var panel = el('section', { 'class': 'panel how' });
    var m = DATA.model;
    var cats = (DATA.categories || []).filter(function (c) { return c.comps >= m.min_comps; }).length;
    panel.innerHTML =
      '<h2>How the radar prices a launch</h2>' +
      '<p>One sealed snapshot, ' + esc(DATA.source) + ', as of ' + esc(DATA.as_of) + '. ' +
      'The watchlist is the snapshot\u2019s own floor: ' + nf.format(DATA.watchlist_size) + ' protocols at or above ' +
      fmtUsd(DATA.floor_usd) + ' of TVL that record no token and are not a wrapped, staked or bridged product of one that trades. ' +
      'The board adds the ' + nf.format(DATA.early_size) + ' largest pre-token protocols below the floor, by TVL.</p>' +
      '<h3>The model (radar-2)</h3>' +
      '<pre>multiple   = median mcap/TVL of live-token protocols\n' +
      '             in the same category (' + cats + ' categories have ' + m.min_comps + '+ comparables;\n' +
      '             the rest use the snapshot-wide median ×' + DATA.global_multiple.toFixed(3) + '),\n' +
      '             clipped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']\n' +
      'growth     = clamp(7d TVL change, ' + m.growth_floor + '%, ' + m.growth_cap + '%)\n' +
      'growthMult = 1 + growth / 100 × ' + m.growth_weight + '\n' +
      'maturity   = ' + m.maturity_floor + ' + min(age, ' + m.maturity_days + 'd) / ' + m.maturity_days + 'd × ' + m.maturity_range + '\n' +
      'implied    = TVL × multiple × growthMult × maturity</pre>' +
      '<p>Age is the days from <code>listed_at</code> to the snapshot date; a protocol with no date counts as ' +
      m.unknown_age_days + ' days old. Nothing is priced from a name: the same function scores every row, ' +
      'and each detail view shows the exact arithmetic behind its number.</p>' +
      '<h3>What the board does not do</h3>' +
      '<ul><li>It does not predict whether or when a token is issued. “Implied value” is the entry\u2019s own claim: what a token would be worth if the protocol\u2019s record stayed as it is.</li>' +
      '<li>It does not treat the snapshot as proof. A protocol that “records no token” may still have one its DefiLlama record does not carry.</li>' +
      '<li>Farm plans are steps a reader can follow, with costs and times, not a promise of a reward.</li></ul>';
    return panel;
  }

  function select(slug) {
    state.selected = slug;
    state.tab = 'board';
    writeHash();
    render();
  }

  function render() {
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === state.tab);
    });
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    if (state.tab === 'live') app.appendChild(renderLive());
    else if (state.tab === 'how') app.appendChild(renderHow());
    else app.appendChild(renderBoard());
  }

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.tab = b.getAttribute('data-tab');
      state.selected = null;
      writeHash();
      render();
    });
  });
  window.addEventListener('hashchange', function () { applyHash(); render(); });
  applyHash();
  render();
})();
