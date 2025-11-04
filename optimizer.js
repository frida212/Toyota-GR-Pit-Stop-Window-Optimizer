// Port of the Python optimizer to JavaScript (simplified, client-side)

const TireWearModel = (function() {
  function robustLinearFit(xs, ys) {
    if (!xs.length || xs.length !== ys.length) {
      return { slope: 0, intercept: ys.length ? avg(ys) : 0 };
    }
    let n = xs.length;
    let X = xs.slice();
    let Y = ys.slice();
    if (n >= 10) {
      const paired = X.map((x, i) => [x, Y[i]]).sort((a, b) => a[1] - b[1]);
      const k = Math.max(1, Math.floor(n * 0.1));
      const trimmed = paired.length > 2 * k ? paired.slice(k, paired.length - k) : paired;
      X = trimmed.map(p => p[0]);
      Y = trimmed.map(p => p[1]);
    }
    const meanX = avg(X);
    const meanY = avg(Y);
    let num = 0, den = 0;
    for (let i = 0; i < X.length; i++) {
      num += (X[i] - meanX) * (Y[i] - meanY);
      den += (X[i] - meanX) ** 2;
    }
    const slope = den !== 0 ? num / den : 0;
    const intercept = meanY - slope * meanX;
    return { slope: Math.max(0, slope), intercept };
  }

  function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

  return class {
    constructor(baseWarmupPenalty = 1.0) {
      this.baseWarmupPenalty = baseWarmupPenalty;
    }
    fitDriver(laps) {
      const xs = laps.map((_, i) => i + 1);
      const ys = laps.map(e => e.lap_time_s);
      const { slope, intercept } = robustLinearFit(xs, ys);
      return { degradation: slope, base: intercept, warmup: this.baseWarmupPenalty };
    }
    predict(ageLaps, params) { return params.base + params.degradation * ageLaps; }
  };
})();

const TrafficModel = (function() {
  function collectStartTimes(field) {
    const times = [];
    Object.values(field).forEach(laps => {
      laps.forEach(e => {
        if (e.start_time_s != null && e.start_time_s > 0) times.push(e.start_time_s);
      });
    });
    return times.sort((a,b) => a - b);
  }
  function density(times, t, window) {
    const low = t - window / 2;
    const high = t + window / 2;
    let c = 0;
    for (const x of times) { if (x >= low && x <= high) c++; }
    return c;
  }
  return class {
    constructor(windowSec = 20, threshold = 10, baseIn = 1.5, baseOut = 1.5) {
      this.windowSec = windowSec; this.threshold = threshold;
      this.baseIn = baseIn; this.baseOut = baseOut;
    }
    penalties(field, inStart, outStart) {
      const times = collectStartTimes(field);
      let inPen = 0, outPen = 0;
      if (inStart != null) {
        const d = density(times, inStart, this.windowSec);
        inPen = this.baseIn * Math.min(1.0, d / Math.max(1, this.threshold));
      }
      if (outStart != null) {
        const d = density(times, outStart, this.windowSec);
        outPen = this.baseOut * Math.min(1.0, d / Math.max(1, this.threshold));
      }
      return [inPen, outPen];
    }
  };
})();

class PitLossModel {
  constructor(pitLaneLoss = 35.0, serviceTime = 25.0) {
    this.pitLaneLoss = pitLaneLoss; this.serviceTime = serviceTime;
  }
  total() { return this.pitLaneLoss + this.serviceTime; }
}

class PitStopOptimizer {
  constructor(tire, traffic, pit) { this.tire = tire; this.traffic = traffic; this.pit = pit; }
  totalTimeSingleStop(laps, field, pitOnLap) {
    const params = this.tire.fitDriver(laps);
    const n = laps.length;
    let total = 0;
    for (let idx = 0; idx < pitOnLap - 1; idx++) total += this.tire.predict(idx + 1, params);
    const inStart = (pitOnLap - 1) < n ? laps[pitOnLap - 1].start_time_s : null;
    const outStart = pitOnLap < n ? laps[pitOnLap].start_time_s : null;
    const [inPen, outPen] = this.traffic.penalties(field, inStart, outStart);
    total += params.base + params.degradation * pitOnLap + inPen;
    total += this.pit.total();
    total += params.base + params.warmup + outPen;
    const postCount = n - (pitOnLap + 1);
    for (let j = 0; j < postCount; j++) total += this.tire.predict(j + 2, params);
    return { total, inPen, outPen };
  }
  recommendSingleStop(laps, field) {
    const n = laps.length;
    let bestTotal = Number.POSITIVE_INFINITY, bestLap = null, bestIn = 0, bestOut = 0;
    for (let k = 2; k < Math.max(3, n - 2); k++) {
      const { total, inPen, outPen } = this.totalTimeSingleStop(laps, field, k);
      if (total < bestTotal) { bestTotal = total; bestLap = k; bestIn = inPen; bestOut = outPen; }
    }
    const deltaFor = (offset) => {
      const cand = (bestLap || 0) + offset;
      if (cand >= 2 && cand <= n - 2) return this.totalTimeSingleStop(laps, field, cand).total - bestTotal;
      return null;
    };
    return {
      best_pit_lap: bestLap || 0,
      estimated_total_time_s: Number.isFinite(bestTotal) ? bestTotal : 0,
      in_lap_traffic_penalty_s: bestIn,
      out_lap_traffic_penalty_s: bestOut,
      undercut_minus_one_lap_delta_s: deltaFor(-1) ?? 0,
      overcut_plus_one_lap_delta_s: deltaFor(+1) ?? 0,
    };
  }
}

