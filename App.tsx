
import React, { useState } from 'react';
import { Header } from './components/Header';
import { InputPanel } from './components/InputPanel';
import { StrategyDisplay } from './components/StrategyDisplay';
import { getOptimalStrategy } from './services/geminiService';
import type { RaceData, PitStrategy } from './types';
import { TireCompound, TrackType, RiskLevel } from './types';


export default function App() {
  const [raceData, setRaceData] = useState<RaceData>({
    totalLaps: 58,
    avgLapTime: 92.5,
    pitLaneTimeLoss: 22,
    startCompound: TireCompound.Medium,
    availableCompounds: [TireCompound.Hard, TireCompound.Medium],
    tireWear: 5,
    tireCliff: 25,
    trackType: TrackType.HighDeg,
    traffic: 4,
    overtakingDifficulty: 6,
    riskLevel: RiskLevel.Balanced,
  });

  const [strategy, setStrategy] = useState<PitStrategy | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async () => {
    setIsLoading(true);
    setError(null);
    setStrategy(null);
    try {
      const result = await getOptimalStrategy(raceData);
      setStrategy(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-gray-200 font-sans">
      <Header />
      <main className="container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-1">
            <InputPanel 
              raceData={raceData}
              setRaceData={setRaceData}
              onCalculate={handleCalculate}
              isLoading={isLoading}
            />
          </div>
          <div className="lg:col-span-2">
            <StrategyDisplay 
              strategy={strategy}
              isLoading={isLoading}
              error={error}
            />
          </div>
        </div>
        <footer className="text-center text-gray-500 mt-12 text-sm">
          <p>&copy; {new Date().getFullYear()} Pit Stop Strategist. AI-powered insights for the win.</p>
        </footer>
      </main>
    </div>
  );
}
