
import React, { useEffect, useState, useMemo } from 'react';
import { MatchInfo, OddsData, PreGoalAnalysis, OddsItem } from '../types';
import { parseStats, getMatchDetails, getMatchOdds } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Activity, Target } from 'lucide-react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, LineChart, Line, Legend, ReferenceLine } from 'recharts';

interface DashboardProps {
  token: string;
  match: MatchInfo;
  onBack: () => void;
}

// A simple Mulberry32 PRNG for stable random number generation
function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const getOddsColor = (odds: number): string => {
  if (odds < 1.7) return '#4ade80'; // Bright Green
  if (odds < 1.9) return '#a3e635'; // Lime
  if (odds < 2.1) return '#facc15'; // Yellow
  if (odds < 2.3) return '#fb923c'; // Orange
  return '#f87171';       // Red
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const type = payload[0].name;

    if (type === 'Shots') {
      return (
        <div className="bg-slate-800 text-white text-xs p-2 rounded shadow-lg border border-slate-700">
          <p className="font-bold">Minute: {data.minute}'</p>
          <p style={{ color: data.fill }} className="font-semibold">Shot: {data.type}</p>
        </div>
      );
    }
    
    // Default to market tooltip
    return (
      <div className="bg-slate-800 text-white text-xs p-2 rounded shadow-lg border border-slate-700">
        <p className="font-bold">Minute: {data.minute}'</p>
        <p>HDP: {data.handicap.toFixed(2)}</p>
        <p className="text-gray-400">Over Odds: {data.over.toFixed(3)}</p>
      </div>
    );
  }
  return null;
};

const OddsColorLegent = () => (
    <div className="flex items-center justify-center space-x-2 mt-3 text-xs text-gray-500">
        <span>Low Odds</span>
        <div className="w-24 h-2 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500"></div>
        <span>High Odds</span>
    </div>
);

const ShotLegend = () => (
    <div className="flex items-center justify-center space-x-4 mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#4ade80]"></div>
            <span>On Target</span>
        </div>
        <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#facc15]"></div>
            <span>Off Target</span>
        </div>
    </div>
);


