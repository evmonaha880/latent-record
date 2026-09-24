
(function(){
'use strict';
const LR = window.LR;                       // {base, passes:[{pass,end}], state_iso:[...], n_states}
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
// the number a note drawn in the text shares with its card (09/23)
const PN = ['', '\u2460', '\u2461', '\u2462', '\u2463', '\u2464', '\u2465', '\u2466', '\u2467', '\u2468'];
const pnMark = n => `<span class="pn" aria-hidden="true">${PN[n] || n}</span>`;
function pairBind(sec){   // hover or focus either one lights both; a tap on the note in the text brings its card into view
  if (sec.dataset.pairBound) return; sec.dataset.pairBound = '1';
  const hot = (n, on) => $$(`[data-pair="${n}"]`, sec).forEach(el => el.classList.toggle('pair-hot', on));
  const at = e => e.target.closest && e.target.closest('[data-pair]');
  sec.addEventListener('mouseover', e => { const el = at(e); if (el) hot(el.dataset.pair, true); });
  sec.addEventListener('mouseout', e => { const el = at(e); if (el && !el.contains(e.relatedTarget)) hot(el.dataset.pair, false); });
  sec.addEventListener('focusin', e => { const el = at(e); if (el) hot(el.dataset.pair, true); });
  sec.addEventListener('focusout', e => { const el = at(e); if (el) hot(el.dataset.pair, false); });
  sec.addEventListener('click', e => { const el = e.target.closest && e.target.closest('.inote[data-pair]'); if (!el) return; e.stopPropagation();
    const n = el.dataset.pair; const t = [$(`.notestrip .si[data-pair="${n}"]`, sec), $(`.margin .e[data-pair="${n}"]`, sec)].find(x => x && x.offsetParent);
    if (t){ t.scrollIntoView({block: 'nearest', behavior: 'smooth'}); hot(n, true); setTimeout(() => hot(n, false), 1400); } });
}
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// a note whose text came back from the chat and was pasted into the margin (it opens the arrived stop) is not the author's words (09/23 review L12)
const pastedNote = nt => !!(cur && cur.D.exchange && cur.stops.some(z => z.kind === 'arrived' && z.state === nt.written_state));
// a sentence's inline markdown rendered, never shown raw (09/23 review L4/L14): ~~struck~~, **bold**
const mdi = s => esc(pretty(String(s == null ? '' : s))).replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/~~/g, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*\*/g, '');
const pretty = s => s.replace(/"([^"]*)"/g,'“$1”').replace(/'/g,'’');
const Q = new URLSearchParams(location.search);
if (Q.get('motion') === 'reduce') document.documentElement.setAttribute('data-motion','reduce');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.getAttribute('data-motion') === 'reduce';
const phone = () => matchMedia('(max-width:760px)').matches;
const fmt = iso => { const d = new Date(iso); return d.toLocaleDateString('en-GB',{day:'numeric',month:'long'}) + ', ' + d.toTimeString().slice(0,5); };
const span = z => { const a = fmt(z.iso_from || z.iso), b = fmt(z.iso); return a === b ? a : (a.split(', ')[0] === b.split(', ')[0] ? a + ' to ' + b.split(', ')[1] : a + ' to ' + b); };
const register = t => String(t == null ? '' : t).replace(/\bEvan’s\b/g, 'the author’s').replace(/\bEvan's\b/g, 'the author’s').replace(/\bEvan\b/g, 'the author').replace(/\bLaika\b/gi, 'Claude').replace(/\bP(\d{1,2})\b/g, '¶$1').replace(/\(?[A-Z]{1,3}-\d{3,5},?\s*/g, '(').replace(/\(\s*\)/g, '').replace(/\(\s+/g, '(');
const CHK = '<svg class="chk" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8.5 L6.5 12.5 L13.5 4" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLAY = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 0 L10 5 L1 10 Z"/></svg>';
const STOP = '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9"/></svg>';

// ---------- mode (Essay | Record), carried in the URL
// Essay | Drafts (ruled 09/14 09:45). The URL value is ?mode=drafts; the old ?mode=record is accepted. body.record stays as the CSS hook.
const asMode = m => (m === 'record' || m === 'drafts') ? 'drafts' : 'essay';
let mode = asMode(Q.get('mode'));
function writeURL(hash){
  const u = new URL(location.href);
  if (mode === 'drafts') u.searchParams.set('mode','drafts'); else u.searchParams.delete('mode');
  u.searchParams.delete('p');
  u.hash = hash == null ? '' : hash;
  try { history.replaceState(null, '', u.toString()); } catch (e) {}
}
function setMode(m, write){
  m = asMode(m); mode = m;
  document.body.classList.toggle('record', m === 'drafts');
  $$('.bar .sw button').forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  if (write !== false) writeURL(cur ? hashFor() : '');
}
$$('.bar .sw button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.mode === 'essay'){ if (cur) close(false); setMode('essay'); return; }
  setMode('drafts');
  if (!cur) startFromView();          // Evan 09/14 13:25: the button opens the paragraph in view at its leftmost dot and plays
}));
async function startFromView(){
  const top = 60; const arts = $$('article.para:not([data-untraced])');
  const art = arts.find(a => a.getBoundingClientRect().bottom > top) || arts[0]; if (!art) return;
  await open(art.id, null, true, null); if (!cur) return;
  go(-cur.off, false); play();
}

// ---------- data
const cache = {};
async function load(k){
  if (cache[k]) return cache[k];
  const r = await fetch(LR.base + 'record/' + k + '.json?v=' + encodeURIComponent(LR.v || ''), {cache: 'no-cache'});   // a stale record file survived hard refreshes under force-cache (Evan, 09/09 16:10)
  if (!r.ok) throw new Error('record ' + k + ' ' + r.status);
  cache[k] = await r.json();
  return cache[k];
}

// ---------- the open paragraph
let cur = null;      // {k, art, sec, D, stops, pre, off, idx, citeState, citeEd, expanded:Set, changed:[], maxCh, timer}
const MINUS = '\u2212';
// the one accessor for a stop: i < 0 is an edition before the essay (cur.pre, lowest first), i >= 0 a draft (cur.stops)
function stopAt(i){
  if (!cur) return null;
  if (i >= 0) return cur.stops[i];
  const e = cur.pre[cur.off + i]; if (!e) return null;
  // 2026-09-14 15:41 (Evan, "yes"): the plan and the outline are sequences; each stop is Claude's write or the author's notes and edits
  return {pre: true, n: e.n, name: e.name, phase: e.phase || 'write', iso: e.iso || e.at, iso_from: e.iso_from || e.iso || e.at, saves: e.saves, ancestor: e.ancestor, jump: !!e.jump, fallback: !!e.fallback, last_of_doc: !!e.last_of_doc,
          absent: !(e.words && e.words.length), machine: (e.phase || 'write') === 'write', state: null, words: e.words || [], inline_notes: e.inline_notes || [], notes: e.notes || []};
}
// a stop before the essay: @-2 / @-1 name the last stop of the plan / the outline; any other is cited by its time (the ISO alias)
function hashFor(){ if (!cur) return ''; if (cur.idx >= 0) return `#${cur.k}@${cur.stops[cur.idx].state}`; const z = stopAt(cur.idx); return z.last_of_doc ? `#${cur.k}@${z.n}` : `#${cur.k}@${String(z.iso).slice(0, 19)}`; }
const firstReal = () => cur.stops.find(s => !s.absent);           // the paragraph's first text (a replaced or arrived stop counts)
const isDraft = s => s.kind === 'draft' || s.kind === 'absent' || s.kind === 'markup' || !s.kind;   // the stops that carry a draft number
// Draft numbers count draft stops only (the paste rule, 2026-09-14): the absent/first stop is draft 0, an arrived or
// replaced stop carries no number. N = the record file's drafts count, so the numeral on the page and the slider agree.
function draftNo(i){ if (!cur || i < 0) return null; let n = -1; for (let j = 0; j <= i; j++) if (isDraft(cur.stops[j])) n++; return isDraft(cur.stops[i]) ? n : null; }
const firstDraftIdx = () => { for (let j = 0; j < cur.stops.length; j++) if (isDraft(cur.stops[j]) && !cur.stops[j].absent) return j; return cur.stops.length - 1; };

function diffWords(a, b){
  // a word he struck is the same word, drawn struck; a comma or a capital is not a changed word (the polish fold, ruled 09/14 09:49)
  const key = w => String(w.w).replace(/~~/g, '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  const A = a.map(key), B = b.map(key); const out = []; let i = 0, j = 0;
  const lcs = []; for (let x = 0; x <= A.length; x++) lcs.push(new Array(B.length + 1).fill(0));
  for (let x = A.length - 1; x >= 0; x--) for (let y = B.length - 1; y >= 0; y--) lcs[x][y] = A[x] === B[y] ? lcs[x+1][y+1] + 1 : Math.max(lcs[x+1][y], lcs[x][y+1]);
  while (i < A.length && j < B.length){ if (A[i] === B[j]){ out.push({k:'eq', w:b[j]}); i++; j++; } else if (lcs[i+1][j] >= lcs[i][j+1]){ out.push({k:'del', w:a[i]}); i++; } else { out.push({k:'ins', w:b[j]}); j++; } }
  while (i < A.length) out.push({k:'del', w:a[i++]}); while (j < B.length) out.push({k:'ins', w:b[j++]});
  return out;
}

const OPEN_HTML = `
  <div class="head"><span class="pn"></span><span class="fr hcount"></span><button class="back">Back to the essay</button></div>
  <p class="plede"><span class="pl"></span></p>
  <p class="state" aria-live="off"></p>
  <div class="slider"><button class="play" aria-label="Watch it being written" title="Watch it being written">${PLAY}</button><div class="track"><div class="line"></div><input type="range" min="0" max="1" value="1" aria-label="draft"><div class="live sr" aria-live="polite"></div></div></div>
  <p class="drafts">Shaded is new, struck is cut, a filled dot is a save after a Claude write.</p>
  <div class="rbody"><div class="text"><p class="ptext"></p><div class="diffnote"></div></div><div class="notestrip"></div><div class="margin"></div></div>
  <div class="disc">
    <details class="howto"><summary>How to use this page ›</summary><p>Slide through the drafts, or press play. The yellow stop at the end is the paragraph as published.</p><p>The author’s notes appear beside the text as he wrote them, and get a check on the save that took them up.</p></details>
    <details class="marks"><summary>What the marks mean ›</summary><div class="vleg">
    <span class="k"><span class="ins">word</span><small>new in this draft</small></span>
    <span class="k"><span class="del">word</span><small>taken out in this draft</small></span>
    <span class="k"><span class="dot m"></span><small>a save after a Claude write</small></span>
    <span class="k"><span class="dot fin"></span><small>as published</small></span>
    </div><div class="full">A filled dot is a save made within thirty seconds of a logged Claude write to the essay. Every other save is the editor saving while the author worked, typing or pasting. The log is not complete, so a few of those may be Claude’s too. A bigger dot changed more words. A strikethrough the author typed himself is shown as a removal. Red is the editor’s marks only.</div></details>
  </div>`;

async function open(k, citeState, focus, citeEd, citeIso){
  const art = document.getElementById(k);
  if (!art || art.dataset.untraced) return;
  if (cur && cur.k !== k) close(false);
  let D; try { D = await load(k); } catch (e) { console.error(e); return; }
  const stops = D.stops;
  const pre = D.before || []; const off = pre.length;     // the editions before the essay, lowest first (Evan, 09/09 18:52: stops, not a door)
  let idx = stops.length - 1;
  if (citeState != null){ let i = 0; stops.forEach((s, j) => { if (s.state <= citeState) i = j; }); idx = i; }
  let citeMiss = null;
  if (citeEd != null || citeIso != null){
    let j = -1;
    if (citeIso != null) pre.forEach((e, jj) => { if (String(e.iso || e.at).slice(0, 19) <= citeIso) j = jj; });   // the last stop at or before that time
    else pre.forEach((e, jj) => { if (e.n === citeEd) j = jj; });                                               // the last stop of that document
    if (j >= 0) idx = j - off; else { idx = 0; citeMiss = citeEd; }
  }
  const sec = $('.open', art);
  if (!cur || cur.k !== k){
    sec.innerHTML = OPEN_HTML;
    wire(art, sec);
  }
  cur = {k, art, sec, D, stops, pre, off, idx, citeState: citeState == null ? null : citeState, citeEd: citeEd == null ? null : citeEd, citeMiss, expanded: new Set(), timer: null};
  cur.changed = stops.map((s, i) => i === 0 ? s.words.length : diffWords(stops[i-1].words, s.words).filter(x => x.k !== 'eq').length);
  cur.maxCh = Math.max(...cur.changed, 1);
  const n = D.drafts != null ? D.drafts : stops.filter(isDraft).length - 1, NOTES = D.notes.length;
  $('.pn', sec).textContent = '¶' + D.n;
  $('.hcount', sec).textContent = `${NOTES} ${NOTES === 1 ? 'note' : 'notes'} · ${n} ${n === 1 ? 'draft' : 'drafts'}`;
  sec.classList.add('nohand');                    // the keystroke layer stays withdrawn (2026-09-11); the underline never renders
  const d0 = new Date((stops.find(x => !x.absent && x.kind !== 'replaced') || stops[0]).iso), d1 = new Date(stops[stops.length-1].iso); const days = Math.max(1, Math.round((d1 - d0) / 864e5) + 1);
  const day = iso => fmt(iso).split(', ')[0];
  const dates = D.born_first_scrap_iso ? ` Its first words were saved ${day(D.born_first_scrap_iso)}; every sentence was in place in some form by ${day(D.born_assembled_iso)}${D.last_reworded_iso && day(D.last_reworded_iso) !== day(D.born_assembled_iso) ? `; it was last reworded ${day(D.last_reworded_iso)}` : ''}.` : '';
  // the lede collapses to one line after the first open (CL8), same pattern as the retired walkthrough's flag
  let seen = false; try { seen = !!localStorage.getItem('lr-seen'); localStorage.setItem('lr-seen', '1'); } catch (e) {}
  $('.plede', sec).classList.toggle('brief', seen);
  $('.pl', sec).textContent = seen ? `Written over ${days === 1 ? 'one day' : days + ' days'} in August 2026.` : `This paragraph was written over ${days === 1 ? 'one day' : days + ' days'} in August 2026.${dates} Drag the slider to watch it change.`;
  const range = $('input[type=range]', sec); range.min = -off; range.max = stops.length - 1; range.value = idx;
  art.classList.add('open-here'); sec.hidden = false;
  $('.num', art).setAttribute('aria-expanded', 'true');
  if (mode !== 'drafts') setMode('drafts'); else writeURL(hashFor());
  render(false);
  if (focus !== false) art.scrollIntoView({block: 'start'});
}

function close(refocus){
  if (!cur) return;
  stopPlay();
  if (cur.sent) leaveSentence();
  const {art, sec} = cur;
  sec.hidden = true; art.classList.remove('open-here');
  $('.num', art).setAttribute('aria-expanded', 'false');
  cur = null;
  writeURL('');
  if (refocus !== false) $('.num', art).focus();
}

function wire(art, sec){
  const range = $('input[type=range]', sec);
  range.addEventListener('input', () => go(+range.value, true));
  $('.back', sec).addEventListener('click', () => { if (cur && cur.sent) leaveSentence(); else close(true); });
  $('.ptext', sec).addEventListener('click', e => { if (cur && cur.sent){ leaveSentence(); return; } const w = e.target.closest('[data-si]'); if (w) enterSentence(+w.dataset.si); });
  // hovering a word lights the whole sentence it belongs to (Evan 09/14 14:39)
  const pt = $('.ptext', sec); let lit = null;
  const light = si => { if (lit === si) return; $$('.hov', pt).forEach(e => e.classList.remove('hov')); lit = si; if (si != null) $$(`[data-si="${si}"]`, pt).forEach(e => e.classList.add('hov')); };
  pt.addEventListener('mouseover', e => { const w = e.target.closest('[data-si]'); light(w ? +w.dataset.si : null); });
  pt.addEventListener('mouseleave', () => light(null));
  let lastToggle = 0;
  $('.play', sec).addEventListener('click', e => { e.preventDefault(); const now = Date.now(); if (now - lastToggle < 500) return; lastToggle = now; cur.timer ? stopPlay() : play(); });
  ['.back', 'input[type=range]', '.track'].forEach(s => { const el = $(s, sec); el.addEventListener('pointerdown', stopPlay); el.addEventListener('touchstart', stopPlay, {passive: true}); });
}

function go(i, animate){
  if (!cur || i < -cur.off || i >= cur.stops.length) return;
  cur.idx = i; render(animate); writeURL(hashFor());
}

function drawTrack(){
  const {sec, stops, idx, changed, maxCh, off} = cur; const track = $('.track', sec);
  $$('.stop,.tick,.day', track).forEach(e => e.remove());
  const n = stops.length, T = off + n;                        // positions: the editions (dashed, sized by nothing), then the drafts
  const W = track.clientWidth || 300; const X = i => T === 1 ? 50 : (i + off) / (T - 1) * 100; const px = i => X(i) / 100 * W;
  const lo = -off, hi = n - 1;
  for (let i = lo; i <= hi; i++){
    const s = stopAt(i); const x = X(i); const special = i >= 0 && !isDraft(s);
    const r = i < 0 ? 6 : special ? 6 : 6 + Math.round(Math.sqrt(changed[i] / maxCh) * 6);   // 12 px minimum (BK7); a bigger dot changed more words
    const st = document.createElement('div');
    st.className = 'stop' + (i < 0 ? ' ed' : '') + (special ? ' x' : '') + (s.machine && !s.absent && !special ? ' m' : '') + (s.absent && i >= 0 ? ' z' : '') + (i === idx ? ' cur' : '') + (i === hi ? ' fin' : '');
    st.style.left = x + '%'; st.style.width = st.style.height = (r * 2) + 'px'; st.style.marginLeft = (-r) + 'px'; st.style.top = (36 - r + 0.5) + 'px'; track.appendChild(st);
    const showEnd = (i === lo && Math.abs(px(idx) - px(lo)) > 70) || (i === hi && Math.abs(px(idx) - px(hi)) > 70);
    if (i === idx || showEnd){
      const t = document.createElement('div'); t.className = 'tick' + (i === idx ? ' cur' : ''); t.style.left = x + '%';
      t.style.transform = i === lo ? 'none' : (i === hi ? 'translateX(-100%)' : (i === idx && idx >= hi - 1 ? 'translateX(-100%)' : (i === idx && idx <= lo + 1 ? 'none' : 'translateX(-50%)')));
      t.textContent = cur.sent ? 'wording ' + (i + 1) : i < 0 ? (s.n === -1 ? 'the outline' : 'the plan') : s.kind === 'arrived' ? (s.label === 'from the chat' ? 'from the chat' : 'arrived as a note') + ' · ' + fmt(s.iso).split(', ')[1] + ' · ' + (s.words || []).length + ' words' : s.kind === 'replaced' ? 'the paragraph this one replaced' : 'draft ' + draftNo(i); track.appendChild(t);
    }
  }
  if (off){   // the merge: where the editions meet the essay, a short tick labelled with the time (no text on a phone)
    const m = document.createElement('div'); m.className = 'tick merge'; m.style.left = ((X(-1) + X(0)) / 2) + '%';
    m.innerHTML = '<span class="w">merged, 22:17</span>'; m.setAttribute('aria-hidden', 'true'); track.appendChild(m);
    if (px(0) - px(-1) < 170) $('.w', m).style.display = 'none';   // BK7: the label ran under the draft-0 dot when the two stops sit close
  }
  const days = {}; for (let i = lo; i <= hi; i++){ const day = new Date(stopAt(i).iso).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}); (days[day] = days[day] || []).push(i); }
  Object.entries(days).forEach(([day, ix], k, arr) => { const mid = (ix[0] + ix[ix.length - 1]) / 2; const dl = document.createElement('div'); dl.className = 'day'; dl.style.left = X(mid) + '%'; dl.style.transform = k === 0 ? 'none' : (k === arr.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)'); dl.textContent = day; track.appendChild(dl); });
  // collision test (BK7): a label that overlaps an earlier one on its row is hidden; the current stop's label always wins
  [['.tick:not(.merge)', '.tick.cur'], ['.day', null]].forEach(([sel, keep]) => {
    const els = $$(sel, track); const first = keep ? $$(keep, track) : []; const kept = [];
    first.forEach(e => kept.push(e.getBoundingClientRect()));
    els.forEach(e => { if (first.includes(e)) return; const r = e.getBoundingClientRect(); if (kept.some(q => r.left < q.right + 6 && r.right > q.left - 6)) e.style.visibility = 'hidden'; else kept.push(r); });
  });
}

// the note-card variant for a birth note at a negative stop (Evan's notes in the thesis doc and the one-pager)
const plain = t => String(t || '').replace(/\*\*?/g, '');     // the record keeps the markdown; the card reads clean
function birthCard(nt, s, forStrip){
  const {stops, k, D} = cur; const fr = firstReal(); const frIdx = fr ? stops.indexOf(fr) : -1;
  const b = nt.became || {};
  const stood = nt.stood_on ? `<div class="stood full"><span class="lab">He wrote it ${nt.stood_on_position === 'inside the sentence' ? 'beside' : 'after'}</span> “${esc(pretty(plain(nt.stood_on)))}”</div>` : '';
  const chunk = nt.chunk_at_written ? `<details class="was"><summary>The passage as it stood when he wrote the note, ${fmt(nt.written_at + ':00').split(', ')[1]} ›</summary><div class="b">${esc(pretty(plain(nt.chunk_at_written)))}</div></details>` : '';
  let ans;
  if (nt.here === 'written'){
    const tj = cur.pre.findIndex(e => (e.notes || []).some(x => x.id === nt.id && x.here === 'taken_up'));
    ans = `<div class="b">Written here, ${fmt(nt.written_at + ':00').split(', ')[1]}${tj >= 0 ? `; <a href="#" data-go="${tj - cur.off}">taken up ${fmt(nt.answered_at + ':00').split(', ')[1]} ›</a>` : nt.answered_at ? `; taken up ${fmt(nt.answered_at + ':00').split(', ')[1]}, inside ${esc(s.name)}` : nt.answered_in_essay ? '; taken up later, in the essay' : ''}.</div>`;
  } else if (nt.here === 'taken_up'){
    const a0 = plain(nt.answered_by || ''); const q = a0.length > 160 ? a0.slice(0, 160).replace(/\s+\S*$/, '') + '…' : a0;
    ans = `<div class="ansline">${CHK}<span class="ans">taken up here, ${fmt(nt.answered_at + ':00').split(', ')[1]}</span> <span class="q">“${esc(pretty(q))}”</span></div>`;
  } else if (nt.answered_by){
    const a0 = plain(nt.answered_by); const q = a0.length > 160 ? a0.slice(0, 160).replace(/\s+\S*$/, '') + '…' : a0;
    ans = `<div class="ansline">${CHK}<span class="ans">taken up ${fmt(nt.answered_at + ':00').split(', ')[1]}, inside ${esc(s.name)}</span> <span class="q">“${esc(pretty(q))}”</span></div>`;
  } else if (nt.answered_in_essay){
    const e = nt.answered_in_essay; let j = stops.findIndex(z => z.state != null && z.state >= e.state); if (j < 0) j = stops.length - 1;
    ans = `<div class="ansline">${CHK}<span class="ans">answered in the essay</span>, ${fmt(e.at + ':00')} › <a href="#" data-go="${j}">draft ${j}</a> <span class="q">“${esc(pretty(plain(e.sentence)))}”</span></div>`;
  } else {
    ans = `<div class="b">Never answered${/^Half/.test(nt.verdict || '') ? '; half of this never entered the essay' : ''}${nt.why ? ' · ' + esc(nt.why) : ''}.</div>`;
  }
  const mine = b.para === k || (b.also || []).includes(k);
  const became = mine
    ? `<div class="became">${b.para === k ? 'became this paragraph' : 'became part of this paragraph'}${frIdx >= 0 && !fr.absent ? ` on ${fmt(fr.iso)} › <a href="#" data-go="${frIdx}">draft ${frIdx}</a>` : ''} <span class="b">· placed by reading</span></div>`
    : (b.about === k ? `<div class="became">about this paragraph <span class="b">· placed by reading; its words never entered the essay</span></div>` : '');
  const how = `<details><summary>how this note was placed</summary><div class="b">Read by hand against the author’s map of the birth notes, not measured${b.confidence ? `; confidence ${esc(b.confidence)}` : ''}${nt.verdict ? `: ${esc(register(nt.verdict))}` : ''}. The placement was ruled by the author on 9 September 2026.</div></details>`;
  const label = `The author, in ${esc(s.name)}`;
  const when = fmt(nt.written_at + ':00');
  return forStrip
    ? `<div class="si birth${cur.expanded.has(nt.id) ? ' open' : ''}" data-k="${nt.id}" role="button" tabindex="0" aria-expanded="${cur.expanded.has(nt.id) ? 'true' : 'false'}"><b>${label}</b><span class="short"${cur.expanded.has(nt.id) ? ' hidden' : ''}>${esc(nt.text.length > 70 ? nt.text.slice(0, 70) + '…' : nt.text)}</span><div class="more"${cur.expanded.has(nt.id) ? '' : ' hidden'}>${stood}<div class="t">${esc(nt.text)}</div>${chunk}${ans}${became}${how}</div></div>`
    : `<div class="e birth" data-id="${nt.id}"><div class="l">${label} <span>· ${when}</span></div>${stood}<div class="t">${esc(nt.text)}</div>${chunk}${ans}${became}${how}</div>`;
}

// The draft that was on screen when the note was written: the LAST stop at or before its save.
// Forwards ("the next draft") was right only while a note save was itself a draft (2026-09-10 ruling).
// Saves land every 20 seconds (352 of the 586 gaps are exactly 20s -- Obsidian Sync's timer, not a
// keystroke), so a note's open time is only ever known to the nearest 20 seconds. Anything under a
// minute is reported as such rather than as a false-precision figure (Evan's ruling 2026-09-10).
function openFor(m){
  if (m == null) return 'open';
  if (m < 1) return 'open under a minute';
  if (m < 2) return 'open about a minute';
  return `open ${Math.round(m)} minutes`;
}

function wDraftOf(nt, stops){
  let i = -1;
  for (let j = 0; j < stops.length; j++) if (stops[j].state <= nt.written_state) i = j;
  return i < 0 ? 0 : i;
}

function noteState(nt, s){
  const {stops} = cur; const fr = firstReal();
  const si = stops.indexOf(s);   // -1 for a pre-essay stop, which keeps the old test
  // A note is open on the draft that was on screen when it was written, not on the save number
  // it happens to carry. wDraftOf() already attaches it backwards; `open` was still comparing
  // save numbers, so after the 09/10 draft fold removed most saves as stops, 221 of 244 notes
  // rendered nowhere until the draft that answered them. Fixed 2026-09-10.
  const wIdxOpen = (stops[0].absent && nt.written_state < fr.state) ? 0 : wDraftOf(nt, stops);
  const open = s.absent ? (nt.written_state < fr.state && nt.resolved_state >= fr.state)
             : si < 0 ? (nt.written_state <= s.state && s.state < nt.resolved_state)
             : (wIdxOpen <= si && s.state < nt.resolved_state);
  const answered = s.state >= nt.resolved_state;
  const future = nt.written_state > s.state;
  let ansIdx = stops.findIndex(z => z.state >= nt.resolved_state);
  const cleared = ansIdx === -1 && nt.resolved_state < 1e6;
  if (ansIdx === -1) ansIdx = stops.length - 1;
  const before = nt.resolved_state < firstReal().state;      // answered before this paragraph's first draft
  const exact = !cleared && nt.resolved_state === stops[ansIdx].state;   // the clearing save is one of the drafts
  const here = answered && !cleared && !before && exact && s.state === stops[ansIdx].state;
  // cleared by a save between two drafts (no words changed here): said once, at the next draft
  const clearedBetween = answered && !cleared && !before && !exact && s.state === stops[ansIdx].state;
  const wIdx = wIdxOpen;
  const writtenBetween = wIdx > 0 && stops[wIdx].state !== nt.written_state;   // written on a save that is not a draft
  const afterLast = nt.written_state > stops[stops.length - 1].state;
  return {open, answered, future, ansIdx, cleared, here, before, clearedBetween, wIdx, writtenBetween, afterLast};
}

function instrEntry(x, forStrip){
  // a message whose asks were all placed on other paragraphs prints as one line, not the message (Evan, 09/07 22:16)
  const placedElsewhere = x.items_total > 0 && x.items_mine.length === 0 && x.items_elsewhere === x.items_total;
  const when = `${fmt(x.at)} · sent ${x.seconds_before < 1 ? 'in the same second as' : x.seconds_before < 10 ? x.seconds_before.toFixed(1) + ' seconds before' : x.seconds_before < 60 ? Math.round(x.seconds_before) + ' seconds' : Math.round(x.seconds_before / 60) + ' minutes before'} this save`;
  let body;
  const quote = x.said.length > 90 ? x.said.slice(0, 90).replace(/\s+\S*$/, '') + '…' : x.said;
  if (x.round){
    const k = x.round.here.length;
    const items = x.items_mine.length ? x.items_mine.map(m => `<div class="t">${m.item != null ? `<span class="lab">item ${m.item}</span> ` : ''}${esc(m.text)}</div>`).join('') : '';
    body = `<div class="t">This message sent Claude back to the notes standing in the file. The save that followed answered ${x.round.answered} of them across the essay${k ? `, ${k === 1 ? 'the one' : k + ' of them'} on this paragraph` : ', none on this paragraph'}.</div>${items}<div class="b">“${esc(quote)}”</div>`;
  } else if (x.items_mine.length){
    body = x.items_mine.map(m => `<div class="t">${m.item != null ? `<span class="lab">item ${m.item}</span> ` : ''}${esc(m.text)}</div>`).join('');
  } else if (x.ruled){
    body = `<div class="t">${esc(x.said)}</div><div class="b">Placed here by the author, 9 September 2026.</div>`;
  } else if (x.items_total > 0){
    const where = x.asks_placed.map(a => `${a.n} on ${a.where.replace('essay-wide asks', 'the whole essay')}`).join(', ');
    body = `<div class="t">A message went to Claude before this save with ${x.items_total} ${x.items_total === 1 ? 'ask' : 'asks'}, none about this paragraph: ${where}. “${esc(quote)}”</div>`;
  } else {
    body = `<div class="t">A message about the whole essay went to Claude before this save: “${esc(quote)}” It belongs to the exchange, not to this paragraph.</div>`;
  }
  const basis = x.round ? '' : `<div class="b">The record joins it to this save by time, not by cause.</div>`;
  return forStrip
    ? `<div class="si" data-k="c${x.state}" role="button" tabindex="0" aria-expanded="false"><b>The author, in chat</b><span class="short">${esc((x.round ? `sent Claude to the notes; this save answered ${x.round.answered}` : x.items_mine.length ? x.items_mine[0].text : 'a message about the whole essay, before this save').slice(0, 70))}…</span><div class="more" hidden>${body}${basis}</div></div>`
    : `<div class="e" id="chat${x.state}"><div class="l">The author, in chat <span>· ${when}</span></div>${body}${basis}</div>`;
}

// FLIP: cards keep their identity across a re-render and glide to their new place; a card that is new fades in.
function flipBefore(box, sel){ const map = new Map(); $$(sel, box).forEach(e => map.set(e.dataset.id || e.dataset.k, e.getBoundingClientRect().top)); return map; }
function flipAfter(box, sel, before){
  const els = $$(sel, box); const moves = [];
  els.forEach(e => { const key = e.dataset.id || e.dataset.k; const y0 = before.get(key);
    if (y0 == null){ e.classList.add('arrive'); return; }
    const dy = y0 - e.getBoundingClientRect().top; if (Math.abs(dy) > 1) moves.push([e, dy]); });
  moves.forEach(([e, dy]) => { e.style.transition = 'none'; e.style.transform = `translateY(${dy}px)`; });
  void box.offsetHeight;
  moves.forEach(([e]) => { e.style.transition = 'transform .45s cubic-bezier(.2,.7,.2,1)'; e.style.transform = ''; e.addEventListener('transitionend', () => { e.style.transition = ''; }, {once: true}); });
  requestAnimationFrame(() => requestAnimationFrame(() => els.forEach(e => e.classList.remove('arrive'))));
}

// ---------- the sentence view (shape A, ruled 09/14 10:01; un-parked by Evan 13:25): tap a sentence, the slider becomes
// its timeline, every wording it had is a card in the margin. The paragraph's stops are kept aside and restored on leave.
// Framing: born · reworded · moved · from the outline, the plan or the chat; never "by hand". Animation: the same morph
// the drafts use (new words shade in, cut words struck), because typing a sentence out reads as theatre.
const normW = w => String(w).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function sentenceMap(s){
  if (!cur || !cur.D.sentences || !cur.D.sentences.length) return null;
  const words = s.words.map(w => normW(w.w)); const map = new Array(words.length).fill(null); let cursor = 0;
  cur.D.sentences.forEach((sn, si) => {
    const ev = sn.events.filter(e => e.save <= s.state && e.after); if (!ev.length) return;
    const target = ev[ev.length - 1].after.split(/\s+/).map(normW).filter(Boolean); if (!target.length) return;
    for (let start = cursor; start <= words.length - target.length; start++){
      let ok = true; for (let j = 0; j < target.length; j++){ if (words[start + j] !== target[j]){ ok = false; break; } }
      if (ok){ for (let j = 0; j < target.length; j++) map[start + j] = si; cursor = start + target.length; return; }
    }
  });
  return map;
}
function enterSentence(si){
  if (!cur || cur.sent) return; const sn = cur.D.sentences[si]; if (!sn || !sn.events.length) return;
  stopPlay();
  cur.para = {stops: cur.stops, off: cur.off, idx: cur.idx, changed: cur.changed, maxCh: cur.maxCh};
  const stops = sn.events.map((e, i) => ({state: e.save, iso: e.iso, kind: 'draft', machine: e.cause === 'machine', ev: e, words: (e.after || '').split(/\s+/).filter(Boolean).map(w => ({w, ins: null, hand: false}))}));
  cur.sent = sn; cur.stops = stops; cur.off = 0; cur.idx = stops.length - 1;
  cur.changed = stops.map((s, i) => i === 0 ? s.words.length : diffWords(stops[i-1].words, s.words).filter(x => x.k !== 'eq').length); cur.maxCh = Math.max(...cur.changed, 1);
  cur.sec.classList.add('sent');
  $('.pn', cur.sec).textContent = '¶' + cur.D.n + ' · one sentence'; $('.back', cur.sec).textContent = 'Back to the paragraph';
  const range = $('input[type=range]', cur.sec); range.min = 0; range.max = stops.length - 1; range.value = cur.idx;
  render(false); writeURL(hashFor());
}
function leaveSentence(){
  if (!cur || !cur.sent) return; stopPlay();
  const p = cur.para; cur.sent = null; cur.para = null; cur.stops = p.stops; cur.off = p.off; cur.idx = p.idx; cur.changed = p.changed; cur.maxCh = p.maxCh;
  cur.sec.classList.remove('sent');
  $('.pn', cur.sec).textContent = '¶' + cur.D.n; $('.back', cur.sec).textContent = 'Back to the essay';
  const range = $('input[type=range]', cur.sec); range.min = -cur.off; range.max = cur.stops.length - 1; range.value = cur.idx;
  render(false); writeURL(hashFor());
}
function eventWord(e, i, sn){
  if (e.kind === 'written') return i === 0 ? 'born' : 'written again';   // descent from the outline or the plan is said in the note under the text, not as the event
  if (e.kind === 'rewritten') return 'reworded'; if (e.kind === 'moved') return 'moved'; if (e.kind === 'polish') return 'punctuation'; return e.kind;
}
function renderSentence(animate){
  const {sec, stops, idx, D} = cur; const sn = cur.sent; const s = stops[idx]; const prev = idx > 0 ? stops[idx - 1] : null;
  const parts = prev ? diffWords(prev.words, s.words) : s.words.map(w => ({k: 'ins', w}));
  let html = '', ins = 0, del = 0;
  parts.forEach(p => { if (p.w.w === '>') return; const t = esc(pretty(String(p.w.w).replace(/~~/g, ''))).replace(/·/g, '·<wbr>'); const cls = [];
    if (p.k === 'ins'){ cls.push('ins'); ins++; if (animate && !reduced()) cls.push('dev'); } if (p.k === 'del'){ cls.push('del'); del++; }
    html += (cls.length ? `<span class="${cls.join(' ')}">${t}</span>` : t) + ' '; });
  const el = $('.ptext', sec); el.innerHTML = html;
  if (animate && !reduced()) requestAnimationFrame(() => requestAnimationFrame(() => $$('.ins.dev', el).forEach(e => e.classList.remove('dev'))));
  const N = stops.length; const who = s.machine ? ' · saved after a Claude write' : '';
  const state = $('.state', sec);
  state.innerHTML = `One sentence <span class="tally">· wording ${idx + 1} of ${N} · ${eventWord(s.ev, idx, sn)} · ${fmt(s.iso)}${who} · ${s.words.length} words</span> <a href="#" class="leave">Back to the paragraph ›</a>`;
  $('.leave', state).addEventListener('click', e => { e.preventDefault(); leaveSentence(); });
  const first = idx === 0;
  $('.diffnote', sec).innerHTML = (first
    ? (`<span class="ins">Shaded</span>: all of it is new, the sentence as it was first saved.` + (sn.pre_essay ? ` It descends from a line in ${sn.pre_essay.doc === 'thesis' ? 'the plan' : 'the outline'}, written the evening before the essay’s first save; authorship is not followed before the essay.` : ''))
    : (ins + del ? `<span class="ins">Shaded</span>: new in this wording (${ins}). <span class="del">Struck</span>: taken out (${del}).` : 'The words did not change here; it moved.'))
    + (idx === N - 1 ? ' This is the wording in the published essay. Tap the sentence, or Back to the paragraph, to return.' : '');
  const cards = stops.map((z, i) => `<div class="e wording${i === idx ? ' cur' : ''}" data-id="w${i}" data-go="${i}"><div class="l">Wording ${i + 1} of ${N} <span>· ${eventWord(z.ev, i, sn)} · ${fmt(z.iso)}${z.machine ? ' · after a Claude write' : ''}</span></div><div class="t">${mdi(z.ev.after || '')}</div></div>`);
  const m = $('.margin', sec); const before = flipBefore(m, '.e[data-id]'); m.innerHTML = cards.join(''); if (animate && !reduced()) flipAfter(m, '.e[data-id]', before);
  $('.notestrip', sec).innerHTML = stops.map((z, i) => `<div class="si${i === idx ? ' here' : ''}" data-k="w${i}" data-go="${i}" role="button" tabindex="0"><b>Wording ${i + 1}</b><span class="short">${eventWord(z.ev, i, sn)} · ${fmt(z.iso)}</span></div>`).join('');
  $$('[data-go]', sec).forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(+a.dataset.go, true); }));
  const range = $('input[type=range]', sec); range.value = idx; range.setAttribute('aria-valuetext', state.textContent);
  $('.live', sec).textContent = state.textContent;
  drawTrack();
}

