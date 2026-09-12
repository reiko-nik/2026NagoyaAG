// ---------- helpers ----------
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
const toDate = s => new Date(s + "T00:00:00");
const fmtShort = d => `${d.getMonth()+1}/${d.getDate()}`;
const WEEKDAY = ["日","一","二","三","四","五","六"];
// local-calendar-date formatter — NOT toISOString(), which converts to UTC and would
// shift the date by a day in timezones ahead of UTC (e.g. Hong Kong, Japan).
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

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
let calView = window.innerWidth <= 640 ? "daily" : "timeline";
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
  $$(".day-chip").forEach(c=> {
    const isSel = Number(c.dataset.idx)===selectedDayIdx;
    c.classList.toggle("selected", isSel);
    if (isSel && window.innerWidth <= 640) {
      c.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  });
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
      
      const dateText = bar.start === bar.end ? fmtShort(toDate(bar.start)) : `${fmtShort(toDate(bar.start))}–${fmtShort(toDate(bar.end))}`;
      if (bar.hkg) {
        el.innerHTML = `<span>${bar.event}</span><span class="gb-date">${dateText}</span>`;
      } else {
        el.textContent = bar.event;
      }
      
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
  let queued = false;
  function sync(){
    if(queued) return;
    queued = true;
    requestAnimationFrame(()=>{ queued = false; apply(); });
  }
  wrap.addEventListener("scroll", sync, {passive:true});
  window.addEventListener("scroll", sync, {passive:true});
  window.addEventListener("resize", sync);
  if(window.visualViewport) window.visualViewport.addEventListener("resize", sync);
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
// Mirrors Tab 3's own precedence: HKG_SCHEDULE (Traditional Chinese, athlete-specific, confirmed/
// candidate status) is the primary source for any discipline it covers; everything else falls
// back to the general per-session data with athletes resolved via matchSessionAthletes(), exactly
// as Tab 3's schedule panel does — so the two tabs never disagree about the same match.
function collectDailyCards(dateStr, q, hkgOnly){
  const cards = [];
  EVENTS.forEach(e=>{
    if(hkgOnly && !e.hkg) return;
    const hkgSessions = HKG_SCHEDULE[e.disciplineKey];
    if(hkgSessions && hkgSessions.length){
      hkgSessions.filter(s=>s.date===dateStr).forEach(s=>{
        if(q){
          const hay = (e.sport+e.event+(s.venue||"")+s.event+s.athletes.map(a=>a.zh+a.en).join(" ")).toLowerCase();
          if(!hay.includes(q)) return;
        }
        cards.push({
          e, key:`${e.id}|hkg|${s.date}|${s.start}|${s.event}`,
          start:s.start, end:s.end, name:s.event, venue:s.venue,
          statusType: s.confirmed ? "confirmed" : "candidate",
          statusLabel: s.confirmed ? "已確認" : "候選名單",
          athletes: s.athletes.map(a=>({zh:a.zh, en:a.en})),
          hkgRelevant: true, hkgMatch: s.confirmed,
        });
      });
    } else if(e.sessions && e.sessions.length){
      e.sessions.filter(s=>s.date===dateStr).forEach(s=>{
        const relevant = sessionIsHkgRelevant(e, s);
        if(hkgOnly && hasOppTracking(e) && !relevant) return;
        if(q){
          const hay = (e.sport+e.event+e.venue+s.name+(s.venue||"")).toLowerCase();
          if(!hay.includes(q)) return;
        }
        const athletes = relevant ? matchSessionAthletes(e, s) : [];
        cards.push({
          e, key:`${e.id}|gen|${s.date}|${s.start}|${s.name}`,
          start:s.start, end:s.end, name:s.name, venue:s.venue||e.venue,
          statusType: "phase", statusLabel: PHASE_LABELS[s.phase]||s.phase, phaseCode:s.phase,
          athletes: athletes.map(a=>({zh:a.zh, en:a.en})),
          hkgRelevant: relevant, hkgMatch: !!s.opp, opp: s.opp,
        });
      });
    } else if(inAnyRange(dateStr, e.dateRanges)){
      if(q){
        const hay = (e.sport+e.event+e.venue).toLowerCase();
        if(!hay.includes(q)) return;
      }
      cards.push({
        e, key:`${e.id}|allday|${dateStr}`,
        start:null, end:null, name:e.event, venue:e.venue,
        statusType:null, statusLabel:"", athletes:[], hkgRelevant:e.hkg, hkgMatch:false,
      });
    }
  });
  cards.sort((a,b)=> (Number(b.hkgRelevant)-Number(a.hkgRelevant)) || (a.start||"").localeCompare(b.start||"") || a.e.sport.localeCompare(b.e.sport,'zh-Hant'));
  return cards;
}

const openDailyCards = new Set();

function renderDailyView(){
  const dateStr = dateStrForIdx(selectedDayIdx);
  const d = toDate(dateStr);
  $("#daily-date-label").innerHTML = `${d.getMonth()+1}月${d.getDate()}日 星期${WEEKDAY[d.getDay()]}<span class="dd-sub">Day ${selectedDayIdx+1} of ${TOTAL_DAYS}</span>`;
  $("#day-prev").disabled = selectedDayIdx===0;
  $("#day-next").disabled = selectedDayIdx===TOTAL_DAYS-1;

  const q = $("#cal-search").value.trim().toLowerCase();
  const hkgOnly = $("#cal-hkg-only").checked;
  const cards = collectDailyCards(dateStr, q, hkgOnly);

  const list = $("#daily-list");
  if(!cards.length){
    list.innerHTML = `<div class="daily-empty">此日沒有符合篩選條件的賽事</div>`;
    return;
  }

  list.innerHTML = cards.map(c=>{
    const isOpen = openDailyCards.has(c.key);
    const timeStr = c.start ? (c.start + (c.end?`–${c.end}`:"")) : "全日";
    const oppBadge = c.opp ? `<span class="badge-opp">vs ${c.opp}</span>` : "";
    const statusBadge = c.statusType==="phase"
      ? `<span class="badge-phase phase-${c.phaseCode}">${c.statusLabel}</span>`
      : c.statusType ? `<span class="sched-status status-${c.statusType}">${c.statusLabel}</span>` : "";
    const mapHref = c.venue && VENUE_COORDS[c.venue]
      ? `https://www.google.com/maps/search/?api=1&query=${VENUE_COORDS[c.venue][0]},${VENUE_COORDS[c.venue][1]}`
      : mapExternalUrl(c.e);
    const detail = `
      <div class="dc-detail"${isOpen?'':' hidden'}>
        <div class="dc-venue-row">${c.venue?`📍 ${c.venue}`:''} <a href="${mapHref}" target="_blank" rel="noopener" class="dc-maplink">在 Google 地圖開啟 ↗</a></div>
        ${c.athletes.length ? `<div class="dc-athletes">🇭🇰 ${c.athletes.map(a=>a.zh?`${a.zh} (${a.en})`:a.en).join('、')}</div>` : ''}
      </div>`;
    return `<div class="daily-card${c.hkgRelevant?' hkg':''}${c.hkgMatch?' hkg-match':''}${isOpen?' open':''}" data-key="${c.key}">
      <div class="dc-header">
        <div class="dc-time">${timeStr}</div>
        <div class="dc-main-text">
          <div class="dc-sport">${c.e.sport}</div>
          <div class="dc-event">${c.name}</div>
        </div>
        <div class="dc-badges">
          ${statusBadge}${oppBadge}
          ${c.hkgRelevant ? '<span class="badge-hkg">🇭🇰 HKG</span>' : ''}
          <span class="dc-expand-ind">${isOpen?'▾':'▸'}</span>
        </div>
      </div>
      ${detail}
    </div>`;
  }).join("");

  $$(".daily-card").forEach(card=>{
    card.addEventListener("click", ()=>{
      const key = card.dataset.key;
      const detailEl = $(".dc-detail", card);
      const willOpen = detailEl.hasAttribute("hidden");
      if(willOpen){ detailEl.removeAttribute("hidden"); openDailyCards.add(key); }
      else { detailEl.setAttribute("hidden",""); openDailyCards.delete(key); }
      card.classList.toggle("open", willOpen);
      const ind = $(".dc-expand-ind", card);
      if(ind) ind.textContent = willOpen ? "▾" : "▸";
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
// TAB 2 — Venue list + multi-pin interactive map (Leaflet + OpenStreetMap)
// ==================================================================
// Derived from the most granular venue data available per row (HKG_SCHEDULE's own per-session
// venue where present, else the general per-session data, else the row's own static venue as a
// last resort for rows with no session breakdown, like the ceremonies) — NOT the row-level
// e.venue field, which for football/baseball/handball/indoor-volleyball is a single joined string
// covering every venue that sport ever uses, and would otherwise collapse into one card/pin.
function groupByVenue(){
  const byVenue = {};
  const order = [];
  function addSport(venueName, sport, event, hkg){
    if(!venueName) return;
    if(!byVenue[venueName]){ byVenue[venueName] = { venue:venueName, sports:new Map(), hkg:false }; order.push(venueName); }
    const v = byVenue[venueName];
    const key = sport+"|"+event;
    if(!v.sports.has(key)) v.sports.set(key, {sport, event, hkg});
    else if(hkg) v.sports.get(key).hkg = true;
    if(hkg) v.hkg = true;
  }
  EVENTS.forEach(e=>{
    const hkgSessions = HKG_SCHEDULE[e.disciplineKey];
    if(hkgSessions && hkgSessions.length){
      hkgSessions.forEach(s=> addSport(s.venue, e.sport, e.event, e.hkg));
    } else if(e.sessions && e.sessions.length){
      e.sessions.forEach(s=> addSport(s.venue, e.sport, e.event, e.hkg));
    } else {
      addSport(e.venue, e.sport, e.event, e.hkg);
    }
  });
  return order.map(name=>{
    const v = byVenue[name];
    return { venue:name, sports:[...v.sports.values()], hkg:v.hkg, coords: VENUE_COORDS[name] || null };
  });
}

let currentVenues = [];
let leafletMap = null;
let leafletMarkers = {};

function initLeafletMap(){
  if(leafletMap || typeof L === "undefined") return;
  leafletMap = L.map("leaflet-map", { scrollWheelZoom:true }).setView([35.15, 137.0], 9);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(leafletMap);
}

function renderMapPins(venues){
  // Leaflet is loaded from a CDN — if that's blocked (offline, firewall, ad-blocker), degrade to
  // just the venue list working normally instead of taking down the rest of the app's init.
  if(typeof L === "undefined"){
    const panel = $("#leaflet-map");
    if(panel && !panel.dataset.fallbackShown){
      panel.dataset.fallbackShown = "1";
      panel.innerHTML = '<div class="map-unavailable">地圖組件無法載入，請改用下方名單，或點擊「在 Google 地圖開啟」查看個別場館。</div>';
    }
    return;
  }
  initLeafletMap();
  Object.values(leafletMarkers).forEach(m=> leafletMap.removeLayer(m));
  leafletMarkers = {};
  const bounds = [];
  venues.forEach(v=>{
    if(!v.coords) return;
    const icon = L.divIcon({
      className: "venue-pin" + (v.hkg ? " venue-pin-hkg" : ""),
      html: '<div class="venue-pin-dot"></div>', iconSize:[16,16], iconAnchor:[8,8],
    });
    const marker = L.marker(v.coords, {icon}).addTo(leafletMap);
    const sportsHtml = v.sports.map(s=>`<span class="popup-tag${s.hkg?' hkg':''}">${s.sport}</span>`).join("");
    marker.bindPopup(`<div class="map-popup"><strong>${v.venue}</strong><div class="popup-sports">${sportsHtml}</div></div>`);
    marker.on("click", ()=> selectVenueByName(v.venue));
    leafletMarkers[v.venue] = marker;
    bounds.push(v.coords);
  });
  if(bounds.length) leafletMap.fitBounds(bounds, { padding:[30,30] });
}

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
      <div class="vsports">${v.sports.map(s=>`<span class="tag${s.hkg?' hkg':''}">${s.sport}</span>`).join("")}</div>
    `;
    card.addEventListener("click", ()=> selectVenue(idx));
    list.appendChild(card);
  });
  renderMapPins(currentVenues);
  applyMapFilters();
}

function selectVenue(idx){
  const v = currentVenues[idx];
  if(!v) return;
  $$(".venue-card").forEach(c=>c.classList.remove("selected"));
  const card = $(`.venue-card[data-idx="${idx}"]`);
  if(card) card.classList.add("selected");
  if(v.coords && leafletMap){
    leafletMap.setView(v.coords, 15, {animate:true});
    const marker = leafletMarkers[v.venue];
    if(marker) marker.openPopup();
    $("#map-external-link").href = `https://www.google.com/maps/search/?api=1&query=${v.coords[0]},${v.coords[1]}`;
  } else if(v.coords){
    $("#map-external-link").href = `https://www.google.com/maps/search/?api=1&query=${v.coords[0]},${v.coords[1]}`;
  } else {
    $("#map-external-link").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.venue)}`;
  }
}
function selectVenueByName(name){
  const idx = currentVenues.findIndex(v=>v.venue===name);
  if(idx>=0) selectVenue(idx);
}

function applyMapFilters(){
  const q = $("#map-search").value.trim().toLowerCase();
  const hkgOnly = $("#map-hkg-only").checked;
  const matchesFilter = card => (!q || card.dataset.search.includes(q)) && (!hkgOnly || card.dataset.hkg==="true");
  $$(".venue-card").forEach(card=>{ card.style.display = matchesFilter(card) ? "" : "none"; });
  const filteredVenues = currentVenues.filter((v,idx)=>{
    const card = $(`.venue-card[data-idx="${idx}"]`);
    return card && matchesFilter(card);
  });
  renderMapPins(filteredVenues);
}
$("#map-search").addEventListener("input", applyMapFilters);
$("#map-hkg-only").addEventListener("change", applyMapFilters);

// ==================================================================
// TAB 3 — Sortable table
// ==================================================================
let tableSort = { key:"start", dir:1 };
const openRosterIds = new Set();
const subTabState = new Map();

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

function matchSessionAthletes(e, s){
  const roster = getRoster(e.disciplineKey);
  if(!roster) return [];
  const name = s.name, n = name.toLowerCase();
  const isWomenName = /\bwomen|\bgirl/i.test(name);
  const isMenName = /\bmen\b|\bboy/i.test(name) && !isWomenName;
  const hasGender = (str, isF) => new RegExp(`\\b${isF?'women':'men'}\\b`, 'i').test(str);

  if(s.opp){
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
      case 'athletics': {
        if(/heptathlon|decathlon/i.test(name)) return false; // combined events use different athletes
        if(!hasGender(name, isF)) return false;
        if(ev.includes('馬拉松競走')) return /race walk/i.test(name);
        if(ev.includes('馬拉松')) return /marathon/i.test(name) && !/race walk/i.test(name);
        if(ev.includes('跳高')) return /high jump/i.test(name);
        if(ev.includes('跳遠')) return /long jump/i.test(name);
        const isHurdles = ev.includes('欄');
        if(isHurdles !== /hurdles/i.test(name)) return false;
        const distances = [...ev.matchAll(/(\d+)米/g)].map(m=>m[1]);
        if(!distances.length) return false;
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
  let hkgSessions = HKG_SCHEDULE[e.disciplineKey];
  if(hkgSessions && hkgSessions.length){
    // "場地單車" (Track) and "公路單車" (Road) are two separate EVENTS rows that share one
    // disciplineKey (the roster/delegation entry covers both) — without this filter, either row
    // would show the other discipline's sessions too (e.g. Track showing Road's Time Trial).
    if(e.disciplineKey === "cycling_track_road"){
      const isRoadRow = e.event.includes("公路");
      const isRoadEvent = s => /road race|time trial/i.test(s.event);
      hkgSessions = hkgSessions.filter(s => isRoadEvent(s) === isRoadRow);
    }
    return renderHkgSchedulePanel(hkgSessions);
  }
  return renderGenericSchedulePanel(e);
}

// Primary path: HKG's own delegation-specific schedule (Traditional Chinese event names,
// specific athlete entrants, sorted by date/time). Covers every sport HKG competes in.
function renderHkgSchedulePanel(sessions){
  // Group by gender first so men's and women's events form clearly separate sections instead of
  // interleaving chronologically (most useful for disciplines, like cycling, where both compete
  // across many overlapping days) — the gender header itself is only shown when 2+ groups exist,
  // since most disciplines are single-gender and the label would just be noise there.
  const GENDER_ORDER = { "男子":0, "女子":1, "混合":2, "其他":3 };
  const genderGroups = {};
  sessions.forEach(s=>{
    const m = s.event.match(/^(男子|女子|混合|Mixed|Men|Women|Boy|Girl)/i);
    let g = "其他";
    if(m){
      const w = m[1];
      if(/^(男子|Men|Boy)/i.test(w)) g = "男子";
      else if(/^(女子|Women|Girl)/i.test(w)) g = "女子";
      else if(/^(混合|Mixed)/i.test(w)) g = "混合";
    }
    (genderGroups[g] = genderGroups[g] || []).push(s);
  });
  const genderOrder = Object.keys(genderGroups).sort((a,b)=>GENDER_ORDER[a]-GENDER_ORDER[b]);
  const showGenderLabels = genderOrder.length > 1;

  const fmtDate = ds=>{ const d = toDate(ds); return `${d.getMonth()+1}/${d.getDate()} (${WEEKDAY[d.getDay()]})`; };

  const renderDayGroups = (sessionsForGroup) => {
    const byDate = {};
    const order = [];
    sessionsForGroup.forEach(s=>{
      if(!byDate[s.date]){ byDate[s.date] = []; order.push(s.date); }
      byDate[s.date].push(s);
    });
    return order.map(ds=>`
      <div class="sched-day">
        <div class="sched-day-label">${fmtDate(ds)}</div>
        <div class="sched-day-items">
          ${byDate[ds].map(s=>{
            const hasAthletes = s.athletes && s.athletes.length>0;
            const athleteLine = hasAthletes
              ? `<div class="sched-athletes">🇭🇰 ${s.athletes.map(a=>a.zh?`${a.zh} (${a.en})`:a.en).join('、')}</div>`
              : '';
            const statusBadge = s.confirmed
              ? `<span class="sched-status status-confirmed">已確認</span>`
              : `<span class="sched-status status-candidate">候選名單</span>`;
            return `
            <div class="sched-item${s.confirmed?' hkg-match':' hkg-tentative'}">
              <span class="sched-time">${s.start||''}${s.end?'–'+s.end:''}</span>
              <span class="sched-name">${s.event}</span>
              ${statusBadge}
              ${s.venue?`<span class="sched-venue">📍 ${s.venue}</span>`:''}
              ${athleteLine}
            </div>`;}).join('')}
        </div>
      </div>`).join('');
  };

  return `<div class="schedule-panel">
    ${genderOrder.map(g=>`
      <div class="sched-gender-group">
        ${showGenderLabels ? `<div class="sched-gender-label">${g}</div>` : ''}
        ${renderDayGroups(genderGroups[g])}
      </div>`).join('')}
  </div>`;
}

// Fallback: sports HKG doesn't compete in (or without dedicated coverage-file data) still show
// the general English-language schedule from the official master schedule file.
function renderGenericSchedulePanel(e){
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

// Some rows (football, baseball, handball, indoor volleyball) span several venues across their
// many sessions — showing every venue joined together in the table's summary column is unhelpful
// noise, and the specific venue for any one match is already shown correctly when the row is
// expanded (schedule panel) or in Tab 1. Collapse the summary to a count + tooltip instead.
function formatVenueCell(venue){
  if(!venue || !venue.includes("、")) return venue || "";
  const list = venue.split("、");
  return `<span class="venue-multi" title="${list.join('、')}">多個場館 (${list.length})</span>`;
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
      <td data-label="場館">${formatVenueCell(e.venue)}</td>
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

function updateStickyOffsets(){
  const topbar = $(".topbar");
  const topbarH = topbar ? topbar.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty("--topbar-h", topbarH + "px");
}
window.addEventListener("resize", updateStickyOffsets);
if(window.visualViewport) window.visualViewport.addEventListener("resize", updateStickyOffsets);

// ---------- init ----------
if (calView === "daily") {
  $$(".view-btn").forEach(b => b.classList.toggle("active", b.dataset.view === "daily"));
  $("#timeline-view").classList.remove("active");
  $("#daily-view").classList.add("active");
  $("#day-ribbon").classList.remove("is-hidden");
}

const mobSort = $("#mobile-table-sort");
if(mobSort){
  mobSort.addEventListener("change", (e)=>{
    tableSort.key = e.target.value;
    tableSort.dir = 1;
    renderTable();
  });
}

// Leaflet's own touch/gesture handling covers panning and zoom natively, so (unlike the old
// iframe embed) no tap-to-activate dance is needed to stop it from trapping page scroll.

renderDayRibbon();
$("#day-ribbon").classList.toggle("is-hidden", calView!=="daily");
renderGantt();
renderVenueList();
renderTable();
updateStickyOffsets();