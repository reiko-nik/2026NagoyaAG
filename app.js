// ---------- helpers ----------
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
const toDate = s => new Date(s + "T00:00:00");
const fmtShort = d => `${d.getMonth()+1}/${d.getDate()}`;
const WEEKDAY = ["日","一","二","三","四","五","六"];
// local-calendar-date formatter — NOT toISOString(), which converts to UTC and would
// shift the date by a day in timezones ahead of UTC (e.g. Hong Kong, Japan).
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function mapEmbedUrl(query){ return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`; }
function mapExternalUrl(e){ return e.mapLinkOverride || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.mapQuery)}`; }

const GAMES_START = toDate(EVENTS.reduce((m,e)=> e.start<m?e.start:m, EVENTS[0].start));
const GAMES_END   = toDate(EVENTS.reduce((m,e)=> e.end>m?e.end:m, EVENTS[0].end));
const TOTAL_DAYS = Math.round((GAMES_END-GAMES_START)/86400000)+1;
const dayIndex = s => Math.round((toDate(s)-GAMES_START)/86400000);
// true if dateStr falls inside any of a row's (possibly non-contiguous) session date ranges
function inAnyRange(dateStr, ranges){
  return !!(ranges && ranges.length) && ranges.some(r=> dateStr>=r.start && dateStr<=r.end);
}
// some disciplines (handball, baseball, softball, cricket, water polo) list the FULL international
// schedule with an explicit opponent ("opp") only on HKG's own matches; other sessions under that
// same row are other countries playing each other. hasOppTracking / sessionIsHkgRelevant let the UI
// tell those apart instead of badging every session of an hkg:true row as a Hong Kong match.
function hasOppTracking(e){
  return !!(e.sessions && e.sessions.some(s=>s.opp));
}
function sessionIsHkgRelevant(e, s){
  if(!e.hkg) return false;
  if(!s) return true; // rows with no session data (e.g. ceremonies) — fall back to row-level flag
  if(hasOppTracking(e)) return !!s.opp;
  return true;
}

// ---------- tabs ----------
function switchTab(name){
  $$(".tab-btn").forEach(b=>b.classList.toggle("active", b.dataset.tab===name));
  $$(".tab-panel").forEach(p=>p.classList.toggle("active", p.id==="tab-"+name));
}
$$(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=> switchTab(btn.dataset.tab));
});

// ---------- modal ----------
function openModal(e, venues){
  const dateStr = e.start===e.end ? e.start : `${e.start} – ${e.end}`;
  const roster = e.hkg ? getRoster(e.disciplineKey) : null;
  const hasRoster = !!(roster && roster.athletes.length);
  const timeLine = e.sessionTime ? `<div class="m-row"><span>時間</span><span>${e.sessionTime}</span></div>` : '';
  const phaseLine = e.phase ? `<div class="m-row"><span>賽事階段</span><span>${PHASE_LABELS[e.phase]||e.phase}</span></div>` : '';
  const oppLine = e.opp ? `<div class="m-row"><span>對手</span><span>${e.opp}</span></div>` : '';
  $("#modal-body").innerHTML = `
    <h3>${e.title || e.event}</h3>
    <div class="m-sub">${e.sport}${e.hkg?' · <span style="color:#ff8fa0">香港代表隊參與</span>':''}</div>
    <div class="m-row"><span>日期</span><span>${dateStr}</span></div>
    ${timeLine}
    ${phaseLine}
    ${oppLine}
    <div class="m-row"><span>場館</span><span>${venues ? venues.join('、') : e.venue}</span></div>
    <div class="m-row"><span>地址</span><span>${e.address||''}</span></div>
    <div class="m-actions">
      <a class="m-link" href="${mapExternalUrl(e)}" target="_blank" rel="noopener">在 Google 地圖開啟 ↗</a>
      ${hasRoster ? `<button type="button" class="m-link m-link-secondary" id="modal-roster-btn">查看香港代表名單 →</button>` : ""}
    </div>
  `;
  $("#modal-backdrop").classList.add("open");
  if(hasRoster){
    $("#modal-roster-btn").addEventListener("click", ()=>{
      $("#modal-backdrop").classList.remove("open");
      jumpToRoster(e.sport, e.event);
    });
  }
}
$("#modal-close").addEventListener("click", ()=> $("#modal-backdrop").classList.remove("open"));
$("#modal-backdrop").addEventListener("click", ev=>{ if(ev.target.id==="modal-backdrop") $("#modal-backdrop").classList.remove("open"); });