function render(animate){
  if (cur.sent){ renderSentence(animate); return; }
  const {sec, stops, idx, D, k, off} = cur; const s = stopAt(idx); const prev = idx > -off ? stopAt(idx - 1) : null;
  const el = $('.ptext', sec); const isFinal = idx === stops.length - 1; const zero = !!s.zero; const absent = !!s.absent; const afterAbsent = !!(prev && prev.absent); const isPre = !!s.pre;
  // The published draft used to render clean, which hid the last change the essay ever took -- 63 of 63
  // paragraphs, and often the best one (¶13's "decided would exist" -> "willed into existence", 6 words).
  // It now diffs against the previous draft like every other stop; tapping the text still reads it clean.
  // (Evan's audit, 2026-09-10.)
  // no diff across a replaced stop (the dead paragraph is not a draft of this one) nor from an absent stop; arrived → first draft diffs
  // one rule for every stop (09/14 15:41): diff against the stop before, the plan and the outline included; not across a
  // replaced stop, an absent one, or a jump to a different passage; the first text ever is all new
  const noDiff = !prev || afterAbsent || absent || prev.kind === 'replaced' || s.kind === 'replaced' || (isPre && s.jump);
  const allNew = s.kind !== 'replaced' && !absent && !(isPre && s.jump) && (!prev || afterAbsent || prev.kind === 'replaced');
  const parts = !noDiff ? diffWords(prev.words, s.words) : s.words.map(w => ({k: allNew ? 'ins' : 'eq', w}));
  const runs = isPre ? (s.shared_runs || []) : []; const inRun = wi => runs.some(([a, b]) => wi >= a && wi < b);
  const SI = (!isPre && !cur.sent && isFinal) ? sentenceMap(s) : null;      // word → sentence, for the tap (published draft only; Evan 09/14 14:39)
  let html = '', ins = 0, del = 0, hs = false, wi = -1;
  const inl = s.inline_notes || [];
  // each note drawn in the text shares a number with its card (09/23, Evan): numbered in text order, matched by the note's words;
  // the cards keep their newest-first order (09/14 13:13), so the number is what ties the two
  const pool = isPre ? (s.notes || []) : D.notes; const nrm = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const inlPn = new Map(), pairOf = {}; let pn = 0;
  const elsewhere = [];   // a note drawn in this passage whose card stands on another paragraph (09/23): numbered too, with a quiet card that points there
  [...inl].sort((a, b) => a.at - b.at).forEach(x => { const nt = pool.find(n => !(n.id in pairOf) && nrm(n.text) === nrm(x.text));
    if (nt){ pairOf[nt.id] = ++pn; inlPn.set(x, pn); return; }
    const h = ((LR.note_home || {})[nrm(x.text)] || []).find(z => z.k !== cur.k);
    if (h){ inlPn.set(x, ++pn); elsewhere.push({n: pn, x, h}); } });
  const noteSpan = x => { const n = inlPn.get(x);
    return n ? `<span class="inote" data-pair="${n}" tabindex="0" title="the author’s note, ${n} in the margin">${pnMark(n)}${esc(x.text)}</span> ` : `<span class="inote" title="the author’s note">${esc(x.text)}</span> `; };
  inl.filter(x => x.at < 0).forEach(x => { html += noteSpan(x); });
  parts.forEach(p => {
    if (p.k !== 'del') wi++;
    let raw = p.w.w; let hsStart = false, hsEnd = false;
    if (raw === '>'){ if (p.k !== 'del' && wi > 0) html += '<br>'; return; }     // a quotation's line marker is a line break, not a word (09/23 review L5)
    if (raw.startsWith('~~')){ hsStart = true; raw = raw.slice(2); }
    if (raw.endsWith('~~') || raw.match(/~~[.,;:]?$/)){ hsEnd = true; raw = raw.replace(/~~([.,;:]?)$/, '$1'); }
    if (hsStart) hs = true; raw = raw.replace(/~~/g, '');
    const t = esc(pretty(raw)).replace(/·/g, '·<wbr>'); const cls = [];
    const struck = hs;                       // capture before hsEnd closes the run on this word
    if (struck) cls.push('hs'); if (hsEnd) hs = false;
    // a struck word is a deletion Claude carried out, never a word the author wrote (Evan, 09/10 11:35)
    if (p.w.hand && p.k !== 'del' && !struck) cls.push('hw');
    if (p.k === 'ins'){ cls.push('ins'); ins++; if (animate && !reduced()) cls.push('dev'); }
    if (p.k === 'del'){ cls.push('del'); del++; }
    if (isPre && inRun(wi)) cls.push('shared');            // the run this paragraph took from the outline or the plan (D1, BK9)
    const si = (SI && p.k !== 'del') ? SI[wi] : null;
    html += (cls.length || si != null ? `<span class="${cls.join(' ')}"${si != null ? ` data-si="${si}"` : ''}>${t}</span>` : t) + ' ';
    if (p.k !== 'del') inl.filter(x => x.at === wi).forEach(x => { html += noteSpan(x); });     // his notes where he typed them
  });
  el.innerHTML = html;
  if (animate && !reduced()) requestAnimationFrame(() => requestAnimationFrame(() => $$('.ins.dev', el).forEach(e => e.classList.remove('dev'))));
  const n = s.words.length, N = D.drafts != null ? D.drafts : stops.filter(isDraft).length - 1, dn = draftNo(idx);
  const HL = false;
  const who = s.machine ? ' · saved after a Claude write' : '';          // no author word on any other save (CL3)
  const state = $('.state', sec);
  const isArrived = s.kind === 'arrived', isReplaced = s.kind === 'replaced';
  state.innerHTML = isPre
    ? `Before the essay <span class="tally">· ${esc(s.name)} · ${s.phase === 'markup' ? 'the author’s notes and edits' : 'Claude writes'} · ${span(s)}${absent ? ` · not in ${esc(s.name)} yet` : ''}</span>`
    : isArrived
    ? `${s.label === 'from the chat' ? 'Arrived from the chat' : 'Arrived as a note'} <span class="tally">· ${fmt(s.iso)} · ${n} words</span>`
    : isReplaced
    ? `The paragraph this one replaced <span class="tally">· ${fmt(s.iso)}</span>`
    : (s.kind === 'markup' && !isFinal)
    ? `Draft ${dn} of ${N} <span class="tally">· the author’s edits · ${span(s)} · ${n} words</span>`
    : zero
    ? `Draft 0 of ${N} <span class="tally">· the first save, ${fmt(s.iso)}${who}${absent ? ' · this paragraph was not in it yet' : ` · ${n} words`}</span>`
    : isFinal
    ? `<span class="sc" style="font-weight:600">As published</span> <span class="tally">· draft ${N} of ${N} · ${fmt(s.iso)}${who} · ${n} words</span>`
    : `Draft ${dn} of ${N} <span class="tally">· ${fmt(s.iso)}${who} · ${n === 0 ? 'no text yet, only the note' : `${n} words`}</span>`;
  const noteHere = D.notes.some(nt => wDraftOf(nt, stops) === idx);
  const nearest = (() => { if (cur.citeState == null) return -1; let i = 0; stops.forEach((z, j) => { if (z.state <= cur.citeState) i = j; }); return i; })();
  const citeNote = (cur.citeState != null && s.state !== cur.citeState && idx === nearest)
    ? ` <span style="color:var(--graphite)">(You asked for save ${cur.citeState}; this paragraph did not change there, so this is the nearest draft before it.)</span>`
    : (cur.citeMiss != null && idx === 0)
    ? ` <span style="color:var(--graphite)">(You asked for ${cur.citeMiss === -2 ? 'the plan' : 'the outline'}; this paragraph had nothing there, so this is draft 0.)</span>` : '';
  const fd = firstDraftIdx();
  $('.diffnote', sec).innerHTML = (isPre ? (absent ? `Not in ${esc(s.name)} yet.`
      : (s.jump ? `A different passage of ${esc(s.name)}: the one the author’s note stood on. ` : '')
        + (s.phase === 'markup' ? `His notes stand where he typed them${ins + del ? `; <span class="del">struck</span> is what he took out, <span class="ins">shaded</span> what he typed` : ''}.`
           : (ins + del && !noDiff ? `Claude’s write: ${[ins ? '<span class="ins">shaded</span> is new' : '', del ? '<span class="del">struck</span> is taken out' : ''].filter(Boolean).join(', ')}.` : allNew ? `Claude’s write; <span class="ins">shaded</span>: all of it is new.` : `Claude’s write.`))
        + (s.fallback ? ` The passage as it stood when he wrote the note.` : '')
        + (s.ancestor ? ` This paragraph’s own words come from another line of ${esc(s.name)}: “${esc(pretty(plain(s.ancestor)))}”` : ''))
    : isReplaced ? `The paragraph that stood here before this one${s.why ? `. ${esc(register(s.why))}` : ''}`
    : isArrived ? (s.label === 'from the chat' ? `The words as they reached the file from the chat, wrapped as a note; the first draft in the essay’s own text is draft 1, ${fmt(stops[fd].iso)}.` : `The words as the author first typed them into the file, as a note; the first draft in the essay’s own text is draft 1, ${fmt(stops[fd].iso)}.`)
    : s.kind === 'markup' ? `The author’s edits${s.saves > 1 ? `, ${s.saves} saves` : ''}: ${ins + del ? `<span class="del">struck</span> is what he took out, <span class="ins">shaded</span> what he typed; ` : ''}his notes stand where he typed them, and the next save after a Claude write carries them out.`
    : absent ? `<em>Not yet written.</em> The first save did not have this paragraph; ${stops.slice(1, fd).length ? 'what stood before it is on the stops to the right; ' : ''}its first draft is ${fmt(stops[fd].iso)}.${D.notes.some(nt => noteState(nt, s).open) ? ' The notes beside it were written before that first draft.' : ''}`
    : zero ? (s.carried ? `The essay’s first save, carrying this passage over from ${prev && prev.pre ? esc(prev.name) : 'the outline'}${ins + del ? `; <span class="ins">shaded</span> is new, <span class="del">struck</span> is taken out` : ''}.` : 'The first save of the essay. Nothing to compare.')
    : noDiff ? '<span class="ins">Shaded</span>: all of it is new, the first text this paragraph had in the essay.'
    : isFinal ? (ins + del ? `<span class="ins">Shaded</span>: new in the published text (${ins}). <span class="del">Struck</span>: taken out by the last save (${del}).` : 'Nothing changed at the last save.')
    : n === 0 ? 'No text yet at this draft: the paragraph began as a note in the margin. The words arrive in the next draft.'
    : (ins + del === 0) ? (noteHere ? 'No words changed at this draft; this is where the author wrote the note.' : 'No words changed at this draft.')
    : `<span class="ins">Shaded</span>: new in this draft (${ins}). <span class="del">Struck</span>: taken out (${del}).`) + citeNote + (isPre || isReplaced ? '' : chg(s));

  // margin (desktop) and strip (phone): only what is live at this draft
  const entries = [], strip = [];
  if (isPre){   // the birth notes on this paragraph in this edition; no chat lines, nothing else
    s.notes.forEach(nt => { entries.push({rank: 0, html: birthCard(nt, s, false)}); strip.push(birthCard(nt, s, true)); });
  }
  // the exchange card (ruled 09/14 09:45, third person): from the stop the words reached the file, just after the paragraph's own note
  if (!isPre && D.exchange && !absent && !isReplaced){
    const ex = D.exchange; const t = iso => fmt(iso + ':00').split(', ')[1];
    const seq = [ex.asked_at ? `asked ${t(ex.asked_at)}` : '', ex.chose_at ? `chose ${t(ex.chose_at)}` : '', ex.pasted_at ? `pasted ${t(ex.pasted_at)}` : ''].filter(Boolean).join(' · ');
    const h = `<div class="e quiet xcard" id="xcard"><div class="l">Drafted in the exchange <span>· ${fmt(ex.asked_at + ':00')}</span></div><div class="t">${esc(ex.card)}</div><div class="jump"><a href="${LR.base}${ex.thread_url}">Read the exchange ›</a></div></div>`;
    entries.push({rank: 1.5, html: h});
    strip.push(`<div class="si xcard" data-k="xch" role="button" tabindex="0" aria-expanded="false"><b>Drafted in the exchange</b><span class="short">${esc(seq)}</span><div class="more" hidden><div class="t">${esc(ex.card)}</div><div class="jump"><a href="${LR.base}${ex.thread_url}">Read the exchange ›</a></div></div></div>`);
  }
  // notes answered before the paragraph's first draft: one quiet entry at draft 1, the notes behind a disclosure
  const earlier = idx === 0 ? D.notes.filter(nt => noteState(nt, s).before) : [];   // on draft 0
  if (earlier.length){
    const list = earlier.map(nt => `<div class="t" style="margin-top:8px">${esc(nt.text)}<div class="b">${fmt(nt.written_at + ':00')} · answered at save ${nt.resolved_state}, ${fmt(nt.resolved_at + ':00')}</div></div>`).join('');
    const lead = `${earlier.length === 1 ? 'One note' : earlier.length + ' notes'} placed on this paragraph ${earlier.length === 1 ? 'was' : 'were'} answered before its first draft: the text they stood on was rewritten into this paragraph.`;
    entries.push({rank: 4, html: `<div class="e quiet"><div class="l">Before this paragraph <span>· answered earlier</span></div><div class="t">${lead}</div><details><summary>${earlier.length === 1 ? 'the note' : 'the notes'}</summary>${list}</details></div>`});
    strip.push(`<div class="si" data-k="before" role="button" tabindex="0" aria-expanded="false"><b>Before this paragraph</b><span class="short">${earlier.length === 1 ? 'one note' : earlier.length + ' notes'} answered before its first draft</span><div class="more" hidden><div class="t">${lead}</div>${list}</div></div>`);
  }
  (isPre ? [] : D.notes).forEach((nt, j) => {     // the essay's notes never render at a negative stop, the birth notes never at a draft
    const st = noteState(nt, s);
    if (st.clearedBetween){
      entries.push({rank: 1, ws: nt.written_state, html: `<div class="e quiet" data-id="${nt.id}"><div class="l">The author, in the margin <span>· cleared between drafts</span></div><div class="t">${esc(nt.text)}</div><div class="b">Written ${fmt(nt.written_at + ':00')}; cleared at save ${nt.resolved_state}, ${fmt(nt.resolved_at + ':00')}, which changed no words here.</div></div>`});
      strip.push(`<div class="si" data-k="${j}" role="button" tabindex="0" aria-expanded="false"><b>Note cleared</b><span class="short">${esc(nt.text.length > 60 ? nt.text.slice(0, 60) + '…' : nt.text)}</span><div class="more" hidden><div class="t">${esc(nt.text)}</div><div class="b">Cleared at save ${nt.resolved_state}, which changed no words here.</div></div></div>`);
      return;
    }
    if (st.afterLast && idx === stops.length - 1){
      entries.push({rank: 1, ws: nt.written_state, html: `<div class="e quiet" data-id="${nt.id}"><div class="l">After the last draft <span>· ${fmt(nt.written_at + ':00')}</span></div><div class="t">${esc(nt.text)}</div><div class="b">Written after this paragraph’s last change, at save ${nt.written_state}${nt.resolved_state < 1e6 ? `; cleared at save ${nt.resolved_state} without changing it` : '; never cleared'}.</div></div>`});
      strip.push(`<div class="si" data-k="${j}" role="button" tabindex="0" aria-expanded="false"><b>After the last draft</b><span class="short">${esc(nt.text.length > 60 ? nt.text.slice(0, 60) + '…' : nt.text)}</span><div class="more" hidden><div class="t">${esc(nt.text)}</div></div></div>`);
      return;
    }
    if (!(st.open || st.here)) return;
    const from = nt.shared_from ? ` · from ¶${nt.shared_from.slice(1)}’s block` : (nt.stood_on_para ? ` · written on ¶${nt.stood_on_para.slice(1)}’s text` : '');
    const beforeFirst = nt.written_state < stops[0].state ? `${Math.round((new Date(stops[0].iso) - new Date(nt.written_at + ':00')) / 60000)} minutes before this paragraph’s first draft` : '';
    const stood = nt.stood_on && (nt.stood_on_para || nt.written_state < stops[0].state) ? `<details><summary>the text it stood on</summary><div class="b">${esc(nt.stood_on)}${nt.stood_on.length >= 320 ? '…' : ''}</div></details>` : '';
    const wb = st.writtenBetween && st.wIdx === idx ? `written at save ${nt.written_state}, while this draft was on screen · ` : '';
    const when = `${fmt(nt.written_at + ':00')} · ${wb}${beforeFirst ? beforeFirst + ' · ' : ''}${st.open ? 'open at this draft' : openFor(nt.minutes_open)}`;
    const how = nt.basis ? `<details><summary>how this note was matched</summary><div class="b">Placed on ¶${D.n} by ${esc(nt.basis)}${nt.confidence ? `, confidence ${esc(nt.confidence)}` : ''}${nt.why ? `: ${esc(register(nt.why))}` : ''}.</div></details>` : '';
    const trig = st.here ? D.instructions.find(x => x.state === s.state && x.round && x.round.here.includes(nt.id)) : null;
    const jump = st.here ? `<span class="ans">${CHK}Taken up here</span><span class="b"> · by the next save, ${fmt(s.iso).split(', ')[1]}</span>` : (st.cleared ? `<span class="b">cleared at save ${nt.resolved_state}, which did not change this paragraph</span>` : `<a href="#" data-go="${st.ansIdx}">See what it changed ›</a>`);
    entries.push({rank: 1, ws: nt.written_state, html: `<div class="e ${st.here ? 'here' : 'live'}" id="note${j}" data-id="${nt.id}"><div class="l">${pastedNote(nt) ? 'From the exchange, pasted into the margin by the author' : `The author, ${nt.top ? 'at the top of the essay' : 'in the margin'}`} <span>· ${when}${from}</span></div><div class="t">${esc(nt.text)}</div>${stood}${how}<div class="jump">${jump}</div></div>`});
    strip.push(`<div class="si${st.here ? ' here' : ''}${cur.expanded.has(j) ? ' open' : ''}" data-k="${j}" role="button" tabindex="0" aria-expanded="${cur.expanded.has(j) ? 'true' : 'false'}"><b>${st.here ? `${CHK}<span class="ans">taken up here</span>` : 'The author’s note, open'}</b><span class="short"${cur.expanded.has(j) ? ' hidden' : ''}>${esc(nt.text.length > 70 ? nt.text.slice(0, 70) + '…' : nt.text)}</span><div class="more"${cur.expanded.has(j) ? '' : ' hidden'}><div class="t">${esc(nt.text)}</div><div class="jump">${st.here || st.cleared ? '' : `<a href="#" data-go="${st.ansIdx}">See what it changed ›</a>`}</div></div></div>`);
  });
  const firstChange = stops.findIndex((z, j) => j > 0 && (z.kind === 'draft' || z.kind === 'markup') && !z.absent);   // the first stop after draft 0 that changed the words: its message is its cause
  (isPre ? [] : D.instructions).filter(x => x.state === s.state && (x.items_mine.length || x.ruled || idx === fd || idx === firstChange)).forEach(x => { entries.push({rank: 2, html: instrEntry(x, false)}); strip.push(instrEntry(x, true)); });
  // artifacts enter at the first stop at or after their entry; cuts at the stop where the passage died
  (isPre ? [] : D.artifacts).forEach((a, j) => { const at = stops.findIndex(z => a.entered_state != null && z.state >= a.entered_state); if (at !== idx) return;
    // in register (BK5): the kind on the label, the name and what it did in the body, no first name, no catalogue number; the author's line when he wrote one
    const h = `<div class="e quiet" id="art${j}"><div class="l">Artifact <span>· ${esc(a.kind)}</span></div><div class="t"><strong>${esc(register(a.name))}</strong>${a.did ? ' · ' + esc(register(a.did)) : ''}</div>${a.evan ? `<div class="b">${esc(register(a.evan))}</div>` : ''}</div>`;
    entries.push({rank: 3, html: h}); strip.push(`<div class="si" data-k="a${j}" role="button" tabindex="0" aria-expanded="false"><b>Artifact</b><span class="short">${esc(register(a.name))}</span><div class="more" hidden><div class="t">${esc(a.kind)}${a.did ? ' · ' + esc(register(a.did)) : ''}</div>${a.evan ? `<div class="b">${esc(register(a.evan))}</div>` : ''}</div></div>`); });
  (isPre ? [] : D.cuts).forEach((c, j) => { let at = stops.findIndex(z => c.died != null && z.state >= c.died); if (c.died == null) at = stops.length - 1; if (at !== idx) return;
    const h = `<div class="e quiet" id="cut${j}"><div class="l">Cut <span>· ${c.died != null ? `at save ${c.died}` : `last seen at save ${c.last_alive}; the save that cut it is not recorded`}${c.cut_true ? ' · true, and cut anyway' : ''}</span></div><div class="t"><strong>${esc(register(c.name))}</strong>${c.reason ? ' · ' + esc(register(c.reason)) : ''}</div></div>`;
    entries.push({rank: 3, html: h}); strip.push(`<div class="si" data-k="x${j}" role="button" tabindex="0" aria-expanded="false"><b>Cut</b><span class="short">${esc(register(c.name))}</span><div class="more" hidden><div class="t">${c.reason ? esc(register(c.reason)) : 'at save ' + c.died}</div></div></div>`); });
  // Order (Evan, 2026-09-14 13:13): the newest note on top; a note taken up stays a card and slides down as newer notes
  // arrive above it. Notes first by their written save, newest first; then the exchange card, chat lines, artifacts, cuts.
  elsewhere.forEach(({n, x, h}) => { const para = `¶${h.k.slice(1)}`; const href = `${LR.base}?mode=drafts#${h.cite}`;
    entries.push({rank: 1.2, html: `<div data-pair="${n}" class="e quiet elsewhere"><div class="l">${pnMark(n)}The author’s note <span>· its card is on ${para}</span></div><div class="t">${esc(x.text)}</div><div class="b">Written on a passage this paragraph shares with ${para}, where the note is placed.</div><div class="jump"><a href="${href}">Read it on ${para} ›</a></div></div>`});
    strip.push(`<div data-pair="${n}" class="si elsewhere" data-k="h${n}" role="button" tabindex="0" aria-expanded="false"><b>${pnMark(n)}Note placed on ${para}</b><span class="short">${esc(x.text.length > 60 ? x.text.slice(0, 60) + '…' : x.text)}</span><div class="more" hidden><div class="t">${esc(x.text)}</div><div class="jump"><a href="${href}">Read it on ${para} ›</a></div></div></div>`); });
  entries.sort((a, b) => (a.rank - b.rank) || ((b.ws || 0) - (a.ws || 0)));
  entries.forEach(e => { const id = (e.html.match(/data-id="([^"]+)"/) || [])[1]; const n = id != null ? pairOf[id] : null;
    if (n) e.html = e.html.replace('<div class="e', `<div data-pair="${n}" class="e`).replace('<div class="l">', `<div class="l">${pnMark(n)}`); });
  strip.forEach((h, i) => { const k = (h.match(/data-k="([^"]+)"/) || [])[1]; if (k == null) return;
    const id = isPre ? k : (/^\d+$/.test(k) ? (D.notes[+k] || {}).id : null); const n = id != null ? pairOf[id] : null;
    if (n) strip[i] = h.replace('<div class="si', `<div data-pair="${n}" class="si`).replace('<b>', `<b>${pnMark(n)}`); });
  const m = $('.margin', sec); const ns = $('.notestrip', sec);
  const before = flipBefore(m, '.e[data-id]'); const beforeS = flipBefore(ns, '.si[data-k]');
  m.innerHTML = entries.map(e => e.html).join('');
  ns.innerHTML = strip.join('');
  pairBind(sec);
  if (animate && !reduced()){ flipAfter(m, '.e[data-id]', before); flipAfter(ns, '.si[data-k]', beforeS); }
  $$('.si', ns).forEach(si => {
    si.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); si.click(); } });
    si.addEventListener('click', e => { if (e.target.closest('a')) return; const more = $('.more', si); const openNow = more.hidden; more.hidden = !openNow; const sh = $('.short', si); if (sh) sh.hidden = openNow; si.classList.toggle('open', openNow); si.setAttribute('aria-expanded', openNow ? 'true' : 'false'); const kk = isNaN(+si.dataset.k) ? si.dataset.k : +si.dataset.k; if (openNow) cur.expanded.add(kk); else cur.expanded.delete(kk); });
  });
  $$('a[data-go]', sec).forEach(a => a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); go(+a.dataset.go, true); }));
  $$('.stood', sec).forEach(st => { const tog = e => { e.stopPropagation(); st.classList.toggle('full'); }; st.addEventListener('click', tog); st.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); tog(e); } }); });
  if (animate && !reduced()){
    if (isPre) s.notes.forEach(nt => typeInto($$(`.margin .e.birth[data-id="${nt.id}"] .t, .notestrip .si[data-k="${nt.id}"] ${cur.expanded.has(nt.id) ? '.more .t' : '.short'}`, sec), nt.text));
    else D.notes.forEach((nt, j) => { const wIdx = wDraftOf(nt, stops); if (wIdx === idx) typeInto($$(`#note${j} .t, .notestrip .si[data-k="${j}"] ${cur.expanded.has(j) ? '.more .t' : '.short'}`, sec), nt.text); });

    $$('.e.here, .si.here', sec).forEach(e => { e.classList.remove('here'); void e.offsetWidth; e.classList.add('here'); });
  }
  const range = $('input[type=range]', sec); range.value = idx; range.setAttribute('aria-valuetext', state.textContent);
  $('.live', sec).textContent = state.textContent;
  drawTrack();
}

