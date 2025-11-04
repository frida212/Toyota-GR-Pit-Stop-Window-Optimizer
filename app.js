const sourceRadios = document.querySelectorAll('input[name="source"]');
const serverControls = document.getElementById('server-controls');
const uploadControls = document.getElementById('upload-controls');
const raceSelect = document.getElementById('race');
// Driver UI removed; we auto-select best driver per race
const output = document.getElementById('output');

const pitLossEl = document.getElementById('pit-loss');
const serviceEl = document.getElementById('service-time');
const warmupEl = document.getElementById('warmup');
const trafficWindowEl = document.getElementById('traffic-window');
const trafficThresholdEl = document.getElementById('traffic-threshold');
const computeBtn = document.getElementById('compute');

const lapTimeFile = document.getElementById('lap-time-file');
const lapStartFile = document.getElementById('lap-start-file');
const lapEndFile = document.getElementById('lap-end-file');
// Upload driver dropdown removed

sourceRadios.forEach(r => {
  r.addEventListener('change', () => {
    const v = document.querySelector('input[name="source"]:checked').value;
    if (v === 'server') { serverControls.classList.remove('hidden'); uploadControls.classList.add('hidden'); }
    else { uploadControls.classList.remove('hidden'); serverControls.classList.add('hidden'); }
  });
});

// No auto-load; compute will fetch and auto-select driver

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

// Try multiple candidate URLs (e.g., local server vs Netlify static paths)
async function fetchFirst(candidates) {
  for (const u of candidates) {
    try { return await fetchText(u); } catch { /* try next */ }
  }
  return null;
}

// Driver list loading removed

let cachedFieldByRace = { R1: null, R2: null };

// Upload driver list removed

