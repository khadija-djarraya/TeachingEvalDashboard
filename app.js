// --- CENTRALIZED STATE ---
const state = {
  data: null,
  tab: 'inst', // 'inst' or 'fac'
  semester: null,
  
  // Institutional View State
  improveDeptFilter: 'ALL',
  trackDept: null,
  trackProg: null,
  
  // Faculty View State
  facDept: null,
  facName: null
};

const charts = {};
function destroy(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// --- UTILITIES ---
function pillClass(v) { return v < 65 ? 'bad' : (v < 75 ? 'warn' : 'good'); }
function pillHtml(v) { return v == null ? '<span class="pill">–</span>' : `<span class="pill ${pillClass(v)}">${v.toFixed(1)}%</span>`; }
function heatColor(v) {
  if (v == null) return '#1a2236';
  if (v < 60) return '#7f1d1d';
  if (v < 65) return '#b91c1c';
  if (v < 75) return '#b45309';
  if (v < 85) return '#15803d';
  return '#166534';
}
function normProg(name) { return name.trim().toUpperCase().replace(/\s*&\s*/g, '&'); }
function setHeading(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

function trendArrow(curr, prev) {
  if (prev == null || curr == null) return '<span class="trend flat">—</span>';
  const diff = curr - prev;
  if (Math.abs(diff) < 0.5) return `<span class="trend flat">▬ ${diff.toFixed(1)}</span>`;
  if (diff > 0) return `<span class="trend up">▲ +${diff.toFixed(1)}</span>`;
  return `<span class="trend down">▼ ${diff.toFixed(1)}</span>`;
}

function instAvgForSemester(sem) {
  if (!state.data || !state.data.semesters[sem]) return null;
  const depts = state.data.semesters[sem];
  const vals = Object.values(depts).map(d => d.department_avg).filter(v => v != null);
  return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
}

function normalizeInstructorName(raw) {
  let s = (raw || '').replace(/\u00A0/g, ' ').trim();
  s = s.replace(/^د\.?\s*/, '');
  s = s.replace(/^(dr|mr|mrs|ms|miss|prof|eng)\.?\s*\.?\s*/i, '');
  s = s.replace(/^[.\s]+/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function firstNameToken(raw) {
  const n = normalizeInstructorName(raw).toLowerCase();
  const first = n.split(' ')[0] || '';
  return first.replace(/[^a-z\u0600-\u06FF]/g, '');
}

function matchInstructorAcrossSemester(name, dept, targetSemester) {
  const d = state.data.semesters[targetSemester][dept];
  if (!d) return { match: null, confidence: 'none' };
  const exact = d.instructors_summary.find(x => x.name === name);
  if (exact) return { match: exact, confidence: 'exact' };
  const token = firstNameToken(name);
  if (!token) return { match: null, confidence: 'none' };
  const candidates = d.instructors_summary.filter(x => firstNameToken(x.name) === token);
  if (candidates.length === 1) return { match: candidates[0], confidence: 'fuzzy' };
  return { match: null, confidence: candidates.length > 1 ? 'ambiguous' : 'none' };
}

// --- INITIALIZATION & BINDING ---
function initApp(globalData) {
  state.data = globalData;
  state.semester = state.data.semester_order[state.data.semester_order.length - 1]; // Default to latest
  
  // Set default initial tracking states
  const allDepts = [...new Set(state.data.semester_order.flatMap(s => Object.keys(state.data.semesters[s])))];
  if (allDepts.length > 0) {
    state.trackDept = allDepts[0];
    state.facDept = allDepts[0];
  }

  bindEvents();
  populateGlobalDropdowns();
  renderApp();
}

function bindEvents() {
  document.getElementById('tab-inst').addEventListener('click', () => { state.tab = 'inst'; renderApp(); });
  document.getElementById('tab-fac').addEventListener('click', () => { state.tab = 'fac'; renderApp(); });
  
  document.getElementById('semesterPicker').addEventListener('change', (e) => {
    const newSem = e.target.value;
    
    // Safely update faculty selection before switching semester
    if (state.facDept && state.facName) {
      const matchData = matchInstructorAcrossSemester(state.facName, state.facDept, newSem);
      if (matchData.match) {
         state.facName = matchData.match.name; // Preserve via exact or fuzzy match
      } else {
         // Fallback if they aren't teaching in the new semester
         const depts = state.data.semesters[newSem];
         state.facName = (depts && depts[state.facDept] && depts[state.facDept].instructors_summary.length > 0) 
            ? depts[state.facDept].instructors_summary[0].name 
            : null;
      }
    }
    
    state.semester = newSem;
    renderApp();
  });

  document.getElementById('improveDeptFilter').addEventListener('change', (e) => { state.improveDeptFilter = e.target.value; buildImprove(); });
  document.getElementById('trackDeptPicker').addEventListener('change', (e) => { state.trackDept = e.target.value; updateTrackProgDropdown(); buildTracker(); });
  document.getElementById('trackProgramPicker').addEventListener('change', (e) => { state.trackProg = e.target.value; buildTracker(); });
  
  document.getElementById('facDeptPicker').addEventListener('change', (e) => { 
    state.facDept = e.target.value; 
    state.facName = null; // Reset instructor when department changes
    populateFacNameDropdown();
    renderFaculty(); 
  });
  document.getElementById('facultyPicker').addEventListener('change', (e) => { 
    state.facName = e.target.value; 
    renderFaculty(); 
  });
}

function populateGlobalDropdowns() {
  const semPicker = document.getElementById('semesterPicker');
  semPicker.innerHTML = state.data.semester_order.map(s => `<option value="${s}">${s}</option>`).join('');
  semPicker.value = state.semester;

  const allDepts = [...new Set(state.data.semester_order.flatMap(s => Object.keys(state.data.semesters[s])))];
  
  const trackDeptPicker = document.getElementById('trackDeptPicker');
  trackDeptPicker.innerHTML = allDepts.map(d => `<option value="${d}">${d}</option>`).join('');
  trackDeptPicker.value = state.trackDept;
  
  const facDeptPicker = document.getElementById('facDeptPicker');
  facDeptPicker.innerHTML = allDepts.map(d => `<option value="${d}">${d}</option>`).join('');
  facDeptPicker.value = state.facDept;
  
  updateTrackProgDropdown();
}

// --- RENDER CONTROLLER ---
function renderApp() {
  // Toggle UI Tabs
  document.getElementById('view-inst').style.display = state.tab === 'inst' ? '' : 'none';
  document.getElementById('view-fac').style.display = state.tab === 'fac' ? '' : 'none';
  document.getElementById('tab-inst').classList.toggle('active', state.tab === 'inst');
  document.getElementById('tab-fac').classList.toggle('active', state.tab === 'fac');

  if (state.tab === 'inst') {
    buildInstitutional();
    buildDeptTrend();
    updateTrackProgDropdown();
    buildTracker();
  } else {
    populateFacNameDropdown();
    renderFaculty();
  }
}

// --- INSTITUTIONAL RENDERERS ---
function buildInstitutional() {
  const sem = state.semester;
  buildExecSummary(sem);
  buildInstCards(sem);
  buildHeatmap(sem);
  buildInstTrendChart();
  buildDeptChart(sem);
  buildProgTable(sem);
  buildImprove(sem);
  buildFacDist(sem);
}

function buildExecSummary(sem) {
  const idx = state.data.semester_order.indexOf(sem);
  const prevSem = idx > 0 ? state.data.semester_order[idx - 1] : null;
  const instAvg = instAvgForSemester(sem);
  const prevInstAvg = prevSem ? instAvgForSemester(prevSem) : null;
  const depts = state.data.semesters[sem];
  
  const deptEntries = Object.entries(depts).map(([name, d]) => ({ name, avg: d.department_avg }));
  deptEntries.sort((a, b) => (b.avg || 0) - (a.avg || 0));
  const best = deptEntries[0], worst = deptEntries[deptEntries.length - 1];

  const domTotals = { AA: [], CK: [], PV: [] };
  Object.values(depts).forEach(d => d.programs_summary.forEach(p => {
    if (p.AA != null) domTotals.AA.push(p.AA);
    if (p.CK != null) domTotals.CK.push(p.CK);
    if (p.PV != null) domTotals.PV.push(p.PV);
  }));
  
  const domAvg = k => domTotals[k].length ? domTotals[k].reduce((a, b) => a + b, 0) / domTotals[k].length : null;
  const domScores = { AA: domAvg('AA'), CK: domAvg('CK'), PV: domAvg('PV') };
  const weakestDom = Object.entries(domScores).sort((a, b) => a[1] - b[1])[0];

  let improveCount = 0, facCount = 0;
  Object.values(depts).forEach(d => {
    facCount += d.instructors_summary.length;
    d.instructors_summary.forEach(f => { if (f.overall < 65) improveCount++; });
    Object.values(d.instructors).forEach(inst => inst.questions.forEach(q => { if (q.avg < 65) improveCount++; }));
  });

  const trendTxt = prevInstAvg != null ? (instAvg > prevInstAvg ? `up ${(instAvg - prevInstAvg).toFixed(1)} pts from ${prevSem}` : instAvg < prevInstAvg ? `down ${(prevInstAvg - instAvg).toFixed(1)} pts from ${prevSem}` : `flat vs ${prevSem}`) : 'no prior semester to compare';

  document.getElementById('execSummary').innerHTML = `
    <b>${sem} summary:</b> institutional average is <b>${instAvg}%</b> (${trendTxt}).
    <b>${best.name}</b> leads departments at ${best.avg}%, while <b>${worst.name}</b> trails at ${worst.avg}%.
    Institution-wide, <b>${weakestDom[0]}</b> (${weakestDom[1].toFixed(1)}%) is the weakest UKPSF domain — worth prioritizing in faculty development this term.
    Across ${facCount} evaluated faculty, <b>${improveCount}</b> items (faculty, program, or question-level) currently fall below the 65% improvement threshold.
  `;
}

function buildInstCards(sem) {
  const idx = state.data.semester_order.indexOf(sem);
  const prevSem = idx > 0 ? state.data.semester_order[idx - 1] : null;
  const instAvg = instAvgForSemester(sem);
  const prevInstAvg = prevSem ? instAvgForSemester(prevSem) : null;
  const depts = state.data.semesters[sem];
  
  let facCount = 0, progCount = 0, improveCount = 0;
  Object.values(depts).forEach(d => {
    facCount += d.instructors_summary.length;
    progCount += d.programs_summary.length;
    d.instructors_summary.forEach(f => { if (f.overall < 65) improveCount++; });
    Object.values(d.instructors).forEach(inst => inst.questions.forEach(q => { if (q.avg < 65) improveCount++; }));
  });
  
  document.getElementById('instCards').innerHTML = `
    <div class="card"><div class="label">Institutional Average</div><div class="value">${instAvg}% ${trendArrow(instAvg, prevInstAvg)}</div></div>
    <div class="card"><div class="label">Departments</div><div class="value">${Object.keys(depts).length}</div></div>
    <div class="card"><div class="label">Programs Tracked</div><div class="value">${progCount}</div></div>
    <div class="card"><div class="label">Faculty Evaluated</div><div class="value">${facCount}</div></div>
    <div class="card"><div class="label">Items Below 65%</div><div class="value" style="color:var(--bad)">${improveCount}</div></div>
  `;
}

function buildHeatmap(sem) {
  const depts = state.data.semesters[sem];
  const deptNames = Object.keys(depts);
  let html = '<thead><tr><th>Department</th><th>AA</th><th>CK</th><th>PV</th><th>Overall</th></tr></thead><tbody>';
  
  deptNames.forEach(dn => {
    const d = depts[dn];
    const progs = d.programs_summary;
    const avg = k => { const v = progs.map(p => p[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const AA = avg('AA'), CK = avg('CK'), PV = avg('PV');
    html += `<tr><td style="text-align:left;font-weight:700;">${dn}</td>
      <td style="background:${heatColor(AA)}">${AA ? AA.toFixed(1) : '–'}</td>
      <td style="background:${heatColor(CK)}">${CK ? CK.toFixed(1) : '–'}</td>
      <td style="background:${heatColor(PV)}">${PV ? PV.toFixed(1) : '–'}</td>
      <td style="background:${heatColor(d.department_avg)}">${d.department_avg ?? '–'}</td></tr>`;
  });
  
  html += '</tbody>';
  document.getElementById('heatTable').innerHTML = html;
}

function buildInstTrendChart() {
  const labels = state.data.semester_order;
  const data = labels.map(s => instAvgForSemester(s));
  destroy('instTrend');
  charts.instTrend = new Chart(document.getElementById('instTrendChart'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Institutional Avg', data, borderColor: '#CF152D', backgroundColor: 'rgba(207,21,45,.12)', fill: true, tension: .3, pointRadius: 5 }] },
    options: { scales: { y: { min: 50, max: 100, ticks: { color: '#6b7280' } }, x: { ticks: { color: '#6b7280' } } }, plugins: { legend: { display: false } } }
  });
}

function buildDeptChart(sem) {
  const idx = state.data.semester_order.indexOf(sem);
  const prevSem = idx > 0 ? state.data.semester_order[idx - 1] : null;
  const depts = state.data.semesters[sem];
  const names = Object.keys(depts);
  const vals = names.map(n => depts[n].department_avg);
  const prevVals = names.map(n => prevSem && state.data.semesters[prevSem][n] ? state.data.semesters[prevSem][n].department_avg : null);
  
  destroy('deptC');
  charts.deptC = new Chart(document.getElementById('deptChart'), {
    type: 'bar',
    data: {
      labels: names, datasets: [
        ...(prevSem ? [{ label: prevSem, data: prevVals, backgroundColor: '#c9ccd1' }] : []),
        { label: sem, data: vals, backgroundColor: '#CF152D' }
      ]
    },
    options: { scales: { y: { min: 0, max: 100, ticks: { color: '#6b7280' } }, x: { ticks: { color: '#6b7280' } } }, plugins: { legend: { labels: { color: '#1c1f26' } } } }
  });
  document.getElementById('interdeptDesc').innerHTML = `Overall average by department, ${sem}${prevSem ? ` vs ${prevSem}` : ''}.`;
  setHeading('h2-interdept', `Interdepartmental Comparison — ${sem}`);
}

function buildDeptTrend() {
  const allDepts = [...new Set(state.data.semester_order.flatMap(s => Object.keys(state.data.semesters[s])))];
  const palette = ['#CF152D', '#374151', '#c2760a', '#1a8f4c', '#6b21a8', '#0369a1'];
  const datasets = allDepts.map((dept, i) => ({
    label: dept,
    data: state.data.semester_order.map(s => state.data.semesters[s][dept] ? state.data.semesters[s][dept].department_avg : null),
    borderColor: palette[i % palette.length],
    backgroundColor: 'transparent',
    tension: .3,
    pointRadius: 5,
    spanGaps: true,
  }));
  destroy('deptTrend');
  charts.deptTrend = new Chart(document.getElementById('deptTrendChart'), {
    type: 'line',
    data: { labels: state.data.semester_order, datasets },
    options: { animation: false, scales: { y: { min: 50, max: 100, ticks: { color: '#6b7280' } }, x: { ticks: { color: '#6b7280' } } }, plugins: { legend: { labels: { color: '#1c1f26' } } } }
  });
}

function buildProgTable(sem) {
  const idx = state.data.semester_order.indexOf(sem);
  const prevSem = idx > 0 ? state.data.semester_order[idx - 1] : null;
  const depts = state.data.semesters[sem];
  let rows = [];
  
  Object.entries(depts).forEach(([dn, d]) => {
    d.programs_summary.forEach(p => {
      let prevVal = null;
      if (prevSem && state.data.semesters[prevSem][dn]) {
        const match = state.data.semesters[prevSem][dn].programs_summary.find(pp => normProg(pp.name) === normProg(p.name));
        if (match) prevVal = match.overall;
      }
      rows.push({ dept: dn, ...p, prevVal });
    });
  });
  
  rows.sort((a, b) => b.overall - a.overall);
  document.querySelector('#progTable tbody').innerHTML = rows.map(p => `
    <tr><td>${p.dept}</td><td>${p.name}</td><td>${pillHtml(p.overall)}</td>
    <td>${p.AA != null ? p.AA.toFixed(1) : '–'}</td><td>${p.CK != null ? p.CK.toFixed(1) : '–'}</td><td>${p.PV != null ? p.PV.toFixed(1) : '–'}</td>
    <td>${trendArrow(p.overall, p.prevVal)}</td>
    <td>${p.overall < 65 ? '<span class="pill bad">Needs Improvement</span>' : '<span class="pill good">On Track</span>'}</td></tr>`).join('');
  setHeading('h2-progrank', `Program Ranking — ${sem}`);
}

function buildImprove() {
  const sem = state.semester;
  const depts = state.data.semesters[sem];
  const filt = document.getElementById('improveDeptFilter');
  
  filt.innerHTML = '<option value="ALL">All Departments</option>' + Object.keys(depts).map(d => `<option value="${d}">${d}</option>`).join('');
  if (state.improveDeptFilter && [...filt.options].some(o => o.value === state.improveDeptFilter)) {
    filt.value = state.improveDeptFilter;
  }
  
  const chosen = state.improveDeptFilter || 'ALL';
  let items = [];
  
  Object.entries(depts).forEach(([dn, d]) => {
    if (chosen !== 'ALL' && dn !== chosen) return;
    d.instructors_summary.forEach(f => { if (f.overall < 65) items.push({ type: 'Faculty overall', name: `${f.name} (${dn})`, value: f.overall }); });
    d.programs_summary.forEach(p => { if (p.overall < 65) items.push({ type: 'Program overall', name: `${p.name} (${dn})`, value: p.overall }); });
    Object.entries(d.instructors).forEach(([name, inst]) => {
      inst.questions.forEach(q => { if (q.avg < 65) items.push({ type: 'Survey Item', name: `${name} (${dn}) — ${q.category}${q.subcode} Q${q.seq}`, detail: q.text, value: q.avg }); });
    });
  });
  
  items.sort((a, b) => a.value - b.value);
  document.getElementById('improveList').innerHTML = items.slice(0, 40).map(it => `
    <div class="improve-item"><div><strong>[${it.type}]</strong> ${it.name} — ${pillHtml(it.value)}</div>${it.detail ? `<div class="meta rtl">${it.detail}</div>` : ''}</div>
  `).join('') + (items.length > 40 ? `<div class="note">…and ${items.length - 40} more (${items.length} total).</div>` : '') + (items.length === 0 ? '<div class="note">Nothing below 65% for this filter. 🎉</div>' : '');
}

function updateTrackProgDropdown() {
  const dept = state.trackDept;
  const progNames = new Set();
  
  state.data.semester_order.forEach(s => {
    const de = state.data.semesters[s][dept];
    if (de) de.programs_summary.forEach(p => progNames.add(p.name));
  });
  
  const ppk = document.getElementById('trackProgramPicker');
  ppk.innerHTML = [...progNames].map(n => `<option value="${n}">${n}</option>`).join('');
  
  if (state.trackProg && progNames.has(state.trackProg)) {
    ppk.value = state.trackProg;
  } else {
    state.trackProg = [...progNames][0];
    ppk.value = state.trackProg;
  }
}

function buildTracker() {
  const dept = state.trackDept;
  const prog = state.trackProg;
  if (!dept || !prog) return;

  function programEntry(d, p, s) {
    const de = state.data.semesters[s][d];
    if (!de) return null;
    return de.programs.hasOwnProperty(p) ? de.programs[p] : Object.entries(de.programs).find(([n]) => normProg(n) === normProg(p))?.[1] || null;
  }

  let firstSem = null, lastSem = null;
  state.data.semester_order.forEach(s => {
    if (programEntry(dept, prog, s)) { if (firstSem === null) firstSem = s; lastSem = s; }
  });

  const descEl = document.getElementById('moversDesc');
  if (!firstSem || firstSem === lastSem) {
    descEl.textContent = `Only one semester of data found for ${dept} / ${prog} under this name — need at least two semesters to compare movement.`;
    destroy('track');
    return;
  }
  
  descEl.textContent = `Comparing ${dept} / ${prog}'s survey item averages between ${firstSem} and ${lastSem}.`;

  const firstP = programEntry(dept, prog, firstSem);
  const lastP = programEntry(dept, prog, lastSem);
  
  const movers = state.data.question_reference.map(qref => {
    const qFirst = firstP.questions.find(x => x.seq === qref.seq);
    const qLast = lastP.questions.find(x => x.seq === qref.seq);
    if (!qFirst || !qLast) return null;
    return {
      label: `${qref.category}${qref.subcode} (Q${qref.seq})`,
      text: qref.text,
      first: qFirst.avg,
      last: qLast.avg,
      delta: +(qLast.avg - qFirst.avg).toFixed(1),
    };
  }).filter(Boolean).sort((a, b) => b.delta - a.delta);

  destroy('track');
  charts.track = new Chart(document.getElementById('trackChart'), {
    type: 'bar',
    data: {
      labels: movers.map(m => m.label),
      datasets: [{
        label: `Change: ${firstSem} → ${lastSem}`,
        data: movers.map(m => m.delta),
        backgroundColor: movers.map(m => m.delta >= 0 ? '#1a8f4c' : '#CF152D'),
      }]
    },
    options: {
      indexAxis: 'y',
      scales: { x: { ticks: { color: '#6b7280' } }, y: { ticks: { color: '#1c1f26', font: { size: 11 } } } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const m = movers[ctx.dataIndex];
              return [`${firstSem}: ${m.first.toFixed(1)}%  →  ${lastSem}: ${m.last.toFixed(1)}%`, m.text];
            }
          }
        }
      }
    }
  });
}

function buildFacDist(sem) {
  const depts = state.data.semesters[sem];
  const buckets = [0, 0, 0, 0, 0];
  
  Object.values(depts).forEach(d => d.instructors_summary.forEach(f => {
    const v = f.overall;
    if (v < 60) buckets[0]++; else if (v < 65) buckets[1]++; else if (v < 75) buckets[2]++; else if (v < 85) buckets[3]++; else buckets[4]++;
  }));
  
  destroy('facDist');
  charts.facDist = new Chart(document.getElementById('facDist'), {
    type: 'bar',
    data: { labels: ['<60', '60–65', '65–75', '75–85', '85+'], datasets: [{ label: 'Faculty count', data: buckets, backgroundColor: ['#9E0F21', '#CF152D', '#c2760a', '#6b7280', '#1a8f4c'] }] },
    options: { scales: { y: { beginAtZero: true, ticks: { color: '#6b7280' } }, x: { ticks: { color: '#6b7280' } } }, plugins: { legend: { display: false } } }
  });
  setHeading('h2-facdist', `Faculty Score Distribution — ${sem}`);
}


// --- FACULTY RENDERERS ---
function populateFacNameDropdown() {
  const sem = state.semester;
  const dept = state.facDept;
  const de = state.data.semesters[sem][dept];
  const fp = document.getElementById('facultyPicker');
  
  if (!de || de.instructors_summary.length === 0) { 
    fp.innerHTML = '<option>No faculty for this selection</option>'; 
    state.facName = null; 
    return; 
  }
  
  fp.innerHTML = de.instructors_summary.map(f => `<option value="${f.name}">${f.name} (${f.overall.toFixed(1)}%)</option>`).join('');
  
  // Set the dropdown to match state.facName if it exists, otherwise default to first entry
  if (state.facName && de.instructors_summary.some(f => f.name === state.facName)) {
    fp.value = state.facName;
  } else {
    state.facName = de.instructors_summary[0].name;
    fp.value = state.facName;
  }
}

function renderFaculty() {
  if (!state.facName) {
    document.getElementById('facCards').innerHTML = '<div class="note">Please select a valid faculty member.</div>';
    destroy('radar');
    destroy('facTrend');
    destroy('facCourseChart');
    document.getElementById('facQTable').querySelector('tbody').innerHTML = '';
    document.getElementById('facImprove').innerHTML = '';
    return;
  }

  const sem = state.semester;
  const dept = state.facDept;
  const de = state.data.semesters[sem][dept];
  const name = state.facName;
  const summary = de.instructors_summary.find(f => f.name === name);
  
  if (!summary) return;
  const detail = de.instructors[name];

  document.getElementById('facCards').innerHTML = `
    <div class="card"><div class="label">Overall Score</div><div class="value">${pillHtml(summary.overall)}</div></div>
    <div class="card"><div class="label">Areas of Activity (AA)</div><div class="value">${summary.AA != null ? summary.AA.toFixed(1) : '–'}%</div></div>
    <div class="card"><div class="label">Core Knowledge (CK)</div><div class="value">${summary.CK != null ? summary.CK.toFixed(1) : '–'}%</div></div>
    <div class="card"><div class="label">Professional Values (PV)</div><div class="value">${summary.PV != null ? summary.PV.toFixed(1) : '–'}%</div></div>
    <div class="card"><div class="label">Courses Taught</div><div class="value">${summary.courses ? summary.courses.length : 0}</div></div>
  `;

  destroy('radar');
  charts.radar = new Chart(document.getElementById('facRadar'), {
    type: 'radar',
    data: { labels: ['AA', 'CK', 'PV'], datasets: [{ label: name, data: [summary.AA, summary.CK, summary.PV], backgroundColor: 'rgba(207,21,45,.15)', borderColor: '#CF152D', pointBackgroundColor: '#CF152D' }] },
    options: { scales: { r: { min: 0, max: 100, angleLines: { color: '#e4e2e2' }, grid: { color: '#e4e2e2' }, pointLabels: { color: '#1c1f26' }, ticks: { color: '#6b7280', backdropColor: 'transparent' } } }, plugins: { legend: { labels: { color: '#1c1f26' } } } }
  });

  const matchResults = state.data.semester_order.map(s => matchInstructorAcrossSemester(name, dept, s));
  const trendData = matchResults.map(r => r.match ? r.match.overall : null);
  const matchedCount = matchResults.filter(r => r.match).length;

  destroy('facTrend');
  const pointRadii = trendData.map(v => v == null ? 0 : (matchedCount <= 1 ? 9 : 6));
  charts.facTrend = new Chart(document.getElementById('facTrendChart'), {
    type: 'line',
    data: { labels: state.data.semester_order, datasets: [{ label: name, data: trendData, borderColor: '#374151', backgroundColor: 'rgba(55,65,81,.10)', fill: true, tension: .3, pointRadius: pointRadii, pointHoverRadius: pointRadii.map(r => r ? 9 : 0), spanGaps: true }] },
    options: { animation: false, scales: { y: { min: 0, max: 100, ticks: { color: '#6b7280' } }, x: { ticks: { color: '#6b7280' } } }, plugins: { legend: { labels: { color: '#1c1f26' } } } }
  });

  const noteEl = document.getElementById('facTrendNote');
  if (matchedCount < state.data.semester_order.length) {
    noteEl.innerHTML = `Instructor data available for ${matchedCount} out of ${state.data.semester_order.length} semesters.`;
  } else {
    noteEl.innerHTML = '';
  }

  // Course Chart
  setHeading('h2-coursescore', `Per-Course Overall Score — ${sem}`);
  if (summary.courses && summary.courses.length > 0) {
    destroy('facCourseChart');
    charts.facCourseChart = new Chart(document.getElementById('facCourseChart'), {
      type: 'bar',
      data: {
        labels: summary.courses.map(c => c.name || 'Unknown Course'),
        datasets: [{ label: 'Course Score', data: summary.courses.map(c => c.overall), backgroundColor: '#CF152D' }]
      },
      options: { scales: { y: { min: 0, max: 100 } } }
    });
  }

  // Full Question Table
  setHeading('h2-qreport', `Full Question-Level Report (UKPSF-mapped) — ${sem}`);
  if (detail && detail.questions) {
    const qRows = detail.questions.map(q => `
      <tr>
        <td style="text-align:left;direction:ltr;">${q.category || ''}${q.subcode || ''} (Q${q.seq})</td>
        <td style="text-align:left;direction:ltr;">${pillHtml(q.avg)}</td>
        <td>${q.text || ''}</td>
      </tr>
    `).join('');
    document.querySelector('#facQTable tbody').innerHTML = qRows;
    
    // Areas of Improvement
    setHeading('h2-facimprove', `⚠️ This Faculty Member's Improvement Areas (<65%) — ${sem}`);
    const badQ = detail.questions.filter(q => q.avg < 65);
    const improveEl = document.getElementById('facImprove');
    if (badQ.length > 0) {
      improveEl.innerHTML = badQ.map(q => `
        <div class="improve-item">
          <div><strong>[Survey Item]</strong> ${q.category}${q.subcode} Q${q.seq} — ${pillHtml(q.avg)}</div>
          <div class="meta rtl">${q.text}</div>
        </div>
      `).join('');
    } else {
      improveEl.innerHTML = '<div class="note">No improvement areas below 65%. Excellent! 🎉</div>';
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const summary = document.getElementById('execSummary');
  try {
    const response = await fetch('teaching_evaluation_consolidated.json');
    if (!response.ok) throw new Error(`Data request failed (${response.status})`);
    initApp(await response.json());
  } catch (error) {
    console.error('Unable to load teaching evaluation data:', error);
    summary.textContent = 'Unable to load dashboard data. Please open this page through a local web server.';
  }
});