// jump from Tab 1/2's modal to the matching HKG roster row in Tab 3
function jumpToRoster(sport, event){
  const match = EVENTS.find(e => e.sport===sport && e.event===event && e.hkg && getRoster(e.disciplineKey));
  if(!match) return;

  switchTab("table");
  openRosterIds.add(match.id);
  subTabState.set(match.id, "roster");
  renderTable();

  requestAnimationFrame(()=>{
    const row = document.querySelector(`#table-body tr.event-row[data-id="${match.id}"]`);
    if(!row) return;
    row.scrollIntoView({ behavior:"smooth", block:"center" });
    row.classList.add("flash");
    setTimeout(()=> row.classList.remove("flash"), 1500);
  });
}

// ==================================================================
// TAB 1 — Day ribbon + Gantt timeline + Daily view
// ==================================================================
let calView = "timeline";
let selectedDayIdx = clampTodayIdx();

function clampTodayIdx(){
  const today = new Date(); today.setHours(0,0,0,0);
  const idx = Math.round((today-GAMES_START)/86400000);
  return Math.min(Math.max(idx,0), TOTAL_DAYS-1);
}
function dateStrForIdx(i){ return ymd(new Date(GAMES_START.getTime()+i*86400000)); }

$$(".view-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    calView = btn.dataset.view;
    $$(".view-btn").forEach(b=>b.classList.toggle("active", b===btn));
    $("#timeline-view").classList.toggle("active", calView==="timeline");
    $("#daily-view").classList.toggle("active", calView==="daily");
    // day-ribbon is only needed in Daily view now — Timeline has its own sticky in-track date
    // axis that scrolls in lockstep with the bars, so the outer ribbon would be redundant there.
    $("#day-ribbon").classList.toggle("is-hidden", calView!=="daily");
    if(calView==="daily") renderDailyView();
    if(syncGanttAxisPin) syncGanttAxisPin();
    markSelectedDayChip();
  });
});

function dayHasHkgAction(dateStr){
  return EVENTS.some(e=>{
    if(!e.hkg) return false;
    if(e.sessions && e.sessions.length){
      return hasOppTracking(e)
        ? e.sessions.some(s=> s.date===dateStr && s.opp)
        : e.sessions.some(s=> s.date===dateStr);
    }
    return inAnyRange(dateStr, e.dateRanges);
  });
}

function renderDayRibbon(){
  const ribbon = $("#day-ribbon");
  ribbon.innerHTML = "";
  for(let i=0;i<TOTAL_DAYS;i++){
    const d = new Date(GAMES_START.getTime()+i*86400000);
    const dateStr = ymd(d);
    const hasHkg = dayHasHkgAction(dateStr);
    const chip = document.createElement("div");
    chip.className = "day-chip" + (hasHkg?" has-hkg":"");
    chip.dataset.idx = i;
    chip.innerHTML = `<div class="dnum">${d.getDate()}</div><div class="dlabel">${fmtShort(d)}(${WEEKDAY[d.getDay()]})</div><div class="ddot"></div>`;
    chip.title = hasHkg ? "有香港代表隊項目" : "";
    chip.addEventListener("click", ()=>{
      selectedDayIdx = i;
      markSelectedDayChip();
      if(calView==="daily"){
        renderDailyView();
        // ribbon is sticky and may be reached while scrolled deep into a long card list —
        // snap back so the newly-picked date's cards are visible right below it. (Can't use the
        // ribbon's own rect for this: once stuck, it always reports its clamped position, not
        // where it'd naturally sit — so anchor on the non-sticky list element instead.)
        const list = $("#daily-list");
        const topbarH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 0;
        const ribbonH = ribbon.getBoundingClientRect().height;
        const listDocTop = list.getBoundingClientRect().top + window.scrollY;
        const targetY = Math.max(0, listDocTop - topbarH - ribbonH - 10);
        if(window.scrollY > targetY) window.scrollTo({ top: targetY, behavior: "smooth" });
      } else {
        scrollGanttToDay(i);
      }
    });
    ribbon.appendChild(chip);
  }
  markSelectedDayChip();
}
function markSelectedDayChip(){
  $$(".day-chip").forEach(c=> c.classList.toggle("selected", Number(c.dataset.idx)===selectedDayIdx));
}

function scrollGanttToDay(i){
  const wrap = $(".gantt-wrap");
  const trackWidth = $(".gantt").scrollWidth - 140;
  const perDay = trackWidth / TOTAL_DAYS;
  wrap.scrollTo({ left: Math.max(0, 140 + i*perDay - 260), behavior:"smooth" });
}