// what happened to the sentences at this draft (the chains, 2026-09-11): reworded, new, cut, moved, polished
function chg(s){
  const c = s.changed || []; if (!c.length) return '';
  const n = k => c.filter(x => x.kind === k).length;
  const bits = []; if (n('rewritten')) bits.push(`${n('rewritten')} reworded`); if (n('written')) bits.push(`${n('written')} new`); if (n('cut')) bits.push(`${n('cut')} cut`); if (n('moved')) bits.push(`${n('moved')} moved`);
  const np = n('polish'); const polishLine = np ? `${bits.length ? ', and ' : ''}${np} small punctuation ${np === 1 ? 'change' : 'changes'}` : '';   // folded (ruled 09:49)
  if (!bits.length && !np) return '';
  const how = x => x.evidence.startsWith('run:') ? `${x.evidence.slice(4)} words in common` : x.evidence === 'slot' ? 'same place, no words in common' : x.evidence.startsWith('split') ? 'split from a sentence already here' : x.evidence.startsWith('revived') ? 'words that had been cut, back' : x.evidence.startsWith('merge') ? 'absorbed into another sentence' : '';
  const row = x => { const b = x.before ? `<span class="del">${mdi(x.before)}</span>` : ''; const a = x.after ? `<span class="ins">${mdi(x.after)}</span>` : '';
    const tail = x.kind === 'cut' && x.merged_into ? ` <small>→ absorbed into</small> <span class="ins">${mdi(x.merged_into)}</span>` : '';
    return `<div class="chgrow" data-save="${x.save}" data-kind="${x.kind}"><b>${x.kind === 'written' ? 'new' : x.kind === 'rewritten' ? 'reworded' : x.kind}</b>${how(x) ? ` <small>· ${how(x)}</small>` : ''}${x.cause === 'machine' ? ' <small>· after a Claude write</small>' : ''}<div class="chgt">${b}${b && a ? ' → ' : ''}${a}${tail}</div></div>`; };
  return ` <details class="chg"><summary>Sentences at this draft: ${bits.join(' · ')}${polishLine}</summary>${c.filter(x => x.kind !== 'polish').map(row).join('')}</details>`;
}