export const Dashboard: React.FC<DashboardProps> = ({ token, match, onBack }) => {
  const [liveMatch, setLiveMatch] = useState<MatchInfo>(match);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [oddsHistory, setOddsHistory] = useState<{ minute: number; over: number; under: number; handicap: string }[]>([]);
  
  const stats = useMemo(() => parseStats(liveMatch.stats), [liveMatch.stats]);

  // Real-time polling for both match details and odds
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!isMounted) return;

      const [detailsData, oddsData] = await Promise.all([
        getMatchDetails(token, liveMatch.id),
        getMatchOdds(token, liveMatch.id),
      ]);

      if (isMounted) {
        if (detailsData) {
          setLiveMatch(detailsData);
        } else {
          console.log("Match details could not be updated. It might have ended.");
        }
        if (oddsData) {
          const allMarkets = oddsData.results?.odds?.['1_3'];
          
          if (allMarkets && allMarkets.length > 0) {
            // 1. Group all historical markets by minute from their `time_str`
            const marketsByMinute: { [minute: string]: OddsItem[] } = {};
            allMarkets.forEach(market => {
              if (market.time_str && market.over_od && market.under_od && market.handicap) {
                if (!marketsByMinute[market.time_str]) {
                  marketsByMinute[market.time_str] = [];
                }
                marketsByMinute[market.time_str].push(market);
              }
            });

            // 2. For each minute, find the main market (most balanced odds)
            const newHistory: { minute: number; over: number; under: number; handicap: string }[] = [];
            for (const minuteStr in marketsByMinute) {
              const marketsForMinute = marketsByMinute[minuteStr];
              let mainMarket: OddsItem | null = null;
              let minDiff = Infinity;

              marketsForMinute.forEach(market => {
                const over = parseFloat(market.over_od!);
                const under = parseFloat(market.under_od!);
                if (!isNaN(over) && !isNaN(under)) {
                  const diff = Math.abs(over - under);
                  if (diff < minDiff) {
                    minDiff = diff;
                    mainMarket = market;
                  }
                }
              });

              if (mainMarket) {
                newHistory.push({
                  minute: parseInt(minuteStr),
                  over: parseFloat(mainMarket.over_od!),
                  under: parseFloat(mainMarket.under_od!),
                  handicap: mainMarket.handicap!,
                });
              }
            }
            
            // 3. Sort by minute and update the state
            newHistory.sort((a, b) => a.minute - b.minute);
            setOddsHistory(newHistory);
          }
        }
      }
    };

    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 20000); // Poll every 20 seconds

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [liveMatch.id, token]);


  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    
    const [detailsData] = await Promise.all([
        getMatchDetails(token, liveMatch.id)
    ]);

    if (detailsData) setLiveMatch(detailsData);
    
    setTimeout(() => setIsRefreshing(false), 500); // Give feedback for a moment
  };


  // Calculate Pre-Goal Probability (Ported logic)
  const analysis: PreGoalAnalysis = useMemo(() => {
    const time = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
    const totalDA = stats.dangerous_attacks[0] + stats.dangerous_attacks[1];
    const totalOT = stats.on_target[0] + stats.on_target[1];
    
    const attackDensity = (totalDA * 0.5 + totalOT * 2) / Math.max(1, time); 
    const probabilityScore = Math.min(95, Math.max(5, Math.round(attackDensity * 100)));

    let level: PreGoalAnalysis['level'] = 'low';
    if (probabilityScore > 80) level = 'very-high';
    else if (probabilityScore > 60) level = 'high';
    else if (probabilityScore > 40) level = 'medium';

    return {
      score: probabilityScore,
      level,
      factors: {
        apiMomentum: attackDensity,
        shotCluster: totalOT,
        pressure: totalDA
      }
    };
  }, [stats, liveMatch.time, liveMatch.timer]);
  
  const scoreParts = (liveMatch.ss || "0-0").split("-");

  const marketChartData = useMemo(() => {
    return oddsHistory.map(p => ({
      ...p,
      handicap: parseFloat(p.handicap),
    }));
  }, [oddsHistory]);

  const chartData = useMemo(() => {
    const currentMin = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
    if (currentMin === 0) return [];

    const data = [];
    const homeBase = stats.dangerous_attacks[0] / Math.max(1, currentMin);
    const awayBase = stats.dangerous_attacks[1] / Math.max(1, currentMin);

    const homeSeedString = `${match.id}-home-pressure`;
    let homeSeed = 0;
    for (let k = 0; k < homeSeedString.length; k++) {
      homeSeed += homeSeedString.charCodeAt(k) * (k + 1);
    }
    const homeRandom = mulberry32(homeSeed);

    const awaySeedString = `${match.id}-away-pressure`;
    let awaySeed = 0;
    for (let k = 0; k < awaySeedString.length; k++) {
      awaySeed += awaySeedString.charCodeAt(k) * (k + 1);
    }
    const awayRandom = mulberry32(awaySeed);

    for (let i = 1; i <= currentMin; i++) {
      data.push({
        minute: i,
        homePressure: (homeBase * i) + (homeRandom() * 5),
        awayPressure: (awayBase * i) + (awayRandom() * 5),
      });
    }
    return data;
  }, [liveMatch.timer, liveMatch.time, stats, match.id]);
  
  const shotData = useMemo(() => {
    const currentMin = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
    if (currentMin === 0 || marketChartData.length === 0) return [];

    const allOnTarget = stats.on_target[0] + stats.on_target[1];
    const allOffTarget = stats.off_target[0] + stats.off_target[1];
    const data: any[] = [];

    const findHandicapForMinute = (minute: number) => {
      let closest = marketChartData[0];
      for (const point of marketChartData) {
        if (Math.abs(point.minute - minute) <= Math.abs(closest.minute - minute)) {
          closest = point;
        }
      }
      return closest.handicap;
    };

    const generatePoints = (count: number, type: 'On Target' | 'Off Target') => {
      for (let i = 0; i < count; i++) {
        const seedString = `${match.id}-shot-${type}-${i}`;
        let seed = 0;
        for (let k = 0; k < seedString.length; k++) {
          seed += seedString.charCodeAt(k) * (k + 1);
        }
        const random = mulberry32(seed);
        const randomMinute = Math.floor(random() * 90) + 1;

        if (randomMinute <= currentMin) {
          data.push({
            minute: randomMinute,
            handicap: findHandicapForMinute(randomMinute),
            z: 250, // Make shots bigger
            type: type,
            fill: type === 'On Target' ? '#4ade80' : '#facc15',
          });
        }
      }
    };

    generatePoints(allOnTarget, 'On Target');
    generatePoints(allOffTarget, 'Off Target');
    return data;
  }, [stats, liveMatch.time, liveMatch.timer, match.id, marketChartData]);


  return (
    <div className="pb-10">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 shadow-sm border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <button onClick={onBack} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
             <span className="text-xs font-bold text-gray-400">LIVE ANALYSIS</span>
             <span className="text-red-500 font-bold flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                {liveMatch.timer?.tm || liveMatch.time}'
             </span>
          </div>
          <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 -mr-2 text-gray-600 active:bg-gray-100 rounded-full">
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Scoreboard */}
        <div className="flex justify-between items-center px-6 pb-4">
            <div className="flex flex-col items-center w-1/3">
                <div className="font-bold text-lg text-center leading-tight mb-1">{liveMatch.home.name}</div>
                <div className="text-xs text-gray-400">Home</div>
            </div>
            <div className="flex items-center gap-3">
                <span className="text-4xl font-black text-slate-800">{scoreParts[0]}</span>
                <span className="text-gray-300 text-2xl font-light">-</span>
                <span className="text-4xl font-black text-slate-800">{scoreParts[1]}</span>
            </div>
            <div className="flex flex-col items-center w-1/3">
                <div className="font-bold text-lg text-center leading-tight mb-1">{liveMatch.away.name}</div>
                <div className="text-xs text-gray-400">Away</div>
            </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Prediction Box */}
        <div className={`rounded-2xl p-4 flex items-center justify-between shadow-sm border
            ${analysis.level === 'very-high' ? 'bg-red-50 border-red-200' : 
              analysis.level === 'high' ? 'bg-orange-50 border-orange-200' : 
              'bg-gray-50 border-gray-200'}`}>
            
            <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${analysis.level === 'very-high' ? 'bg-red-500 text-white' : 'bg-white text-gray-500'}`}>
                    <Siren className="w-6 h-6" />
                </div>
                <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Goal Probability</div>
                    <div className={`text-2xl font-black ${analysis.level === 'very-high' ? 'text-red-600' : 'text-gray-800'}`}>
                        {analysis.score}%
                    </div>
                </div>
            </div>
            <div className="text-right">
                <div className="text-xs text-gray-500">Momentum</div>
                <div className="font-bold text-indigo-600">{analysis.factors.apiMomentum.toFixed(1)}</div>
            </div>
        </div>

        {/* Over/Under Market Chart with Shots */}
        {marketChartData.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Over/Under Market & Shot Timeline
              </h3>
              <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <XAxis
                              type="number"
                              dataKey="minute"
                              name="Minute"
                              unit="'"
                              domain={[0, 90]}
                              ticks={[0, 15, 30, 45, 60, 75, 90]}
                              tick={{ fontSize: 10, fill: '#9ca3af' }}
                              tickLine={false}
                              axisLine={{ stroke: '#e5e7eb' }}
                          />
                          <YAxis
                              type="number"
                              dataKey="handicap"
                              name="HDP"
                              width={45}
                              domain={['dataMin - 0.25', 'dataMax + 0.25']}
                              tick={{ fontSize: 10, fill: '#9ca3af' }}
                              tickLine={false}
                              axisLine={{ stroke: '#e5e7eb' }}
                              allowDecimals={true}
                              tickCount={8}
                          />
                          <ZAxis type="number" dataKey="z" range={[50, 200]} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                          
                          <Scatter name="Market" data={marketChartData} fill="#8884d8">
                              {marketChartData.map((entry, index) => (
                                  <Cell key={`cell-market-${index}`} fill={getOddsColor(entry.over)} />
                              ))}
                          </Scatter>

                          <Scatter name="Shots" data={shotData} shape="circle">
                              {shotData.map((entry, index) => (
                                  <Cell key={`cell-shot-${index}`} fill={entry.fill} />
                              ))}
                          </Scatter>
                      </ScatterChart>
                  </ResponsiveContainer>
                  <OddsColorLegent />
                  <ShotLegend />
              </div>
          </div>
        )}

        {/* Pressure Chart */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                Pressure Timeline
            </h3>
            <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <XAxis 
                            dataKey="minute"
                            type="number"
                            domain={[0, 90]}
                            ticks={[0, 15, 30, 45, 60, 75, 90]}
                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                            unit="'"
                            tickLine={false}
                            axisLine={{ stroke: '#e5e7eb' }}
                         />
                        <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                        <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                            labelStyle={{ color: '#6b7280', fontSize: '12px' }} 
                            formatter={(value: number) => value.toFixed(1)}
                            labelFormatter={(label) => `Minute: ${label}'`}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line type="monotone" dataKey="homePressure" stroke="#2563eb" strokeWidth={2} name="Home" dot={false} />
                        <Line type="monotone" dataKey="awayPressure" stroke="#ea580c" strokeWidth={2} name="Away" dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
            <StatBox label="Attacks" home={stats.attacks[0]} away={stats.attacks[1]} />
            <StatBox label="Dangerous" home={stats.dangerous_attacks[0]} away={stats.dangerous_attacks[1]} highlight />
            <StatBox label="On Target" home={stats.on_target[0]} away={stats.on_target[1]} highlight />
            <StatBox label="Corners" home={stats.corners[0]} away={stats.corners[1]} />
        </div>
      </div>
    </div>
  );
};

const StatBox = ({ label, home, away, highlight }: { label: string, home: number, away: number, highlight?: boolean }) => {
    const total = home + away;
    const homePct = total === 0 ? 50 : (home / total) * 100;
    
    return (
        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
            <div className="text-xs text-gray-400 text-center mb-2 uppercase font-semibold">{label}</div>
            <div className="flex justify-between items-end mb-1">
                <span className={`text-lg font-bold ${highlight ? (home > away ? 'text-blue-600' : 'text-gray-800') : 'text-gray-800'}`}>{home}</span>
                <span className={`text-lg font-bold ${highlight ? (away > home ? 'text-orange-600' : 'text-gray-800') : 'text-gray-800'}`}>{away}</span>
            </div>
            {/* Visual Bar */}
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${homePct}%` }}></div>
                <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${100 - homePct}%` }}></div>
            </div>
        </div>
    );
};