function groupForGantt(){
  const byKey = {};
  const order = [];
  EVENTS.forEach(e=>{
    const key = e.sport + "|" + e.event;
    if(!byKey[key]){ byKey[key] = { sport:e.sport, event:e.event, hkg:false, bars:[] }; order.push(key); }
    const g = byKey[key];
    if(e.hkg) g.hkg = true;
    const ranges = (e.dateRanges && e.dateRanges.length) ? e.dateRanges : [{start:e.start, end:e.end}];
    ranges.forEach(rg=>{
      g.bars.push({ event:e.event, start:rg.start, end:rg.end, hkg:e.hkg, venue:e.venue, sport:e.sport,
                    address:e.address, mapQuery:e.mapQuery, mapLinkOverride:e.mapLinkOverride, disciplineKey:e.disciplineKey });
    });
  });
  return { byKey, order };
}

function renderGanttAxis(){
  const row = document.createElement("div");
  row.className = "gantt-row gantt-axis";
  const label = document.createElement("div");
  label.className = "gantt-label gantt-axis-label";
  row.appendChild(label);
  const track = document.createElement("div");
  track.className = "gantt-track gantt-axis-track";
  const todayStr = dateStrForIdx(clampTodayIdx());
  for(let i=0;i<TOTAL_DAYS;i++){
    const d = new Date(GAMES_START.getTime()+i*86400000);
    const ds = dateStrForIdx(i);
    const cell = document.createElement("div");
    cell.className = "gantt-axis-cell" + (ds===todayStr?" today":"");
    cell.innerHTML = `<span class="gac-num">${d.getDate()}</span><span class="gac-wd">${WEEKDAY[d.getDay()]}</span>`;
    track.appendChild(cell);
  }
  row.appendChild(track);
  return row;
}

function renderGantt(){
  const { byKey, order } = groupForGantt();
  const gantt = $("#gantt");
  gantt.innerHTML = "";
  const axisRow = renderGanttAxis();
  gantt.appendChild(axisRow);
  order.forEach(key=>{
    const g = byKey[key];
    const row = document.createElement("div");
    row.className = "gantt-row";
    row.dataset.sport = g.sport;
    row.dataset.event = g.event;
    row.dataset.hkg = g.hkg;

    const label = document.createElement("div");
    label.className = "gantt-label";
    label.innerHTML = `<span class="gl-sport">${g.sport}</span><span class="gl-event">${g.event}</span>`;
    row.appendChild(label);

    const track = document.createElement("div");
    track.className = "gantt-track";
    for(let i=0;i<TOTAL_DAYS;i++){ const c=document.createElement("div"); c.className="gridcol"; track.appendChild(c); }

    g.bars.forEach(bar=>{
      const s = dayIndex(bar.start), e = dayIndex(bar.end);
      const left = (s/TOTAL_DAYS*100).toFixed(3);
      const width = (((e-s+1)/TOTAL_DAYS)*100).toFixed(3);
      const el = document.createElement("div");
      el.className = "gantt-bar" + (bar.hkg?" hkg":"");
      el.style.left = left+"%";
      el.style.width = width+"%";
      el.textContent = bar.event;
      el.title = `${bar.sport} · ${bar.event} · ${bar.venue} · ${bar.start}–${bar.end}`;
      el.addEventListener("click", ()=> openModal({sport:bar.sport, event:bar.event, start:bar.start, end:bar.end, hkg:bar.hkg, venue:bar.venue, address:bar.address, mapQuery:bar.mapQuery, mapLinkOverride:bar.mapLinkOverride, disciplineKey:bar.disciplineKey}));
      track.appendChild(el);
    });

    row.appendChild(track);
    gantt.appendChild(row);
  });
  applyGanttFilters();
  setupGanttAxisPin(axisRow);
}

// The real axis row (axisRow) stays in normal document flow inside the horizontally-scrolling
// .gantt-wrap. This clone is toggled to position:fixed only while that row would otherwise have
// scrolled above the topbar but the gantt itself is still in view, so the date reference stays
// visible without permanently occupying screen space. Its horizontal offset is kept in sync with
// .gantt-wrap's own scrollLeft so it never drifts out of alignment with the bars underneath.
let ganttAxisShadow = null;
let syncGanttAxisPin = null;
function setupGanttAxisPin(axisRow){
  const wrap = $(".gantt-wrap");
  const fresh = axisRow.cloneNode(true);
  fresh.classList.add("pinned");
  fresh.style.display = "none";
  if(ganttAxisShadow) ganttAxisShadow.replaceWith(fresh);
  else document.body.appendChild(fresh);
  ganttAxisShadow = fresh;

  function apply(){
    if(calView !== "timeline"){ ganttAxisShadow.style.display = "none"; return; }
    const topbarH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 0;
    const wrapRect = wrap.getBoundingClientRect();
    const axisH = axisRow.getBoundingClientRect().height || 30;
    const shouldPin = wrapRect.top < topbarH && wrapRect.bottom > topbarH + axisH;
    if(shouldPin){
      ganttAxisShadow.style.display = "flex";
      ganttAxisShadow.style.top = topbarH + "px";
      ganttAxisShadow.style.left = wrapRect.left + "px";
      ganttAxisShadow.style.width = wrapRect.width + "px";
      const track = $(".gantt-axis-track", ganttAxisShadow);
      if(track) track.style.transform = `translateX(${-wrap.scrollLeft}px)`;
    } else {
      ganttAxisShadow.style.display = "none";
    }
  }
  // rAF-throttled: raw scroll events can fire far more often than the screen refreshes,
  // especially during touch-driven momentum scrolling on mobile — syncing on every single one
  // is what made the pin feel like it was lagging/stuttering behind the actual scroll position.
  let queued = false;
  function sync(){
    if(queued) return;
    queued = true;
    requestAnimationFrame(()=>{ queued = false; apply(); });
  }
  wrap.addEventListener("scroll", sync, {passive:true});
  window.addEventListener("scroll", sync, {passive:true});
  window.addEventListener("resize", sync);
  if(window.visualViewport) window.visualViewport.addEventListener("resize", sync); // iOS/Android dynamic toolbar
  syncGanttAxisPin = sync;
  apply();
}

