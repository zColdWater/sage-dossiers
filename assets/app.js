// Sage Dossiers: progressive enhancement only. Every page is fully readable without this file.
// No network requests. No storage. No third-party code.
(function () {
  'use strict';

  // ---------- pure helpers (also exercised by test.mjs through window.SageApp) ----------
  function normAddr(s) {
    return String(s || '').trim().replace(/^['"\s]+|['"\s]+$/g, '').toLowerCase();
  }
  function isHexAddr(s) { return /^0x[0-9a-f]{40}$/.test(s); }

  // Compare one address with a short list of official addresses.
  // Returns { kind: 'invalid' | 'match' | 'lookalike' | 'unknown', entry? }
  function checkAddress(input, official) {
    var a = normAddr(input);
    if (!isHexAddr(a)) return { kind: 'invalid' };
    var i, e, o;
    for (i = 0; i < official.length; i++) {
      e = official[i];
      if (normAddr(e.address) === a) return { kind: 'match', entry: e };
    }
    for (i = 0; i < official.length; i++) {
      e = official[i];
      o = normAddr(e.address);
      // Address poisoning look-alikes copy the first and last characters that wallets show.
      if (o.slice(0, 6) === a.slice(0, 6) || o.slice(-4) === a.slice(-4)) return { kind: 'lookalike', entry: e };
    }
    return { kind: 'unknown' };
  }

  function gac(quorum, price, opposing, valueAtRisk) {
    var q = Number(quorum), p = Number(price), o = Number(opposing || 0);
    if (!(q > 0) || !(p >= 0) || !(o >= 0)) return null;
    var votes = Math.max(q, o + 1);
    var cost = votes * p;
    var out = { votes: votes, cost: cost, pct: null, leverage: null, band: 'unknown' };
    var v = valueAtRisk === '' || valueAtRisk == null ? null : Number(valueAtRisk);
    if (v != null && v > 0) {
      out.pct = (cost / v) * 100;
      out.leverage = cost > 0 ? v / cost : Infinity;
      out.band = out.pct < 1 ? 'red' : out.pct < 10 ? 'amber' : 'green';
    }
    return out;
  }

  var api = { normAddr: normAddr, checkAddress: checkAddress, gac: gac };
  if (typeof window !== 'undefined') window.SageApp = api;
  if (typeof document === 'undefined') return;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmtUsd(x) {
    if (!isFinite(x)) return '-';
    return '$' + x.toLocaleString('en-US', { maximumFractionDigits: x < 100 ? 2 : 0 });
  }

  function init() {
    // ---------- copy buttons ----------
    $all('[data-copy]').forEach(function (btn) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy');
        var done = function () {
          var old = btn.textContent;
          btn.textContent = btn.getAttribute('data-copied') || 'Copied';
          setTimeout(function () { btn.textContent = old; }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy:', text); });
        } else {
          window.prompt('Copy:', text);
        }
      });
    });

    // ---------- upgrade checklist filter ----------
    var holdings = $('#holdings');
    var steps = $all('ol.steps > li[data-tags]');
    if (holdings && steps.length) {
      holdings.hidden = false;
      var countEl = $('#step-count');
      var apply = function () {
        var picked = $all('input[type=checkbox]:checked', holdings).map(function (c) { return c.value; });
        var shown = 0;
        steps.forEach(function (li) {
          var tags = li.getAttribute('data-tags').split(' ');
          var show = picked.length === 0 || tags.indexOf('all') >= 0 || tags.some(function (t) { return picked.indexOf(t) >= 0; });
          li.hidden = !show;
          if (show) shown++;
        });
        if (countEl) {
          countEl.textContent = picked.length === 0
            ? countEl.getAttribute('data-all').replace('{n}', String(steps.length))
            : countEl.getAttribute('data-some').replace('{n}', String(shown));
        }
      };
      holdings.addEventListener('change', apply);
      apply();
    }

    // ---------- official address checker ----------
    var checker = $('#addr-check');
    var dataEl = $('#official-addresses');
    if (checker && dataEl) {
      checker.hidden = false;
      var official = JSON.parse(dataEl.textContent);
      var input = $('#addr-input', checker);
      var out = $('#addr-result', checker);
      var msg = JSON.parse($('#addr-messages').textContent);
      var run = function () {
        var v = input.value;
        out.className = 'result';
        if (!v.trim()) { out.textContent = ''; return; }
        var r = checkAddress(v, official);
        if (r.kind === 'invalid') { out.textContent = msg.invalid; return; }
        if (r.kind === 'match') {
          out.className = 'result match';
          out.textContent = msg.match.replace('{name}', r.entry.name).replace('{chain}', r.entry.chain);
          return;
        }
        if (r.kind === 'lookalike') {
          out.className = 'result lookalike';
          out.textContent = msg.lookalike.replace('{name}', r.entry.name).replace('{official}', r.entry.address);
          return;
        }
        out.className = 'result unknown';
        out.textContent = msg.unknown;
      };
      input.addEventListener('input', run);
      run();
    }

    // ---------- GAC calculator ----------
    var form = $('#gac-form');
    if (form) {
      form.hidden = false;
      var get = function (id) { return $('#' + id, form).value; };
      var res = $('#gac-result');
      var calc = function () {
        var r = gac(get('gac-quorum'), get('gac-price'), get('gac-opposing'), get('gac-var'));
        if (!r) { res.innerHTML = '<p>Enter a quorum above zero and a token price.</p>'; return; }
        var html = '<p class="big">' + fmtUsd(r.cost) + '</p><p>Lower-bound cost to pass a proposal alone (' + r.votes.toLocaleString('en-US') + ' votes).</p>';
        if (r.pct != null) {
          html += '<p class="band-' + r.band + '"><b>' + r.band.toUpperCase() + '</b>: attack cost is ' + r.pct.toFixed(r.pct < 1 ? 4 : 2) + '% of the value at risk, a leverage of about ' + (isFinite(r.leverage) ? Math.round(r.leverage).toLocaleString('en-US') + 'x' : 'infinite') + '.</p>';
        } else {
          html += '<p>Add the value the governor controls to see the leverage.</p>';
        }
        res.innerHTML = html;
      };
      form.addEventListener('input', calc);
      $all('[data-preset]').forEach(function (b) {
        b.hidden = false;
        b.addEventListener('click', function () {
          var p = JSON.parse(b.getAttribute('data-preset'));
          $('#gac-quorum', form).value = p.quorum;
          $('#gac-price', form).value = p.price;
          $('#gac-opposing', form).value = p.opposing || 0;
          $('#gac-var', form).value = p.var || '';
          calc();
        });
      });
      calc();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