function typeInto(els, text){
  const full = text; const shortTxt = full.length > 70 ? full.slice(0, 70) + '…' : full;
  const dur = Math.min(1200, Math.max(400, full.length * 18)); const t0 = performance.now();
  els.forEach(el => el.classList.add('typing'));
  function step(now){ const f = Math.min(1, (now - t0) / dur); els.forEach(el => { const target = el.classList.contains('short') ? shortTxt : full; el.textContent = target.slice(0, Math.ceil(target.length * f)); }); if (f < 1) requestAnimationFrame(step); else els.forEach(el => el.classList.remove('typing')); }
  requestAnimationFrame(step);
}

// ---------- play
function stopPlay(){ if (cur && cur.timer){ clearTimeout(cur.timer); cur.timer = null; const b = $('.play', cur.sec); b.innerHTML = PLAY; b.setAttribute('aria-label', 'Watch it being written'); b.title = 'Watch it being written'; b.classList.remove('on'); } }
function play(){
  stopPlay(); go(-cur.off, false); $('.state', cur.sec).scrollIntoView({block: 'start', behavior: reduced() ? 'auto' : 'smooth'});
  { const b = $('.play', cur.sec); b.innerHTML = STOP; b.setAttribute('aria-label', 'Stop'); b.title = 'Stop'; b.classList.add('on'); }
  const tick = () => { if (cur.idx >= cur.stops.length - 1){ stopPlay(); return; } go(cur.idx + 1, true);
    const s = stopAt(cur.idx); const noteHere = cur.sent ? false : s.pre ? s.notes.length > 0 : (cur.D.notes.some(nt => wDraftOf(nt, cur.stops) === cur.idx) || cur.D.instructions.some(x => x.state === s.state));
    cur.timer = setTimeout(tick, cur.sent ? 2600 : noteHere ? 4500 : 3000); };
  cur.timer = setTimeout(tick, 3000);
}