function applyGanttFilters(){
  const q = $("#cal-search").value.trim().toLowerCase();
  const hkgOnly = $("#cal-hkg-only").checked;
  $$(".gantt-row:not(.gantt-axis)").forEach(row=>{
    const matchesQ = !q || row.dataset.sport.toLowerCase().includes(q) || row.dataset.event.toLowerCase().includes(q) || $$(".gantt-bar", row).some(b=>b.textContent.toLowerCase().includes(q));
    const matchesHkg = !hkgOnly || row.dataset.hkg==="true";
    row.classList.toggle("dim", !(matchesQ && matchesHkg));
  });
}
function onCalFiltersChanged(){
  applyGanttFilters();
  if(calView==="daily") renderDailyView();
}
$("#cal-search").addEventListener("input", onCalFiltersChanged);
$("#cal-hkg-only").addEventListener("change", onCalFiltersChanged);

// ---- Daily events view ----
function renderDailyView(){
  const dateStr = dateStrForIdx(selectedDayIdx);
  const d = toDate(dateStr);
  $("#daily-date-label").innerHTML = `${d.getMonth()+1}月${d.getDate()}日 星期${WEEKDAY[d.getDay()]}<span class="dd-sub">Day ${selectedDayIdx+1} of ${TOTAL_DAYS}</span>`;
  $("#day-prev").disabled = selectedDayIdx===0;
  $("#day-next").disabled = selectedDayIdx===TOTAL_DAYS-1;

  const q = $("#cal-search").value.trim().toLowerCase();
  const hkgOnly = $("#cal-hkg-only").checked;

  let cards = [];
  EVENTS.forEach(e=>{
    if(hkgOnly && !e.hkg) return;
    if(e.sessions && e.sessions.length){
      e.sessions.filter(s=>s.date===dateStr).forEach(s=>{
        const relevant = sessionIsHkgRelevant(e, s);
        if(hkgOnly && hasOppTracking(e) && !relevant) return; // skip other countries' matches when filtering to HKG-only
        if(q){
          const hay = (e.sport+e.event+e.venue+s.name+(s.venue||"")).toLowerCase();
          if(!hay.includes(q)) return;
        }
        cards.push({ e, s, hkgMatch: !!s.opp, relevant });
      });
    } else if(inAnyRange(dateStr, e.dateRanges)){
      if(q){
        const hay = (e.sport+e.event+e.venue).toLowerCase();
        if(!hay.includes(q)) return;
      }
      cards.push({ e, s:null, hkgMatch:false, relevant: e.hkg });
    }
  });
  cards.sort((a,b)=> (Number(b.relevant)-Number(a.relevant)) || ((a.s&&a.s.start)||"").localeCompare((b.s&&b.s.start)||"") || a.e.sport.localeCompare(b.e.sport,'zh-Hant'));

  const list = $("#daily-list");
  if(!cards.length){
    list.innerHTML = `<div class="daily-empty">此日沒有符合篩選條件的賽事</div>`;
    return;
  }
  list.innerHTML = cards.map(({e, s, hkgMatch, relevant})=>{
    const sidx = s ? e.sessions.indexOf(s) : -1;
    const timeStr = s ? (s.start||"") + (s.end?`–${s.end}`:"") : "全日";
    const nameStr = s ? s.name : e.event;
    const venueStr = s ? (s.venue||e.venue) : e.venue;
    const phaseBadge = s ? `<span class="badge-phase phase-${s.phase}">${PHASE_LABELS[s.phase]||s.phase}</span>` : "";
    const oppBadge = s && s.opp ? `<span class="badge-opp">vs ${s.opp}</span>` : "";
    return `<div class="daily-card${relevant?' hkg':''}${hkgMatch?' hkg-match':''}" data-id="${e.id}" data-sidx="${sidx}">
      <div class="dc-main">
        <div class="dc-time">${timeStr}</div>
        <div class="dc-sport">${e.sport}</div>
        <div class="dc-event">${nameStr}</div>
        <div class="dc-venue">📍 ${venueStr}</div>
      </div>
      <div class="dc-badge">${phaseBadge}${oppBadge}${relevant ? '<span class="badge-hkg">🇭🇰 HKG</span>' : ''}</div>
    </div>`;
  }).join("");

  $$(".daily-card").forEach(card=>{
    card.addEventListener("click", ()=>{
      const e = EVENTS.find(x=>x.id===Number(card.dataset.id));
      if(!e) return;
      const sidx = Number(card.dataset.sidx);
      const s = sidx>=0 ? e.sessions[sidx] : null;
      if(s){
        openModal({ sport:e.sport, event:e.event, title:s.name, start:s.date, end:s.date, hkg:sessionIsHkgRelevant(e,s), venue:s.venue||e.venue,
                    address:e.address, mapQuery:e.mapQuery, mapLinkOverride:e.mapLinkOverride, disciplineKey:e.disciplineKey,
                    sessionTime:(s.start||"")+(s.end?`–${s.end}`:""), phase:s.phase, opp:s.opp });
      } else {
        openModal(e);
      }
    });
  });
}
$("#day-prev").addEventListener("click", ()=>{
  if(selectedDayIdx>0){ selectedDayIdx--; markSelectedDayChip(); renderDailyView(); }
});
$("#day-next").addEventListener("click", ()=>{
  if(selectedDayIdx<TOTAL_DAYS-1){ selectedDayIdx++; markSelectedDayChip(); renderDailyView(); }
});

