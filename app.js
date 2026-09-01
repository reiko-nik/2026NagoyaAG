// ---------- helpers ----------
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
const toDate = s => new Date(s + "T00:00:00");
const fmtShort = d => `${d.getMonth()+1}/${d.getDate()}`;
const WEEKDAY = ["日","一","二","三","四","五","六"];

function mapEmbedUrl(query){ return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`; }
function mapExternalUrl(e){ return e.mapLinkOverride || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.mapQuery)}`; }

const GAMES_START = toDate(EVENTS.reduce((m,e)=> e.start<m?e.start:m, EVENTS[0].start));
const GAMES_END   = toDate(EVENTS.reduce((m,e)=> e.end>m?e.end:m, EVENTS[0].end));
const TOTAL_DAYS = Math.round((GAMES_END-GAMES_START)/86400000)+1;
const dayIndex = s => Math.round((toDate(s)-GAMES_START)/86400000);

// ---------- tabs ----------
$$(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    $$(".tab-btn").forEach(b=>b.classList.remove("active"));
    $$(".tab-panel").forEach(p=>p.classList.remove("active"));
    btn.classList.add("active");
    $("#tab-"+btn.dataset.tab).classList.add("active");
  });
});

// ---------- modal ----------
function openModal(e, venues){
  const dateStr = e.start===e.end ? e.start : `${e.start} – ${e.end}`;
  $("#modal-body").innerHTML = `
    <h3>${e.event}</h3>
    <div class="m-sub">${e.sport}${e.hkg?' · <span style="color:#ff8fa0">香港代表隊參與</span>':''}</div>
    <div class="m-row"><span>日期</span><span>${dateStr}</span></div>
    <div class="m-row"><span>場館</span><span>${venues ? venues.join('、') : e.venue}</span></div>
    <div class="m-row"><span>地址</span><span>${e.address||''}</span></div>
    <a class="m-link" href="${mapExternalUrl(e)}" target="_blank" rel="noopener">在 Google 地圖開啟 ↗</a>
  `;
  $("#modal-backdrop").classList.add("open");
}
$("#modal-close").addEventListener("click", ()=> $("#modal-backdrop").classList.remove("open"));
$("#modal-backdrop").addEventListener("click", ev=>{ if(ev.target.id==="modal-backdrop") $("#modal-backdrop").classList.remove("open"); });

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
function dateStrForIdx(i){ return new Date(GAMES_START.getTime()+i*86400000).toISOString().slice(0,10); }

$$(".view-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    calView = btn.dataset.view;
    $$(".view-btn").forEach(b=>b.classList.toggle("active", b===btn));
    $("#timeline-view").classList.toggle("active", calView==="timeline");
    $("#daily-view").classList.toggle("active", calView==="daily");
    if(calView==="daily") renderDailyView();
    markSelectedDayChip();
  });
});

