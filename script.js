/* =========================================================
   KPI Hot & Spot — lógica principal
   Dados são salvos no localStorage do navegador.
   ========================================================= */

const STORAGE_KEY = "hotspot_entries_v1";

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const COLORS = {
  navyDark:"#0B1B3B", navyMid:"#1E3E7A", gold:"#C89B3C",
  orange:"#D96B2B", blue:"#3B6FCB", slate:"#5B6478",
  border:"#E6E8EE", green:"#1E7A52", red:"#B23A3A"
};

/* ---------- Storage helpers ---------- */
function loadEntries(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw){
    try { return JSON.parse(raw); } catch(e){ /* fallthrough */ }
  }
  // First run: seed with historical data
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_ENTRIES));
  return JSON.parse(JSON.stringify(SEED_ENTRIES));
}
function saveEntries(entries){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/* ---------- Date helpers ---------- */
function todayStr(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function formatDateBR(dateStr){
  const [y,m,d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
function monthKey(dateStr){ return dateStr.slice(0,7); }
function monthLabel(mKey){
  const [y,m] = mKey.split("-");
  return MONTH_NAMES[parseInt(m,10)-1];
}

/* ---------- Aggregation ---------- */
function aggregateByMonth(entries){
  const map = {};
  entries.forEach(e => {
    const kind = e.kind || "daily"; // seed data has no "kind" -> treat as daily
    const k = kind === "month" ? e.month : monthKey(e.date);
    if (!map[k]) map[k] = { key:k, hot:0, spot:0, total:0, days:new Set(), extraDays:0 };
    map[k].hot += Number(e.hot)||0;
    map[k].spot += Number(e.spot)||0;
    map[k].total += (Number(e.hot)||0)+(Number(e.spot)||0);
    if (kind === "month"){
      map[k].extraDays += Number(e.days)||0;
    } else {
      map[k].days.add(e.date);
    }
  });
  const months = Object.values(map).sort((a,b)=>a.key.localeCompare(b.key));
  months.forEach((m,i)=>{
    m.daysCount = m.days.size + m.extraDays;
    m.avgDaily = m.daysCount ? (m.total / m.daysCount) : 0;
    m.hotShare = m.total ? (m.hot/m.total*100) : 0;
    m.mom = i===0 ? null : (months[i-1].total ? (m.total-months[i-1].total)/months[i-1].total*100 : null);
  });
  return months;
}

/* ---------- Rendering: header ---------- */
function renderHeader(months){
  const last = months[months.length-1];
  document.getElementById("updated-date").textContent =
    new Date().toLocaleDateString("pt-BR");
  if (last && last.mom !== null){
    const sign = last.mom >= 0 ? "+" : "";
    document.getElementById("growth-value").textContent =
      `${last.mom>=0?"▲":"▼"} ${sign}${last.mom.toFixed(1).replace(".", ",")}%`;
    document.getElementById("growth-value").style.color =
      last.mom >= 0 ? "#C89B3C" : "#FF8A8A";
    document.getElementById("growth-label").textContent =
      `crescimento em ${last ? monthLabel(last.key) : ""}`;
  } else {
    document.getElementById("growth-value").textContent = "—";
    document.getElementById("growth-label").textContent = "início da série";
  }
}

/* ---------- Rendering: monthly cards ---------- */
function renderMonthlyCards(months){
  const wrap = document.getElementById("monthly-cards");
  wrap.innerHTML = "";
  months.forEach((m,i)=>{
    const card = document.createElement("div");
    card.className = "month-card";
    let momHtml;
    if (m.mom === null){
      momHtml = `<div class="mom neutral">Início da série</div>`;
    } else {
      const cls = m.mom >= 0 ? "up" : "down";
      const arrow = m.mom >= 0 ? "▲" : "▼";
      const sign = m.mom >= 0 ? "+" : "";
      momHtml = `<div class="mom ${cls}">Var. vs mês anterior: ${arrow} ${sign}${m.mom.toFixed(1).replace(".",",")}%</div>`;
    }
    card.innerHTML = `
      <div class="month-name">${monthLabel(m.key).toUpperCase()}</div>
      <div class="month-total">${m.total.toLocaleString("pt-BR")}</div>
      <div class="month-total-label">total geral de inserções</div>
      <div class="breakdown">
        <span><i class="dot dot-hot"></i>Hot&nbsp;<b>${m.hot}</b></span>
        <span><i class="dot dot-spot"></i>Spot&nbsp;<b>${m.spot}</b></span>
      </div>
      ${momHtml}
    `;
    wrap.appendChild(card);
  });
}

/* ---------- Rendering: today counter ---------- */
let todayChartInstance = null;
function renderToday(entries){
  const t = todayStr();
  document.getElementById("today-date").textContent = new Date().toLocaleDateString("pt-BR");
  const todays = entries.filter(e => (e.kind||"daily") === "daily" && e.date === t);
  const hot = todays.reduce((s,e)=>s+(Number(e.hot)||0),0);
  const spot = todays.reduce((s,e)=>s+(Number(e.spot)||0),0);
  const total = hot+spot;

  document.getElementById("today-total").textContent = total.toLocaleString("pt-BR");
  document.getElementById("today-hot").textContent = hot;
  document.getElementById("today-spot").textContent = spot;

  const ctx = document.getElementById("todayChart").getContext("2d");
  if (todayChartInstance) todayChartInstance.destroy();
  todayChartInstance = new Chart(ctx, {
    type:"doughnut",
    data:{
      labels: ["Hot","Spot"],
      datasets:[{
        data:[hot,spot],
        backgroundColor:[COLORS.orange, COLORS.navyMid],
        borderWidth:0
      }]
    },
    options:{
      cutout:"68%",
      plugins:{
        legend:{display:false},
        tooltip:{enabled:true},
        datalabels:{display:false}
      }
    }
  });
}

/* ---------- Custom plugin: total label above stacked bars ---------- */
function totalLabelsPlugin(){
  return {
    id: "totalLabelsPlugin",
    afterDatasetsDraw(chart, args, opts){
      const totals = (opts && opts.totals) || [];
      if (!totals.length) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "bold 12px Arial";
      ctx.fillStyle = (opts && opts.color) || COLORS.navyDark;
      ctx.textAlign = "center";
      const n = chart.data.labels.length;
      for (let i=0; i<n; i++){
        let topY = Infinity;
        chart.data.datasets.forEach((ds, dsIndex)=>{
          const meta = chart.getDatasetMeta(dsIndex);
          if (meta.hidden) return;
          const el = meta.data[i];
          if (el && el.y < topY) topY = el.y;
        });
        if (topY === Infinity) continue;
        const xPos = chart.getDatasetMeta(0).data[i].x;
        const label = totals[i];
        if (label === undefined || label === null) continue;
        ctx.fillText(label, xPos, topY - 8);
      }
      ctx.restore();
    }
  };
}

/* ---------- Rendering: charts ---------- */
let charts = {};
function destroyChart(key){ if (charts[key]) { charts[key].destroy(); charts[key]=null; } }

function renderCharts(months){
  const labels = months.map(m=>monthLabel(m.key));
  const fmt = n => n.toLocaleString("pt-BR");
  const momLabels = months.map(m => m.mom===null ? "—" :
    `${m.mom>=0?"+":""}${(Math.round(m.mom*10)/10).toString().replace(".",",")}%`);

  // Total geral por mês (stacked bar, valores dentro das colunas + total no topo)
  destroyChart("totalMes");
  charts.totalMes = new Chart(document.getElementById("totalMesChart"), {
    type:"bar",
    plugins:[totalLabelsPlugin()],
    data:{
      labels,
      datasets:[
        { label:"Hot", data:months.map(m=>m.hot), backgroundColor:COLORS.orange, stack:"s",
          datalabels:{ color:"#fff", font:{weight:"bold", size:11},
            formatter:v=> v>0 ? fmt(v) : "" } },
        { label:"Spot", data:months.map(m=>m.spot), backgroundColor:COLORS.navyMid, stack:"s",
          datalabels:{ color:"#fff", font:{weight:"bold", size:11},
            formatter:v=> v>0 ? fmt(v) : "" } }
      ]
    },
    options:{
      responsive:true,
      layout:{ padding:{ top:22 } },
      plugins:{
        legend:{ position:"top", align:"end", labels:{ boxWidth:10, font:{size:11} } },
        totalLabelsPlugin:{ totals: months.map(m=>fmt(m.total)), color:COLORS.navyDark },
        datalabels:{ anchor:"center", align:"center" }
      },
      scales:{
        x:{ grid:{ display:false } },
        y:{ grid:{ color:COLORS.border }, beginAtZero:true }
      }
    }
  });

  // Média diária (valor acima de cada coluna)
  destroyChart("mediaDiaria");
  charts.mediaDiaria = new Chart(document.getElementById("mediaDiariaChart"), {
    type:"bar",
    data:{
      labels,
      datasets:[{ label:"Média diária", data:months.map(m=>Math.round(m.avgDaily*10)/10),
        backgroundColor:COLORS.navyMid,
        datalabels:{
          anchor:"end", align:"end", color:COLORS.navyDark, font:{weight:"bold", size:11},
          formatter:v=> v.toLocaleString("pt-BR",{minimumFractionDigits:1, maximumFractionDigits:1})
        } }]
    },
    options:{
      responsive:true,
      layout:{ padding:{ top:18 } },
      plugins:{ legend:{ display:false } },
      scales:{ x:{ grid:{ display:false } }, y:{ grid:{ color:COLORS.border }, beginAtZero:true } }
    }
  });

  // Participação Hot (valor acima de cada ponto)
  destroyChart("participacao");
  charts.participacao = new Chart(document.getElementById("participacaoChart"), {
    type:"line",
    data:{
      labels,
      datasets:[{
        label:"% Hot",
        data:months.map(m=>Math.round(m.hotShare*10)/10),
        borderColor:COLORS.orange,
        backgroundColor:"rgba(217,107,43,0.12)",
        fill:true,
        tension:0.3,
        pointBackgroundColor:COLORS.orange,
        pointRadius:4,
        datalabels:{
          anchor:"end", align:"top", color:COLORS.orange, font:{weight:"bold", size:11},
          formatter:v=> v.toLocaleString("pt-BR",{minimumFractionDigits:1, maximumFractionDigits:1})+"%"
        }
      }]
    },
    options:{
      responsive:true,
      layout:{ padding:{ top:18 } },
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ grid:{ display:false } },
        y:{ grid:{ color:COLORS.border }, ticks:{ callback:v=>v+"%" } }
      }
    }
  });

  // Variação MoM (valor acima/abaixo de cada coluna)
  destroyChart("variacao");
  charts.variacao = new Chart(document.getElementById("variacaoChart"), {
    type:"bar",
    data:{
      labels,
      datasets:[{
        label:"Variação MoM",
        data:months.map(m=> m.mom===null ? 0 : Math.round(m.mom*10)/10),
        backgroundColor:months.map(m=> m.mom===null ? COLORS.border : (m.mom>=0?COLORS.green:COLORS.red)),
        datalabels:{
          anchor:"end", align:"end", color:COLORS.navyDark, font:{weight:"bold", size:11},
          formatter:(v, ctx)=> momLabels[ctx.dataIndex]
        }
      }]
    },
    options:{
      responsive:true,
      layout:{ padding:{ top:18 } },
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ grid:{ display:false } },
        y:{ grid:{ color:COLORS.border }, ticks:{ callback:v=>v+"%" } }
      }
    }
  });
}