// ==================================================================
// TAB 2 — Venue list + embedded Google Map
// ==================================================================
function groupByVenue(){
  const byVenue = {};
  const order = [];
  EVENTS.forEach(e=>{
    const key = e.venue+"|"+e.address;
    if(!byVenue[key]){ byVenue[key] = { venue:e.venue, address:e.address, city:e.city, mapQuery:e.mapQuery, mapLinkOverride:e.mapLinkOverride, sports:[], hkg:false }; order.push(key); }
    const v = byVenue[key];
    v.sports.push({sport:e.sport, event:e.event, hkg:e.hkg, start:e.start, end:e.end});
    if(e.hkg) v.hkg = true;
  });
  return order.map(k=>byVenue[k]);
}

let currentVenues = [];
function renderVenueList(){
  currentVenues = groupByVenue();
  const list = $("#venue-list");
  list.innerHTML = "";
  currentVenues.forEach((v, idx)=>{
    const card = document.createElement("div");
    card.className = "venue-card";
    card.dataset.idx = idx;
    card.dataset.hkg = v.hkg;
    card.dataset.search = (v.venue+" "+v.sports.map(s=>s.sport+" "+s.event).join(" ")).toLowerCase();
    card.innerHTML = `
      <div class="vname">${v.venue}</div>
      <div class="vmeta">${v.city} · ${v.address}</div>
      <div class="vsports">${v.sports.map(s=>`<span class="tag${s.hkg?' hkg':''}">${s.sport}</span>`).join("")}</div>
    `;
    card.addEventListener("click", ()=> selectVenue(idx));
    list.appendChild(card);
  });
  if(currentVenues.length) selectVenue(0);
  applyMapFilters();
}