async function getServerFieldAndDefaultDriver(race) {
  const lapFiles = race === 'R1'
    ? ['/data/Race 1/sonoma_lap_time_R1.csv', '/Sonoma/Race 1/sonoma_lap_time_R1.csv']
    : ['/data/Race 2/sonoma_lap_time_R2.csv', '/Sonoma/Race 2/sonoma_lap_time_R2.csv'];
  const altLapFiles = race === 'R1'
    ? ['/data/Race 1/._sonoma_lap_time_R1.csv', '/Sonoma/Race 1/._sonoma_lap_time_R1.csv']
    : ['/data/Race 2/._sonoma_lap_time_R2.csv', '/Sonoma/Race 2/._sonoma_lap_time_R2.csv'];
  const startFiles = race === 'R1'
    ? ['/data/Race 1/sonoma_lap_start_time_R1.csv', '/Sonoma/Race 1/sonoma_lap_start_time_R1.csv']
    : ['/data/Race 2/sonoma_lap_start_time_R2.csv', '/Sonoma/Race 2/sonoma_lap_start_time_R2.csv'];
  const altStartFiles = race === 'R1'
    ? ['/data/Race 1/._sonoma_lap_start_time_R1.csv', '/Sonoma/Race 1/._sonoma_lap_start_time_R1.csv']
    : ['/data/Race 2/._sonoma_lap_start_time_R2.csv', '/Sonoma/Race 2/._sonoma_lap_start_time_R2.csv'];
  const endFiles = race === 'R1'
    ? ['/data/Race 1/sonoma_lap_end_time_R1.csv', '/Sonoma/Race 1/sonoma_lap_end_time_R1.csv']
    : ['/data/Race 2/sonoma_lap_end_time_R2.csv', '/Sonoma/Race 2/sonoma_lap_end_time_R2.csv'];
  const altEndFiles = race === 'R1'
    ? ['/data/Race 1/._sonoma_lap_end_time_R1.csv', '/Sonoma/Race 1/._sonoma_lap_end_time_R1.csv']
    : ['/data/Race 2/._sonoma_lap_end_time_R2.csv', '/Sonoma/Race 2/._sonoma_lap_end_time_R2.csv'];
  let text = await fetchFirst(lapFiles);
  let rows = text ? SonomaOptimizer.parseCSV(text) : [];
  let byDriver = SonomaOptimizer.loadLapsFromRows(rows);
  if (!byDriver || Object.keys(byDriver).length === 0) {
    text = await fetchFirst(altLapFiles);
    if (text) {
      rows = SonomaOptimizer.parseCSV(text);
      byDriver = SonomaOptimizer.loadLapsFromRows(rows);
      if (!byDriver || Object.keys(byDriver).length === 0) {
        const salvagedRows = SonomaOptimizer.salvageCSVRowsFromText(text);
        byDriver = SonomaOptimizer.loadLapsFromRows(salvagedRows);
      }
    }
  }
  const found = SonomaOptimizer.findDriver(byDriver, null);
  if (!found) throw new Error('No lap data found for this race. Ensure valid CSVs are available.');
  const [name, laps] = found;
  try {
    let st = await fetchFirst(startFiles); if (!st) st = await fetchFirst(altStartFiles);
    if (st) SonomaOptimizer.mergeTimeFile(byDriver, SonomaOptimizer.parseCSV(st), 'start_time_s');
  } catch {}
  try {
    let et = await fetchFirst(endFiles); if (!et) et = await fetchFirst(altEndFiles);
    if (et) SonomaOptimizer.mergeTimeFile(byDriver, SonomaOptimizer.parseCSV(et), 'end_time_s');
  } catch {}
  return { field: byDriver, driver: name, laps };
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function getUploadFieldAndDefaultDriver() {
  if (!lapTimeFile.files[0]) throw new Error('Lap Time CSV is required.');
  const text = await readFileAsText(lapTimeFile.files[0]);
  const rows = SonomaOptimizer.parseCSV(text);
  const byDriver = SonomaOptimizer.loadLapsFromRows(rows);
  let driver = null, laps = null;
  let found = SonomaOptimizer.findDriver(byDriver, null);
  // If not found, try salvaging rows from raw text (handles dot-underscore or malformed CSV)
  if (!found) {
    const salvagedRows = SonomaOptimizer.salvageCSVRowsFromText(text);
    const byDriver2 = SonomaOptimizer.loadLapsFromRows(salvagedRows);
    found = SonomaOptimizer.findDriver(byDriver2, null);
    if (found) {
      // Use salvaged field
      driver = found[0]; laps = found[1];
      // Merge start/end from uploads if provided
      if (lapStartFile.files[0]) {
        const st = await readFileAsText(lapStartFile.files[0]);
        SonomaOptimizer.mergeTimeFile(byDriver2, SonomaOptimizer.parseCSV(st), 'start_time_s');
      }
      if (lapEndFile.files[0]) {
        const et = await readFileAsText(lapEndFile.files[0]);
        SonomaOptimizer.mergeTimeFile(byDriver2, SonomaOptimizer.parseCSV(et), 'end_time_s');
      }
      return { field: byDriver2, driver, laps };
    }
  }
  if (!found) throw new Error('No lap data found in uploaded Lap Time CSV.');
  [driver, laps] = found;
  if (lapStartFile.files[0]) {
    const st = await readFileAsText(lapStartFile.files[0]);
    SonomaOptimizer.mergeTimeFile(byDriver, SonomaOptimizer.parseCSV(st), 'start_time_s');
  }
  if (lapEndFile.files[0]) {
    const et = await readFileAsText(lapEndFile.files[0]);
    SonomaOptimizer.mergeTimeFile(byDriver, SonomaOptimizer.parseCSV(et), 'end_time_s');
  }
  return { field: byDriver, driver, laps };
}

computeBtn.addEventListener('click', async () => {
  try {
    const params = {
      pitLoss: Number(pitLossEl.value),
      service: Number(serviceEl.value),
      warmup: Number(warmupEl.value),
      tWindow: Number(trafficWindowEl.value),
      tThresh: Number(trafficThresholdEl.value)
    };
    const src = document.querySelector('input[name="source"]:checked').value;
    let field, driver, laps;
    if (src === 'server') {
      const race = raceSelect.value;
      if (race === 'both') {
        const out = {};
        try {
          const r1 = await getServerFieldAndDefaultDriver('R1');
          const tire1 = new SonomaOptimizer.TireWearModel(params.warmup);
          const traffic1 = new SonomaOptimizer.TrafficModel(params.tWindow, params.tThresh);
          const pit1 = new SonomaOptimizer.PitLossModel(params.pitLoss, params.service);
          const opt1 = new SonomaOptimizer.PitStopOptimizer(tire1, traffic1, pit1);
          out.R1 = opt1.recommendSingleStop(r1.laps, r1.field);
        } catch (e) {
          out.R1 = { error: String(e) };
        }
        try {
          const r2 = await getServerFieldAndDefaultDriver('R2');
          const tire2 = new SonomaOptimizer.TireWearModel(params.warmup);
          const traffic2 = new SonomaOptimizer.TrafficModel(params.tWindow, params.tThresh);
          const pit2 = new SonomaOptimizer.PitLossModel(params.pitLoss, params.service);
          const opt2 = new SonomaOptimizer.PitStopOptimizer(tire2, traffic2, pit2);
          out.R2 = opt2.recommendSingleStop(r2.laps, r2.field);
        } catch (e) {
          out.R2 = { error: String(e) };
        }
        output.textContent = JSON.stringify(out, null, 2);
        return;
      }
      const r = await getServerFieldAndDefaultDriver(race);
      field = r.field; driver = r.driver; laps = r.laps;
    } else {
      const r = await getUploadFieldAndDefaultDriver();
      field = r.field; driver = r.driver; laps = r.laps;
    }
    if (!laps || laps.length < 5) throw new Error('Insufficient laps for selected driver.');
    const tire = new SonomaOptimizer.TireWearModel(params.warmup);
    const traffic = new SonomaOptimizer.TrafficModel(params.tWindow, params.tThresh);
    const pit = new SonomaOptimizer.PitLossModel(params.pitLoss, params.service);
    const opt = new SonomaOptimizer.PitStopOptimizer(tire, traffic, pit);
    const result = opt.recommendSingleStop(laps, field);
    // Do not include driver info; keep results race-only
    // result.race = raceSelect.value; // optional, omit for clarity
    output.textContent = JSON.stringify(result, null, 2);
  } catch (e) {
    output.textContent = String(e);
  }
});

// Default to Both and auto-compute on load (server mode)
window.addEventListener('DOMContentLoaded', () => {
  try {
    raceSelect.value = 'both';
    const v = document.querySelector('input[name="source"]:checked').value;
    if (v === 'server') {
      computeBtn.click();
    }
  } catch {}
});