// CSV helpers
function parseCSV(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: true });
  return res.data;
}
function findColumn(row, cands) {
  const keys = Object.keys(row);
  for (const c of cands) {
    const k = keys.find(k => k.toLowerCase() === c.toLowerCase());
    if (k) return k;
  }
  return null;
}
function parseTime(value) {
  if (value == null) return null;
  const s = String(value).trim(); if (!s) return null;
  // Pure number (seconds)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const f = Number(s);
    return !Number.isNaN(f) ? f : null;
  }
  // Take last token (handles cases with date/time prefixes)
  const candidate = s.split(' ').pop();
  const seg = candidate.split(':');
  // hh:mm:ss(.sss)
  if (seg.length === 3) {
    const hh = Number(seg[0]); const mm = Number(seg[1]); const ss = Number(seg[2]);
    if ([hh, mm, ss].some(x => Number.isNaN(x))) return null;
    return hh * 3600 + mm * 60 + ss;
  }
  // mm:ss(.sss)
  if (seg.length === 2) {
    const mm = Number(seg[0]); const ss = Number(seg[1]);
    if ([mm, ss].some(x => Number.isNaN(x))) return null;
    return mm * 60 + ss;
  }
  // ss(.sss)
  if (seg.length === 1 && /^\d+(\.\d+)?$/.test(seg[0])) {
    const f = Number(seg[0]);
    return !Number.isNaN(f) ? f : null;
  }
  return null;
}

function mergeTimeFile(byDriver, rows, fieldName) {
  rows.forEach(row => {
    const driverCol = findColumn(row, ['Driver', 'driver', 'Name', 'name', 'vehicle_id']);
    const lapCol = findColumn(row, ['Lap', 'lap', 'LapNumber', 'lap_number']);
    const timeCol = findColumn(row, ['Time', 'time', 'StartTime', 'EndTime', 'meta_time', 'timestamp', 'value']);
    if (!driverCol || !lapCol || !timeCol) return;
    const driver = (row[driverCol] || '').trim() || 'Unknown';
    const lapIndex = parseInt(row[lapCol]); if (Number.isNaN(lapIndex)) return;
    const t = parseTime(row[timeCol]); if (t == null) return;
    const laps = byDriver[driver] || [];
    for (const e of laps) { if (e.lap_index === lapIndex) { e[fieldName] = t; break; } }
  });
}

function loadLapsFromRows(rows) {
  const byDriver = {};
  rows.forEach(row => {
    const driverCol = findColumn(row, ['Driver', 'driver', 'Name', 'name', 'vehicle_id']);
    const carCol = findColumn(row, ['Car', 'car', 'Vehicle']);
    const lapCol = findColumn(row, ['Lap', 'lap', 'LapNumber', 'lap_number']);
    const laptimeCol = findColumn(row, ['LapTime', 'lap_time', 'LapTimeSec', 'lap_time_s', 'Time', 'value']);
    if (!driverCol || !lapCol || !laptimeCol) return;
    const driver = (row[driverCol] || '').trim() || (row[carCol] || '').trim() || 'Unknown';
    const lapIndex = parseInt(row[lapCol]); if (Number.isNaN(lapIndex)) return;
    const lt = parseTime(row[laptimeCol]); if (lt == null) return;
    const entry = { lap_index: lapIndex, lap_time_s: lt, start_time_s: null, end_time_s: null };
    byDriver[driver] = byDriver[driver] || []; byDriver[driver].push(entry);
  });
  Object.keys(byDriver).forEach(d => byDriver[d].sort((a,b) => a.lap_index - b.lap_index));
  return byDriver;
}

function findDriver(byDriver, query) {
  if (!query) {
    let best = null; let max = -1;
    Object.entries(byDriver).forEach(([d, laps]) => { if (laps.length > max) { max = laps.length; best = [d, laps]; } });
    return best;
  }
  const q = query.toLowerCase();
  for (const d of Object.keys(byDriver)) { if (d.toLowerCase().includes(q)) return [d, byDriver[d]]; }
  let best = null; let max = -1;
  Object.entries(byDriver).forEach(([d, laps]) => { if (laps.length > max) { max = laps.length; best = [d, laps]; } });
  return best;
}

// Expose API for app.js
window.SonomaOptimizer = {
  TireWearModel, TrafficModel, PitLossModel, PitStopOptimizer,
  parseCSV, loadLapsFromRows, mergeTimeFile, findDriver,
  salvageCSVRowsFromText
};

// Attempts to salvage CSV-like rows from text that may contain non-CSV bytes (e.g., dot-underscore files)
function salvageCSVRowsFromText(text) {
  if (!text) return [];
  // Remove non-printable characters
  const clean = text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
  const lines = clean.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  // Find a plausible header line containing Driver/Name and Lap and LapTime/Time
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const lc = L.toLowerCase();
    const hasDriver = lc.includes('driver') || lc.includes('name') || lc.includes('vehicle_id') || lc.includes('car') || lc.includes('vehicle');
    const hasLap = lc.includes('lap') || lc.includes('lapnumber') || lc.includes('lap_number');
    const hasTime = lc.includes('laptime') || lc.includes('time') || lc.includes('value') || lc.includes('timestamp');
    if (hasDriver && hasLap && hasTime) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) {
    // fallback: first line
    headerIdx = 0;
  }
  const header = lines[headerIdx].split(',').map(h => h.trim());
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    if (vals.length < 2) continue;
    const row = {};
    for (let j = 0; j < header.length && j < vals.length; j++) {
      row[header[j]] = vals[j].trim();
    }
    rows.push(row);
    if (rows.length > 20000) break; // safety cap
  }
  return rows;
}