function selectVenue(idx){
  $$(".venue-card").forEach(c=>c.classList.remove("selected"));
  const card = $(`.venue-card[data-idx="${idx}"]`);
  if(card) card.classList.add("selected");
  const v = currentVenues[idx];
  $("#map-frame").src = mapEmbedUrl(v.mapQuery);
  $("#map-external-link").href = v.mapLinkOverride || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.mapQuery)}`;
}

function applyMapFilters(){
  const q = $("#map-search").value.trim().toLowerCase();
  const hkgOnly = $("#map-hkg-only").checked;
  $$(".venue-card").forEach(card=>{
    const matches = (!q || card.dataset.search.includes(q)) && (!hkgOnly || card.dataset.hkg==="true");
    card.style.display = matches ? "" : "none";
  });
}
$("#map-search").addEventListener("input", applyMapFilters);
$("#map-hkg-only").addEventListener("change", applyMapFilters);

// ==================================================================
// TAB 3 — Sortable table
// ==================================================================
let tableSort = { key:"start", dir:1 };
const openRosterIds = new Set(); // remembers which rows are expanded across re-renders
const subTabState = new Map();   // event id -> "schedule" | "roster" (which sub-tab is showing)

function renderRosterPanel(roster){
  const men = roster.athletes.filter(a=>a.g==="M");
  const women = roster.athletes.filter(a=>a.g==="F");
  const list = arr => arr.map(a=>`<li><span class="ath-en">${a.en}</span><span class="ath-zh">${a.zh}${a.event?` <span class="ath-event">${a.event}</span>`:''}</span></li>`).join("");
  const col = (title, arr) => arr.length
    ? `<div class="roster-col"><h4>${title}（${arr.length}）</h4><ul>${list(arr)}</ul></div>`
    : "";
  return `<div class="roster-panel">
    <div class="roster-title">${roster.label} · 香港代表名單（共 ${roster.athletes.length} 人）</div>
    <div class="roster-cols">
      ${col("男子 Men", men)}
      ${col("女子 Women", women)}
    </div>
  </div>`;
}

// ---- match a session to the specific HKG athlete(s) competing in it -----------------------
// Team sports (handball/baseball/softball/cricket/water polo) already flag their own HKG matches
// via `s.opp`; for those we show the roster split by the gender implied in the session name.
// Individual sports use each athlete's confirmed `event` tag (Chinese) matched against the
// session's English name via discipline-specific keyword rules below.
function matchSessionAthletes(e, s){
  const roster = getRoster(e.disciplineKey);
  if(!roster) return [];
  const name = s.name, n = name.toLowerCase();
  const isWomenName = /\bwomen|\bgirl/i.test(name);
  const isMenName = /\bmen\b|\bboy/i.test(name) && !isWomenName;
  // word-boundary aware gender test — plain .includes('men') would wrongly match inside "women"
  const hasGender = (str, isF) => new RegExp(`\\b${isF?'women':'men'}\\b`, 'i').test(str);

  if(s.opp){ // team match — whole roster of the implied gender
    return roster.athletes.filter(a => isWomenName ? a.g==='F' : isMenName ? a.g==='M' : true);
  }

  const tagged = roster.athletes.filter(a=>a.event);
  if(!tagged.length) return [];

  return tagged.filter(a=>{
    const ev = a.event, isF = a.g==='F';
    switch(e.disciplineKey){
      case 'fencing': {
        const wm = {'花劍':'foil','重劍':'épée','佩劍':'sabre'};
        const weapon = Object.keys(wm).find(zh=>ev.includes(zh));
        if(!weapon || !n.includes(wm[weapon]) || !hasGender(name, isF)) return false;
        if(ev.includes('團體賽') && !ev.includes('個人') && !/\bteam\b/i.test(name)) return false;
        return true;
      }
      case 'archery': {
        const bow = ev.includes('反曲弓') ? 'R' : ev.includes('複合弓') ? 'C' : null;
        if(!bow) return false;
        const code = bow + (isF ? 'W' : 'M');
        const spelled = (bow==='R'?'Recurve':'Compound') + ' ' + (isF?'Women':'Men');
        return new RegExp(`\\b${code}\\b`).test(name) || name.includes(spelled);
      }
      case 'judo': case 'taekwondo': {
        const m = ev.match(/(\d+)公斤級/);
        return !!m && n.includes(`-${m[1]}kg`) && hasGender(name, isF);
      }
      case 'shooting': {
        if(ev.includes('手槍速射') && !/rapid fire pistol/i.test(name)) return false;
        if(ev.includes('氣手槍') && !/air pistol/i.test(name)) return false;
        if(!ev.includes('手槍速射') && !ev.includes('氣手槍')) return false;
        return hasGender(name, isF);
      }
      case 'sailing': {
        if(ev.includes('49人級') && !/skiff/i.test(name)) return false;
        if(ev.includes('愛爾卡') && !/dinghy/i.test(name)) return false;
        if(!ev.includes('49人級') && !ev.includes('愛爾卡')) return false;
        return hasGender(name, isF);
      }
      case 'sailing_windsurfing':
        return /windsurfing/i.test(name) && hasGender(name, isF);
      case 'tennis': {
        if(ev.includes('單打') && !/singles/i.test(name)) return false;
        if(ev.includes('雙打') && !/doubles/i.test(name)) return false;
        if(ev.includes('團體') && !/\bteam\b/i.test(name)) return false;
        if(!/mixed/i.test(name) && !hasGender(name, isF)) return false;
        return true;
      }
      case 'triathlon': {
        if(ev.includes('混合接力') && /relay/i.test(name)) return true;
        if(ev.includes('個人賽') && /individual/i.test(name) && hasGender(name, isF)) return true;
        return false;
      }
      case 'cycling_track_road': {
        if(ev.includes('公路賽') && /road/i.test(name) && hasGender(name, isF)) return true;
        if(ev.includes('全能賽') && /omnium/i.test(name) && hasGender(name, isF)) return true;
        if(ev.includes('麥迪遜') && /madison/i.test(name) && hasGender(name, isF)) return true;
        return false;
      }
      case 'aquatics_swimming': {
        const sm = {'自由泳':'freestyle','蛙泳':'breaststroke','背泳':'backstroke','蝶泳':'butterfly','混合泳':'medley'};
        const stroke = Object.keys(sm).find(zh=> ev.includes(zh) && n.includes(sm[zh]));
        if(!stroke || !hasGender(name, isF)) return false;
        const distances = [...ev.matchAll(/(\d+)米/g)].map(m=>m[1]);
        if(!distances.length) return true;
        return distances.some(d => new RegExp(`\\b${d}m\\b`).test(n));
      }
      case 'badminton':
        return ev.includes('混合雙打') && /mixed doubles/i.test(name);
      case 'volleyball_beach':
        return hasGender(name, isF);
      case 'esports': {
        const gm = {
          '寶可夢大集結':'pokemon unite', '王者榮耀':'honor', '英雄聯盟':'league of legends',
          '無盡對決':'naraka', '跑車浪漫旅7':'gran turismo', '競技武術團體賽':'fighting games',
        };
        const key = Object.keys(gm).find(zh=>ev.includes(zh));
        return !!key && n.includes(gm[key]);
      }
      default: return false;
    }
  });
}

function renderSchedulePanel(e){
  const sessions = e.sessions;
  const byDate = {};
  const order = [];
  sessions.forEach(s=>{
    if(!byDate[s.date]){ byDate[s.date] = []; order.push(s.date); }
    byDate[s.date].push(s);
  });
  const fmtDate = ds=>{ const d = toDate(ds); return `${d.getMonth()+1}/${d.getDate()} (${WEEKDAY[d.getDay()]})`; };
  return `<div class="schedule-panel">
    ${order.map(ds=>`
      <div class="sched-day">
        <div class="sched-day-label">${fmtDate(ds)}</div>
        <div class="sched-day-items">
          ${byDate[ds].map(s=>{
            const athletes = e.hkg ? matchSessionAthletes(e, s) : [];
            const isHkg = !!s.opp || athletes.length>0;
            const athleteLine = athletes.length
              ? `<div class="sched-athletes">🇭🇰 ${athletes.map(a=>`${a.zh} (${a.en})`).join('、')}</div>`
              : '';
            return `
            <div class="sched-item${isHkg?' hkg-match':''}">
              <span class="sched-time">${s.start||''}${s.end?'–'+s.end:''}</span>
              <span class="sched-name">${s.name}${s.opp?` <span class="sched-opp">vs ${s.opp}</span>`:''}</span>
              <span class="sched-phase phase-${s.phase}">${PHASE_LABELS[s.phase]||s.phase}</span>
              ${s.venue?`<span class="sched-venue">📍 ${s.venue}</span>`:''}
              ${athleteLine}
            </div>`;}).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

function renderExpandContent(e, roster, hasRoster, hasSchedule){
  if(hasRoster && hasSchedule){
    const active = subTabState.get(e.id) || "schedule";
    return `<div class="expand-tabs">
        <button type="button" class="expand-tab-btn${active==='schedule'?' active':''}" data-subtab="schedule">賽程</button>
        <button type="button" class="expand-tab-btn${active==='roster'?' active':''}" data-subtab="roster">代表名單</button>
      </div>
      <div class="expand-tab-content">${active==='schedule' ? renderSchedulePanel(e) : renderRosterPanel(roster)}</div>`;
  }
  if(hasSchedule) return renderSchedulePanel(e);
  if(hasRoster) return renderRosterPanel(roster);
  return "";
}

function wireExpandRow(rr, e){
  $$(".expand-tab-btn", rr).forEach(btn=>{
    btn.addEventListener("click", ev=>{
      ev.stopPropagation();
      subTabState.set(e.id, btn.dataset.subtab);
      const roster = e.hkg ? getRoster(e.disciplineKey) : null;
      const hasRoster = !!(roster && roster.athletes.length);
      const hasSchedule = !!(e.sessions && e.sessions.length);
      $("td", rr).innerHTML = renderExpandContent(e, roster, hasRoster, hasSchedule);
      wireExpandRow(rr, e);
    });
  });
}

function renderTable(){
  let rows = [...EVENTS];
  const q = $("#table-search").value.trim().toLowerCase();
  const hkgOnly = $("#table-hkg-only").checked;
  if(q) rows = rows.filter(e => (e.sport+e.event+e.venue).toLowerCase().includes(q));
  if(hkgOnly) rows = rows.filter(e=>e.hkg);

  rows.sort((a,b)=>{
    let av, bv;
    if(tableSort.key==="start"){ av=a.start; bv=b.start; }
    else if(tableSort.key==="sport"){ av=a.sport; bv=b.sport; }
    else if(tableSort.key==="event"){ av=a.event; bv=b.event; }
    else if(tableSort.key==="venue"){ av=a.venue; bv=b.venue; }
    else if(tableSort.key==="hkg"){ av=a.hkg?0:1; bv=b.hkg?0:1; }
    if(av<bv) return -1*tableSort.dir;
    if(av>bv) return 1*tableSort.dir;
    return a.start<b.start?-1:1;
  });

  const tbody = $("#table-body");
  tbody.innerHTML = rows.map(e=>{
    const dateStr = e.start===e.end ? e.start : `${e.start} – ${e.end}`;
    const roster = e.hkg ? getRoster(e.disciplineKey) : null;
    const hasRoster = !!(roster && roster.athletes.length);
    const hasSchedule = !!(e.sessions && e.sessions.length);
    const expandable = hasRoster || hasSchedule;
    const isOpen = expandable && openRosterIds.has(e.id);
    const mainRow = `<tr class="event-row${expandable?' expandable':''}${isOpen?' open':''}" data-id="${e.id}">
      <td class="date-range" data-label="日期">${dateStr}</td>
      <td data-label="運動項目"><strong>${expandable?'<span class="expand-ind">'+(isOpen?'▾':'▸')+'</span>':''}${e.sport}</strong></td>
      <td data-label="分項">${e.event}</td>
      <td data-label="場館">${e.venue}</td>
      <td data-label="香港代表隊">${e.hkg ? '<span class="badge-hkg">🇭🇰 HKG</span>' : '<span class="badge-none">—</span>'}</td>
    </tr>`;
    const rosterRow = expandable
      ? `<tr class="roster-row" data-for="${e.id}"${isOpen?'':' hidden'}><td colspan="5">${isOpen ? renderExpandContent(e, roster, hasRoster, hasSchedule) : ''}</td></tr>`
      : "";
    return mainRow + rosterRow;
  }).join("");

  $$("th[data-sort]").forEach(th=>{
    const ind = $(".sort-ind", th);
    ind.textContent = th.dataset.sort===tableSort.key ? (tableSort.dir===1?"▲":"▼") : "";
  });

  $$("#table-body tr.expandable").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const id = Number(tr.dataset.id);
      const e = EVENTS.find(x=>x.id===id);
      const rosterRow = $(`#table-body tr.roster-row[data-for="${id}"]`);
      if(!rosterRow || !e) return;
      const willOpen = rosterRow.hasAttribute("hidden");
      if(willOpen){
        rosterRow.removeAttribute("hidden");
        openRosterIds.add(id);
        const roster = e.hkg ? getRoster(e.disciplineKey) : null;
        const hasRoster = !!(roster && roster.athletes.length);
        const hasSchedule = !!(e.sessions && e.sessions.length);
        $("td", rosterRow).innerHTML = renderExpandContent(e, roster, hasRoster, hasSchedule);
        wireExpandRow(rosterRow, e);
      } else {
        rosterRow.setAttribute("hidden","");
        openRosterIds.delete(id);
      }
      tr.classList.toggle("open", willOpen);
      const ind = $(".expand-ind", tr);
      if(ind) ind.textContent = willOpen ? "▾" : "▸";
    });
  });

  // rows that were already open before this re-render need their sub-tab buttons re-wired
  $$("#table-body tr.roster-row:not([hidden])").forEach(rr=>{
    const id = Number(rr.dataset.for);
    const e = EVENTS.find(x=>x.id===id);
    if(e) wireExpandRow(rr, e);
  });

}

$$("th[data-sort]").forEach(th=>{
  th.addEventListener("click", ()=>{
    const key = th.dataset.sort;
    if(tableSort.key===key) tableSort.dir *= -1;
    else { tableSort.key = key; tableSort.dir = 1; }
    renderTable();
  });
});
$("#table-search").addEventListener("input", renderTable);
$("#table-hkg-only").addEventListener("change", renderTable);

// ---------- sticky offset (topbar height varies by breakpoint, so measure it instead of
// hardcoding — used by .daily-header to pin itself just below the topbar) ----------
function updateStickyOffsets(){
  const topbar = $(".topbar");
  const topbarH = topbar ? topbar.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty("--topbar-h", topbarH + "px");
}
window.addEventListener("resize", updateStickyOffsets);
if(window.visualViewport) window.visualViewport.addEventListener("resize", updateStickyOffsets);

// ---------- init ----------
renderDayRibbon();
$("#day-ribbon").classList.toggle("is-hidden", calView!=="daily");
renderGantt();
renderVenueList();
renderTable();
updateStickyOffsets();