function renderDayRibbon(){
  const ribbon = $("#day-ribbon");
  ribbon.innerHTML = "";
  for(let i=0;i<TOTAL_DAYS;i++){
    const d = new Date(GAMES_START.getTime()+i*86400000);
    const dateStr = d.toISOString().slice(0,10);
    const hasHkg = EVENTS.some(e=> e.hkg && dateStr>=e.start && dateStr<=e.end);
    const chip = document.createElement("div");
    chip.className = "day-chip" + (hasHkg?" has-hkg":"");
    chip.dataset.idx = i;
    chip.innerHTML = `<div class="dnum">${d.getDate()}</div><div class="dlabel">${fmtShort(d)}(${WEEKDAY[d.getDay()]})</div><div class="ddot"></div>`;
    chip.title = hasHkg ? "有香港代表隊項目" : "";
    chip.addEventListener("click", ()=>{
      selectedDayIdx = i;
      markSelectedDayChip();
      if(calView==="daily") renderDailyView();
      else scrollGanttToDay(i);
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
  const bySport = {};
  const order = [];
  EVENTS.forEach(e=>{
    if(!bySport[e.sport]){ bySport[e.sport] = { hkg:false, bars:{} }; order.push(e.sport); }
    const g = bySport[e.sport];
    if(e.hkg) g.hkg = true;
    const key = e.event+"|"+e.start+"|"+e.end;
    if(!g.bars[key]) g.bars[key] = { event:e.event, start:e.start, end:e.end, hkg:e.hkg, venues:[], sport:e.sport, address:e.address, mapQuery:e.mapQuery, mapLinkOverride:e.mapLinkOverride };
    g.bars[key].venues.push(e.venue);
  });
  return { bySport, order };
}

function renderGantt(){
  const { bySport, order } = groupForGantt();
  const gantt = $("#gantt");
  gantt.innerHTML = "";
  order.forEach(sport=>{
    const g = bySport[sport];
    const row = document.createElement("div");
    row.className = "gantt-row";
    row.dataset.sport = sport;
    row.dataset.hkg = g.hkg;

    const label = document.createElement("div");
    label.className = "gantt-label";
    label.textContent = sport;
    row.appendChild(label);

    const track = document.createElement("div");
    track.className = "gantt-track";
    for(let i=0;i<TOTAL_DAYS;i++){ const c=document.createElement("div"); c.className="gridcol"; track.appendChild(c); }

    Object.values(g.bars).forEach(bar=>{
      const s = dayIndex(bar.start), e = dayIndex(bar.end);
      const left = (s/TOTAL_DAYS*100).toFixed(3);
      const width = (((e-s+1)/TOTAL_DAYS)*100).toFixed(3);
      const el = document.createElement("div");
      el.className = "gantt-bar" + (bar.hkg?" hkg":"");
      el.style.left = left+"%";
      el.style.width = width+"%";
      el.textContent = bar.event + (bar.venues.length>1?` ×${bar.venues.length}`:"");
      el.title = `${bar.event} · ${bar.venues.join('、')} · ${bar.start}–${bar.end}`;
      el.addEventListener("click", ()=> openModal({sport, event:bar.event, start:bar.start, end:bar.end, hkg:bar.hkg, venue:bar.venues[0], address:bar.address, mapQuery:bar.mapQuery, mapLinkOverride:bar.mapLinkOverride}, bar.venues));
      track.appendChild(el);
    });

    row.appendChild(track);
    gantt.appendChild(row);
  });
  applyGanttFilters();
}

function applyGanttFilters(){
  const q = $("#cal-search").value.trim().toLowerCase();
  const hkgOnly = $("#cal-hkg-only").checked;
  $$(".gantt-row").forEach(row=>{
    const matchesQ = !q || row.dataset.sport.toLowerCase().includes(q) || $$(".gantt-bar", row).some(b=>b.textContent.toLowerCase().includes(q));
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

  let todays = EVENTS.filter(e => dateStr>=e.start && dateStr<=e.end);
  if(q) todays = todays.filter(e => (e.sport+e.event+e.venue).toLowerCase().includes(q));
  if(hkgOnly) todays = todays.filter(e=>e.hkg);
  todays.sort((a,b)=> (b.hkg-a.hkg) || a.sport.localeCompare(b.sport,'zh-Hant'));

  const list = $("#daily-list");
  if(!todays.length){
    list.innerHTML = `<div class="daily-empty">此日沒有符合篩選條件的賽事</div>`;
    return;
  }
  list.innerHTML = todays.map(e=>{
    const dayOf = Math.round((toDate(e.end)-toDate(e.start))/86400000)+1;
    const dayN = Math.round((toDate(dateStr)-toDate(e.start))/86400000)+1;
    return `<div class="daily-card${e.hkg?' hkg':''}" data-id="${e.id}">
      <div class="dc-main">
        <div class="dc-sport">${e.sport}</div>
        <div class="dc-event">${e.event}</div>
        <div class="dc-venue">📍 ${e.venue}</div>
        ${dayOf>1 ? `<div class="dc-day-of">比賽第 ${dayN} / ${dayOf} 天</div>` : ""}
      </div>
      <div class="dc-badge">${e.hkg ? '<span class="badge-hkg">🇭🇰 HKG</span>' : ''}</div>
    </div>`;
  }).join("");

  $$(".daily-card").forEach(card=>{
    card.addEventListener("click", ()=>{
      const e = EVENTS.find(x=>x.id===Number(card.dataset.id));
      if(e) openModal(e);
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

function renderRosterPanel(roster){
  const men = roster.athletes.filter(a=>a.g==="M");
  const women = roster.athletes.filter(a=>a.g==="F");
  const list = arr => arr.map(a=>`<li><span class="ath-en">${a.en}</span><span class="ath-zh">${a.zh}</span></li>`).join("");
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
    else if(tableSort.key==="hkg"){ av=a.hkg?0:1; bv=b.hkg?0:1; }
    if(av<bv) return -1*tableSort.dir;
    if(av>bv) return 1*tableSort.dir;
    return a.start<b.start?-1:1;
  });

  const tbody = $("#table-body");
  tbody.innerHTML = rows.map(e=>{
    const dateStr = e.start===e.end ? e.start : `${e.start} – ${e.end}`;
    const roster = e.hkg ? getRoster(e.disciplineKey) : null;
    const expandable = !!(roster && roster.athletes.length);
    const isOpen = expandable && openRosterIds.has(e.id);
    const mainRow = `<tr class="event-row${expandable?' expandable':''}${isOpen?' open':''}" data-id="${e.id}">
      <td class="date-range" data-label="日期">${dateStr}</td>
      <td data-label="運動項目"><strong>${expandable?'<span class="expand-ind">'+(isOpen?'▾':'▸')+'</span>':''}${e.sport}</strong></td>
      <td data-label="分項">${e.event}</td>
      <td data-label="場館">${e.venue}</td>
      <td data-label="香港代表隊">${e.hkg ? '<span class="badge-hkg">🇭🇰 HKG</span>' : '<span class="badge-none">—</span>'}</td>
    </tr>`;
    const rosterRow = expandable
      ? `<tr class="roster-row" data-for="${e.id}"${isOpen?'':' hidden'}><td colspan="5">${renderRosterPanel(roster)}</td></tr>`
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
      const rosterRow = $(`#table-body tr.roster-row[data-for="${id}"]`);
      if(!rosterRow) return;
      const willOpen = rosterRow.hasAttribute("hidden");
      if(willOpen){ rosterRow.removeAttribute("hidden"); openRosterIds.add(id); }
      else { rosterRow.setAttribute("hidden",""); openRosterIds.delete(id); }
      tr.classList.toggle("open", willOpen);
      const ind = $(".expand-ind", tr);
      if(ind) ind.textContent = willOpen ? "▾" : "▸";
    });
  });

}

function renderUnscheduled(){
  const section = $("#unscheduled-section");
  if(!section) return;
  if(!HKG_UNSCHEDULED.length){ section.innerHTML = ""; return; }

  section.innerHTML = `
    <p class="hint">香港代表隊亦已確認參與以下項目，惟賽程表暫未提供場館/日期資料。如有代表名單，可點擊展開：</p>
    <div class="unscheduled-list">
      ${HKG_UNSCHEDULED.map(u=>{
        const roster = u.disciplineKey ? getRoster(u.disciplineKey) : null;
        const expandable = !!(roster && roster.athletes.length);
        const key = "u:"+u.sport;
        const isOpen = expandable && openRosterIds.has(key);
        return `<div class="unscheduled-item${expandable?' expandable':''}${isOpen?' open':''}" data-key="${key}">
          <div class="unscheduled-head">${expandable?'<span class="expand-ind">'+(isOpen?'▾':'▸')+'</span>':''}<span class="unscheduled-name">${u.sport}</span></div>
          ${expandable ? `<div class="unscheduled-roster"${isOpen?'':' hidden'}>${renderRosterPanel(roster)}</div>` : ""}
        </div>`;
      }).join("")}
    </div>`;

  $$(".unscheduled-item.expandable", section).forEach(item=>{
    item.addEventListener("click", ()=>{
      const key = item.dataset.key;
      const panel = $(".unscheduled-roster", item);
      if(!panel) return;
      const willOpen = panel.hasAttribute("hidden");
      if(willOpen){ panel.removeAttribute("hidden"); openRosterIds.add(key); }
      else { panel.setAttribute("hidden",""); openRosterIds.delete(key); }
      item.classList.toggle("open", willOpen);
      const ind = $(".expand-ind", item);
      if(ind) ind.textContent = willOpen ? "▾" : "▸";
    });
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

// ---------- init ----------
renderDayRibbon();
renderGantt();
renderVenueList();
renderTable();
renderUnscheduled();