/* ---------- Rendering: log table ---------- */
function renderLog(entries){
  const body = document.getElementById("log-body");
  body.innerHTML = "";
  const sortKey = e => (e.kind==="month" ? e.month+"-99" : e.date) + "_" + e.id;
  const sorted = [...entries].sort((a,b)=> sortKey(b).localeCompare(sortKey(a)));
  const recent = sorted.slice(0, 12);
  if (recent.length === 0){
    body.innerHTML = `<tr class="empty-row"><td colspan="5">Nenhum lançamento ainda</td></tr>`;
    return;
  }
  recent.forEach(e=>{
    const tr = document.createElement("tr");
    const total = (Number(e.hot)||0)+(Number(e.spot)||0);
    const isMonth = e.kind === "month";
    const dateLabel = isMonth
      ? `<b>Mês:</b> ${monthLabel(e.month)}/${e.month.slice(0,4)}`
      : formatDateBR(e.date);
    tr.innerHTML = `
      <td>${dateLabel}</td>
      <td class="hot">${e.hot}</td>
      <td class="spot">${e.spot}</td>
      <td class="total">${total}</td>
      <td><button class="del-btn" data-id="${e.id}" title="Remover">✕</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll(".del-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = Number(btn.getAttribute("data-id"));
      let entries = loadEntries();
      entries = entries.filter(e=>e.id !== id);
      saveEntries(entries);
      renderAll();
    });
  });
}

/* ---------- Master render ---------- */
function renderAll(){
  const entries = loadEntries();
  const months = aggregateByMonth(entries);
  renderHeader(months);
  renderMonthlyCards(months);
  renderToday(entries);
  renderCharts(months);
  renderLog(entries);
}

/* ---------- Modal / add entry ---------- */
function daysInMonth(yyyyMm){
  const [y,m] = yyyyMm.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function setupModal(){
  const overlay = document.getElementById("modal-overlay");
  const addBtn = document.getElementById("add-btn");

  const tabDay = document.getElementById("tab-day");
  const tabMonth = document.getElementById("tab-month");
  const panelDay = document.getElementById("panel-day");
  const panelMonth = document.getElementById("panel-month");

  const cancelBtn = document.getElementById("cancel-btn");
  const saveBtn = document.getElementById("save-btn");
  const hotInput = document.getElementById("input-hot");
  const spotInput = document.getElementById("input-spot");

  const cancelMonthBtn = document.getElementById("cancel-month-btn");
  const saveMonthBtn = document.getElementById("save-month-btn");
  const monthInput = document.getElementById("input-month");
  const monthHotInput = document.getElementById("input-month-hot");
  const monthSpotInput = document.getElementById("input-month-spot");
  const monthDaysInput = document.getElementById("input-month-days");

  function showTab(which){
    const dayActive = which === "day";
    tabDay.classList.toggle("active", dayActive);
    tabMonth.classList.toggle("active", !dayActive);
    panelDay.classList.toggle("hidden", !dayActive);
    panelMonth.classList.toggle("hidden", dayActive);
  }

  function open(){
    hotInput.value = "";
    spotInput.value = "";
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    monthInput.value = defaultMonth;
    monthHotInput.value = "";
    monthSpotInput.value = "";
    monthDaysInput.value = daysInMonth(defaultMonth);
    showTab("day");
    overlay.classList.remove("hidden");
    hotInput.focus();
  }
  function close(){ overlay.classList.add("hidden"); }

  addBtn.addEventListener("click", open);
  cancelBtn.addEventListener("click", close);
  cancelMonthBtn.addEventListener("click", close);
  overlay.addEventListener("click", (ev)=>{ if (ev.target === overlay) close(); });
  tabDay.addEventListener("click", ()=>showTab("day"));
  tabMonth.addEventListener("click", ()=>showTab("month"));
  monthInput.addEventListener("change", ()=>{
    if (monthInput.value) monthDaysInput.value = daysInMonth(monthInput.value);
  });

  saveBtn.addEventListener("click", ()=>{
    const hot = parseInt(hotInput.value, 10) || 0;
    const spot = parseInt(spotInput.value, 10) || 0;
    if (hot === 0 && spot === 0){
      hotInput.focus();
      return;
    }
    const entries = loadEntries();
    entries.push({
      id: Date.now(),
      kind: "daily",
      date: todayStr(),   // data é sempre "hoje" — campo oculto do usuário
      hot, spot
    });
    saveEntries(entries);
    close();
    renderAll();
  });

  saveMonthBtn.addEventListener("click", ()=>{
    const monthVal = monthInput.value;
    const hot = parseInt(monthHotInput.value, 10) || 0;
    const spot = parseInt(monthSpotInput.value, 10) || 0;
    const days = parseInt(monthDaysInput.value, 10) || daysInMonth(monthVal || todayStr().slice(0,7));
    if (!monthVal || (hot === 0 && spot === 0)){
      monthHotInput.focus();
      return;
    }
    const entries = loadEntries();
    entries.push({
      id: Date.now(),
      kind: "month",
      month: monthVal,
      hot, spot, days
    });
    saveEntries(entries);
    close();
    renderAll();
  });
}

/* ---------- Save whole dashboard as image ---------- */
function setupImageExport(){
  const btn = document.getElementById("image-btn");
  btn.addEventListener("click", ()=>{
    const target = document.getElementById("capture-area");
    const original = btn.textContent;
    btn.textContent = "Gerando imagem...";
    btn.disabled = true;
    html2canvas(target, {
      backgroundColor:"#F4F5F8",
      scale:2,
      useCORS:true
    }).then(canvas=>{
      const link = document.createElement("a");
      link.download = `KPI_Hot_Spot_${todayStr()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    }).catch(err=>{
      alert("Não foi possível gerar a imagem. Tente novamente.");
      console.error(err);
    }).finally(()=>{
      btn.textContent = original;
      btn.disabled = false;
    });
  });
}

/* ---------- Auto refresh at midnight (resets "hoje") ---------- */
function scheduleMidnightRefresh(){
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0, 0, 5);
  const ms = next - now;
  setTimeout(()=>{ renderAll(); scheduleMidnightRefresh(); }, ms);
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
  renderAll();
  setupModal();
  setupImageExport();
  scheduleMidnightRefresh();
});