// the walkthrough (coach + veil) was retired 2026-09-14 (ruled 09:37): a How-to-use-this-page disclosure replaced it

// ---------- Before the essay: the essay-level view (day 3), one edition at a time from record/before.json, rendered on open
let beforeData = null, edSel = -1;
async function loadBefore(){
  if (beforeData) return beforeData;
  const r = await fetch(LR.base + 'record/before.json?v=' + encodeURIComponent(LR.v || ''), {cache: 'no-cache'});
  if (!r.ok) throw new Error('before.json ' + r.status);
  beforeData = await r.json(); return beforeData;
}
const untraced = k => { const a = document.getElementById(k); return !a || !!a.dataset.untraced; };
const siteName = ed => ed.n === -1 ? 'the outline' : ed.n === -2 ? 'the plan' : ed.name;   // the record keeps its own names; the page reads these (ruled 09/14 09:49)
function birthCardStatic(nt, ed){
  const b = nt.became || {}; const n = ed.n;
  const earlier = nt.stood_on && !nt.stood_on_in_text ? ' · <span class="earlier">written on earlier text</span>' : '';
  const stood = nt.stood_on ? `<div class="stood full"><span class="lab">He wrote it ${nt.stood_on_position === 'inside the sentence' ? 'beside' : 'after'}</span> “${esc(pretty(plain(nt.stood_on)))}”</div>` : '';
  const chunk = nt.chunk_at_written ? `<details class="was"><summary>The passage as it stood when he wrote the note, ${fmt(nt.written_at + ':00').split(', ')[1]} ›</summary><div class="b">${esc(pretty(plain(nt.chunk_at_written)))}</div></details>` : '';
  let ans;
  if (nt.answered_by){
    const a0 = plain(nt.answered_by); const q = a0.length > 160 ? a0.slice(0, 160).replace(/\s+\S*$/, '') + '…' : a0;
    ans = `<div class="ansline">${CHK}<span class="ans">taken up ${fmt(nt.answered_at + ':00').split(', ')[1]}, inside ${esc(siteName(ed))}</span> <span class="q">“${esc(pretty(q))}”</span></div>`;
  } else if (nt.answered_in_essay){
    const e = nt.answered_in_essay;
    ans = `<div class="ansline">${CHK}<span class="ans">answered in the essay</span>, ${fmt(e.at + ':00')}${b.para ? ` › <a href="#${b.para}@${e.state}">¶${b.para.slice(1)} at that save</a>` : ''} <span class="q">“${esc(pretty(plain(e.sentence)))}”</span></div>`;
  } else {
    ans = `<div class="b">Never answered${/^Half/.test(nt.verdict || '') ? '; half of this never entered the essay' : ''}${nt.why ? ' · ' + esc(nt.why) : ''}.</div>`;
  }
  let became;
  if (b.para){
    const pn = b.para.slice(1);
    became = untraced(b.para)
      ? `<div class="became">became <a href="#${b.para}">¶${pn}</a> <span class="b">· untraced: that paragraph has no drafts to open · placed by reading</span></div>`
      : `<div class="became">became <a href="#${b.para}@${n}" data-ed="${n}" data-para="${b.para}">¶${pn} ›</a>${(b.also || []).length ? ` <span class="b">and ${b.also.map(k => `<a href="#${k}@${n}" data-ed="${n}" data-para="${k}">¶${k.slice(1)}</a>`).join(', ')}</span>` : ''} <span class="b">· placed by reading; opens the paragraph at ${esc(siteName(ed))}</span></div>`;
  } else if (b.about){
    became = `<div class="became">about <a href="#${b.about}@${n}" data-ed="${n}" data-para="${b.about}">¶${b.about.slice(1)} ›</a> <span class="b">· placed by reading; its words never entered the essay</span></div>`;
  } else if (b.cut_section){
    became = `<div class="became">cut material · shown with the ${esc(b.cut_section)} passage under <a href="#cut">What was cut ›</a></div>`;
  } else {
    became = `<div class="became"><span class="b">a fragment; placed nowhere${nt.why ? ' · ' + esc(nt.why) : ''}</span></div>`;
  }
  const how = `<details><summary>how this note was placed</summary><div class="b">Read by hand against the author’s map of the birth notes, not measured${b.confidence ? `; confidence ${esc(b.confidence)}` : ''}${nt.verdict ? `: ${esc(register(nt.verdict))}` : ''}. The placement was ruled by the author on 9 September 2026.${nt.stood_on && !nt.stood_on_in_text && nt.nearest_ratio != null ? ` The sentence it stood on was rewritten before the last save of ${esc(siteName(ed))}; it is shown beside the paragraph most like the one it stood in (${Math.round(nt.nearest_ratio * 100)}%).` : ''}</div></details>`;
  return `<div class="e birth" data-id="${nt.id}"><div class="l">The author, in ${esc(siteName(ed))} <span>· ${fmt(nt.written_at + ':00')}${earlier}</span></div>${stood}<div class="t">${esc(nt.text)}</div>${chunk}${ans}${became}${how}</div>`;
}
const plainEd = t => String(t || '').replace(/^>\s?/gm, '').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/`/g, '').replace(/\*\*?/g, '').replace(/^#{1,6}\s*/, '').replace(/^- /gm, '– ');   // the file's markdown, read clean
function renderEdition(n){
  const sec = $('section.before'); if (!sec || !beforeData) return;
  const ed = beforeData.editions.find(e => e.n === n); if (!ed) return;
  edSel = n;
  $$('.edsw button', sec).forEach(b => { const on = +b.dataset.ed === n; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  const nm = siteName(ed);
  $('.edhead', sec).textContent = `${nm[0].toUpperCase() + nm.slice(1)} · 3 August, ${ed.from.slice(11, 16)} to ${ed.to.slice(11, 16)} · ${ed.saves} saves, ${ed.writes} of them after a Claude write · ${ed.notes} of the author’s notes · ${ed.words.toLocaleString('en-GB')} words at the last save, shown whole with the notes where they stood.`;
  const at = {}; const lost = [];
  ed.notes_placed.forEach(nt => { const i = nt.para_index != null ? nt.para_index : nt.nearest_para_index; if (i == null) lost.push(nt); else (at[i] = at[i] || []).push(nt); });
  let html = '';
  ed.text.forEach((q, i) => {
    const isHead = /^#{1,6}\s/.test(q), isQuote = /^>/.test(q); const t = esc(pretty(plainEd(q))).replace(/\n/g, '<br>');
    const cards = (at[i] || []).map(nt => birthCardStatic(nt, ed)).join('');
    html += `<article class="edpara${isHead ? ' h' : ''}${isQuote ? ' q' : ''}" data-i="${i}"><div class="pub">${isQuote ? '<span class="lab">A header Claude’s write left at the top of the file</span>' : ''}<p>${t}</p></div><div class="margin">${cards}</div></article>`;
  });
  if (lost.length) html += `<article class="edpara"><div class="pub"><p class="edtail">${lost.length === 1 ? 'One note' : lost.length + ' notes'} stood on text that has no near match in this save.</p></div><div class="margin">${lost.map(nt => birthCardStatic(nt, ed)).join('')}</div></article>`;
  const body = $('.edbody', sec); body.innerHTML = html;
  $$('.stood', body).forEach(st => { const tog = e => { e.stopPropagation(); st.classList.toggle('full'); }; st.addEventListener('click', tog); st.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); tog(e); } }); });
}
async function openBefore(n, scroll){
  const sec = $('section.before'); if (!sec) return;
  if (mode !== 'drafts') setMode('drafts');
  try { await loadBefore(); } catch (e) { console.error(e); return; }
  const dv = $('.edview', sec); if (!dv.open) dv.open = true;
  renderEdition(n == null ? edSel : n);
  if (!cur) writeURL('#before@' + edSel);
  if (scroll !== false) sec.scrollIntoView({block: 'start'});
}
{
  const sec = $('section.before');
  if (sec){
    $('.edview', sec).addEventListener('toggle', e => { if (e.target.open && !$('.edbody .edpara', sec)) openBefore(null, false); });
    $$('.edsw button', sec).forEach(b => b.addEventListener('click', () => openBefore(+b.dataset.ed, false)));
  }
}

// ---------- cite grammar  #p<N>@<state> | @pass<K> | @<ISO>  [+notes]
// LR.state_iso is [[cite id, iso], ...] in time order; a cite id is the state's permanent number (the 09/04 numbering),
// not its row in the record, which moved when the empty-note saves folded (2026-09-11). LR.alias maps a folded id to
// the state it folded into, so a citation made before the fold still opens the right draft.
const stateAtOrBefore = iso => { let hit = null; for (const [c, iso0] of LR.state_iso){ if (iso0 <= iso) hit = c; else break; } return hit; };
function resolveHash(h){
  const m = /^#p(\d+)(?:@([^+]+))?(\+notes)?$/.exec(h || ''); if (!m) return null;
  const k = 'p' + m[1]; const art = document.getElementById(k); if (!art) return null;
  if (art.dataset.untraced) return {k, st: null};
  const last = +art.dataset.last, born = +art.dataset.born; const a = m[2]; let st, ed = null; let isoPre = null;
  if (!a) st = last;
  else if (/^-[12]$/.test(a)){ st = null; ed = +a; }                                   // an edition before the essay
  else if (/^\d+$/.test(a)){ st = (LR.alias && LR.alias[a] != null) ? LR.alias[a] : +a; st = Math.max(0, Math.min(LR.max_cite, st)); }
  else if (/^pass\d+$/i.test(a)){ const p = LR.passes.find(q => q.pass === +a.slice(4)); st = p ? p.end : last; }
  else if (/^\d{4}-\d\d-\d\d/.test(a)){
    const iso = a.length === 10 ? a + 'T23:59:59' : a; st = stateAtOrBefore(iso);
    if (st == null){   // before the merge: the latest edition whose `from` <= ISO wins (a time inside both is -1); before the first, -2
      isoPre = iso.length === 19 ? iso : iso.slice(0, 19);
      const eds = (LR.editions || []).slice().sort((x, y) => x.from < y.from ? -1 : 1);
      let hit = null; eds.forEach(e => { if (e.from <= iso) hit = e; }); ed = hit ? hit.n : (eds.length ? eds[0].n : null); st = null;
      if (ed == null) st = born;
    }
  }
  else st = last;
  return {k, st, ed, iso: isoPre, notes: !!m[3]};
}
function openFromHash(){
  const mb = /^#before(?:@(-[12]))?$/.exec(location.hash);          // the essay-level view at an edition (the chart's before rows link here)
  if (mb){ openBefore(mb[1] ? +mb[1] : -1, true); return true; }
  const r = resolveHash(location.hash); if (!r) return false; open(r.k, r.st, true, r.ed, r.iso); return true;
}

// ---------- wiring
$$('.para .num').forEach(b => b.addEventListener('click', e => { e.preventDefault(); const art = b.closest('.para'); if (cur && cur.k === art.id) close(true); else open(art.id, null, false); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur){ if (cur.sent) leaveSentence(); else close(true); } });
window.addEventListener('hashchange', () => { if (/^#p\d+|^#before/.test(location.hash)) openFromHash(); });
window.addEventListener('resize', () => { if (cur) drawTrack(); });
const initialHash = location.hash;   // setMode must not wipe the cite hash before it is read
setMode(mode, false);
if (/^#p\d+|^#before/.test(initialHash)) openFromHash();
else if (Q.get('p') && document.getElementById('p' + Q.get('p'))) open('p' + Q.get('p'), null, true);
window.LRsite = {open, close, go, resolveHash, get cur(){ return cur; }, setMode, openBefore, enterSentence, leaveSentence, startFromView, get edSel(){ return edSel; }};
})();
