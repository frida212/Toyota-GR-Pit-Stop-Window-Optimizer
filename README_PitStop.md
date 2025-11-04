Pit Stop Window Optimizer (Sonoma)

Overview

- Computes an optimal single pit-stop lap to minimize total race time.
- Incorporates out-lap/in-lap traffic penalties, undercut/overcut comparison, and a simple tire wear model fit from your lap data.
- Uses only standard Python libraries; no external dependencies required.

Data Requirements

- Place CSVs in one of these locations relative to where you run the script:
  - `./Sonoma/Race 1/sonoma_lap_time_R1.csv`
  - `./Sonoma/Race 1/sonoma_lap_start_time_R1.csv` (optional)
  - `./Sonoma/Race 1/sonoma_lap_end_time_R1.csv` (optional)
  - `./Sonoma/Race 2/sonoma_lap_time_R2.csv`
  - `./Sonoma/Race 2/sonoma_lap_start_time_R2.csv` (optional)
  - `./Sonoma/Race 2/sonoma_lap_end_time_R2.csv` (optional)

- If your environment contains `__MACOSX` with files starting `._`, those are resource-fork sidecars. Ensure the actual CSVs (without `._` prefix) exist in the `Sonoma` folder outside `__MACOSX` or copy them into `./Sonoma/...`.

CSV Expectations

- Columns are auto-detected with common names. Ideal columns per file:
  - Lap time file: `Driver`, `Lap`, `LapTime` (HH:MM:SS, seconds, or ISO datetime).
  - Start/end time files: `Driver`, `Lap`, `Time` (HH:MM:SS or seconds). These are optional; including them improves the traffic model.

How It Works

- Tire wear model: Fits a robust linear degradation rate (seconds per lap) from each driver’s lap times. Applies a configurable out-lap warmup penalty.
- Traffic model: Counts start-line crossings in a time window around pit entry/exit to estimate in-lap/out-lap penalties based on density.
- Pit loss: Sum of pit lane delta and service time.
- Optimizer: Evaluates all feasible pit laps and picks the lap minimizing total predicted race time; reports undercut/overcut deltas for ±1 lap.

Usage

- From the `pitstop` folder (or project root), run:
  - `python pitstop/cli.py --race R1 --driver "Your Driver Name"`
  - Optional flags:
    - `--pit-lane-loss 35.0` pit lane delta seconds
    - `--service-time 25.0` pit service time seconds
    - `--warmup-penalty 1.0` out-lap warmup penalty seconds
    - `--traffic-window 20.0` traffic window (seconds) around pit events
    - `--traffic-threshold 10` density threshold for full penalty

Notes & Assumptions

- Single-stop strategy only in this version; multi-stop can be added similarly.
- If start/end time files are missing, traffic penalties default to zero, and results focus on tire wear vs pit loss tradeoff.
- Undercut/overcut metrics report the change in total estimated time if pitting one lap earlier or later than the recommended lap.

Troubleshooting

- If you see `Could not locate lap time file for R1`, ensure non-`._` CSV files exist at `./Sonoma/Race 1/sonoma_lap_time_R1.csv` or move them accordingly.
- If times are in ISO datetime format, the loader uses absolute timestamps; mixed formats are tolerated but standardized to seconds when possible.