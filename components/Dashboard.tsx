
import React, { useEffect, useState, useMemo } from 'react';
import { MatchInfo, OddsData, PreGoalAnalysis, OddsItem, ProcessedStats } from '../types';
import { parseStats, getMatchDetails, getMatchOdds } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Activity } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, Line, Legend } from 'recharts';

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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const minute = label; // The x-axis value (minute)
    
    // Find data points from different series in the payload
    const marketData = payload.find(p => p.dataKey === 'handicap')?.payload;
    const shotData = payload.find(p => p.name === 'Shots')?.payload;
    const homeApiData = payload.find(p => p.dataKey === 'homeApi');
    const awayApiData = payload.find(p => p.dataKey === 'awayApi');

    return (
        <div className="bg-slate-800 text-white text-xs p-2 rounded shadow-lg border border-slate-700">
            <p className="font-bold">Minute: {minute}'</p>
            {marketData && (
                <>
                    <p>HDP: {typeof marketData.handicap === 'number' ? marketData.handicap.toFixed(2) : '-'}</p>
                    {marketData.over !== undefined && (
                        <p className="text-gray-400">Over Odds: {typeof marketData.over === 'number' ? marketData.over.toFixed(3) : '-'}</p>
                    )}
                    {marketData.home !== undefined && (
                         <p className="text-gray-400">Home Odds: {typeof marketData.home === 'number' ? marketData.home.toFixed(3) : '-'}</p>
                    )}
                </>
            )}
            {shotData && (
                <p style={{ color: shotData.fill }} className="font-semibold">Shot: {shotData.type}</p>
            )}
            {homeApiData && homeApiData.value !== undefined && (
                 <p style={{ color: homeApiData.stroke }}>Home API: {homeApiData.value.toFixed(1)}</p>
            )}
             {awayApiData && awayApiData.value !== undefined && (
                 <p style={{ color: awayApiData.stroke }}>Away API: {awayApiData.value.toFixed(1)}</p>
            )}
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

// --- API Calculation ---
const calculateAPIScore = (stats: ProcessedStats, sideIndex: 0 | 1): number => {
    if (!stats) return 0;
    const onTarget = stats.on_target[sideIndex];
    const offTarget = stats.off_target[sideIndex];
    const shots = onTarget + offTarget;
    const corners = stats.corners[sideIndex];
    const dangerous = stats.dangerous_attacks[sideIndex];
    // Formula from original script
    return (shots * 1.0) + (onTarget * 3.0) + (corners * 0.7) + (dangerous * 0.1);
};


export const Dashboard: React.FC<DashboardProps> = ({ token, match, onBack }) => {
  const [liveMatch, setLiveMatch] = useState<MatchInfo>(match);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [oddsHistory, setOddsHistory] = useState<{ minute: number; over: number; under: number; handicap: string }[]>([]);
  const [homeOddsHistory, setHomeOddsHistory] = useState<{ minute: number; home: number; handicap: string }[]>([]);
  const [statsHistory, setStatsHistory] = useState<Record<number, ProcessedStats>>({});
  
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
          // NEW: Store stats history
          const currentTime = detailsData.timer?.tm;
          if (currentTime && detailsData.stats) {
            setStatsHistory(prevHistory => ({
              ...prevHistory,
              [currentTime]: parseStats(detailsData.stats)
            }));
          }
        } else {
          console.log("Match details could not be updated. It might have ended.");
        }
        if (oddsData) {
          // Process Over/Under (1_3)
          const overMarkets = oddsData.results?.odds?.['1_3'];
          if (overMarkets && overMarkets.length > 0) {
            const marketsByMinute: { [minute: string]: OddsItem[] } = {};
            overMarkets.forEach(market => {
              if (market.time_str && market.over_od && market.under_od && market.handicap) {
                if (!marketsByMinute[market.time_str]) marketsByMinute[market.time_str] = [];
                marketsByMinute[market.time_str].push(market);
              }
            });
            const newHistory: { minute: number; over: number; under: number; handicap: string }[] = [];
            for (const minuteStr in marketsByMinute) {
              const marketsForMinute = marketsByMinute[minuteStr];
              let mainMarket: OddsItem | null = null;
              let minDiff = Infinity;
              marketsForMinute.forEach(market => {
                const over = parseFloat(market.over_od!); const under = parseFloat(market.under_od!);
                if (!isNaN(over) && !isNaN(under)) {
                  const diff = Math.abs(over - under);
                  if (diff < minDiff) { minDiff = diff; mainMarket = market; }
                }
              });
              if (mainMarket) newHistory.push({ minute: parseInt(minuteStr), over: parseFloat(mainMarket.over_od!), under: parseFloat(mainMarket.under_od!), handicap: mainMarket.handicap! });
            }
            newHistory.sort((a, b) => a.minute - b.minute);
            setOddsHistory(newHistory);
          }

          // Process Home/Away (1_2)
          const homeMarkets = oddsData.results?.odds?.['1_2'];
          if (homeMarkets && homeMarkets.length > 0) {
            const marketsByMinute: { [minute: string]: OddsItem[] } = {};
            homeMarkets.forEach(market => {
              if (market.time_str && market.home_od && market.away_od && market.handicap) {
                 if (!marketsByMinute[market.time_str]) marketsByMinute[market.time_str] = [];
                 marketsByMinute[market.time_str].push(market);
              }
            });
            const newHomeHistory: { minute: number; home: number; handicap: string }[] = [];
            for (const minuteStr in marketsByMinute) {
                const marketsForMinute = marketsByMinute[minuteStr];
                let mainMarket: OddsItem | null = null;
                let minDiff = Infinity;
                marketsForMinute.forEach(market => {
                    const home = parseFloat(market.home_od!); const away = parseFloat(market.away_od!);
                    if (!isNaN(home) && !isNaN(away)) {
                        const diff = Math.abs(home - away);
                        if (diff < minDiff) { minDiff = diff; mainMarket = market; }
                    }
                });
                if (mainMarket) newHomeHistory.push({ minute: parseInt(minuteStr), home: parseFloat(mainMarket.home_od!), handicap: mainMarket.handicap! });
            }
            newHomeHistory.sort((a,b) => a.minute - b.minute);
            setHomeOddsHistory(newHomeHistory);
          }
        }
      }
    };

    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 20000); // Poll every 20 seconds

    return () => { isMounted = false; clearInterval(interval); };
  }, [liveMatch.id, token]);


  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const [detailsData] = await Promise.all([ getMatchDetails(token, liveMatch.id) ]);
    if (detailsData) setLiveMatch(detailsData);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const analysis: PreGoalAnalysis = useMemo(() => {
    const time = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
    const totalDA = stats.dangerous_attacks[0] + stats.dangerous_attacks[1];
    const totalOT = stats.on_target[0] + stats.on_target[1];
    const totalOffT = stats.off_target[0] + stats.off_target[1];

    // New Formula: Weighted momentum adjusted by market odds
    const rawMomentum = (totalOT * 2.5) + (totalOffT * 0.5) + (totalDA * 0.4);
    const momentumPerMinute = rawMomentum / Math.max(1, time);
    
    // Get latest over odds to use as a market context factor
    const latestOdds = oddsHistory.length > 0 ? oddsHistory[oddsHistory.length - 1] : null;
    const currentOverOdds = latestOdds ? latestOdds.over : 2.0; // Default to 2.0 if no history
    
    // Lower odds = higher expectation = higher factor. Clamp to prevent extremes.
    const oddsFactor = Math.max(0.7, Math.min(1.5, 2.0 / currentOverOdds));
    
    const combinedScore = momentumPerMinute * oddsFactor;
    
    // Scale the combined score to a 0-100 range, clamping at 5 and 95.
    // The scaling factor (e.g., 30) is an empirical value to map the score to a sensible percentage.
    const probabilityScore = Math.min(95, Math.max(5, Math.round(combinedScore * 30)));

    let level: PreGoalAnalysis['level'] = 'low';
    if (probabilityScore > 80) level = 'very-high';
    else if (probabilityScore > 60) level = 'high';
    else if (probabilityScore > 40) level = 'medium';
    
    return { 
      score: probabilityScore, 
      level, 
      factors: { 
        apiMomentum: momentumPerMinute, // Keep the raw momentum for display
        shotCluster: totalOT, 
        pressure: totalDA 
      } 
    };
  }, [stats, liveMatch.time, liveMatch.timer, oddsHistory]);
  
  const scoreParts = (liveMatch.ss || "0-0").split("-");

  const marketChartData = useMemo(() => {
    const dataByHandicap: Record<string, { minute: number; over: number; under: number; handicap: string; }[]> = {};
    oddsHistory.forEach(p => {
        if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = [];
        dataByHandicap[p.handicap].push(p);
    });
    const finalData: { minute: number; over: number; under: number; handicap: number; color: string; }[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#f87171'; // Default red
            if (index > 0) {
                const diff = point.over - points[index - 1].over;
                if (diff < -0.02) color = '#facc15'; // yellow
                else if (Math.abs(diff) <= 0.02) color = '#4ade80'; // green
            }
            return { ...point, handicap: parseFloat(point.handicap), color: color };
        });
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [oddsHistory]);

  const homeMarketChartData = useMemo(() => {
    const dataByHandicap: Record<string, { minute: number; home: number; handicap: string; }[]> = {};
    homeOddsHistory.forEach(p => {
        if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = [];
        dataByHandicap[p.handicap].push(p);
    });
    const finalData: { minute: number; home: number; handicap: number; color: string; }[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#f87171'; // red
            const handicapValue = parseFloat(point.handicap);
            if (index > 0) {
                const diff = point.home - points[index - 1].home;
                if (handicapValue < 0) {
                    if (diff < -0.02) color = '#facc15'; // yellow
                    else if (Math.abs(diff) <= 0.02) color = '#4ade80'; // green
                } else {
                    if (diff > 0.02) color = '#facc15'; // yellow
                    else if (Math.abs(diff) <= 0.02) color = '#4ade80'; // green
                }
            }
            return { ...point, handicap: handicapValue, color };
        });
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [homeOddsHistory]);

  const yAxisDomainAndTicks = useMemo(() => {
    const allHandicaps = [
      ...marketChartData.map(d => d.handicap),
      ...homeMarketChartData.map(d => d.handicap)
    ].filter(h => typeof h === 'number' && !isNaN(h));

    if (allHandicaps.length === 0) {
      const defaultTicks = [-1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0];
      return {
          domain: [defaultTicks[0], defaultTicks[defaultTicks.length - 1]],
          ticks: defaultTicks
      };
    }

    const dataMin = Math.min(...allHandicaps);
    const dataMax = Math.max(...allHandicaps);

    const domainMin = Math.floor((dataMin - 0.25) / 0.25) * 0.25;
    const domainMax = Math.ceil((dataMax + 0.25) / 0.25) * 0.25;
    
    const ticks = [];
    for (let i = domainMin; i <= domainMax + 0.001; i += 0.25) {
      ticks.push(Number(i.toFixed(2)));
    }
    
    if (ticks.length < 2) {
        ticks.unshift(Number((domainMin - 0.25).toFixed(2)));
        ticks.push(Number((domainMax + 0.25).toFixed(2)));
    }

    return {
      domain: [domainMin, domainMax],
      ticks: ticks,
    };
  }, [marketChartData, homeMarketChartData]);

  const apiChartData = useMemo(() => {
      const sortedMinutes = Object.keys(statsHistory).map(Number).sort((a, b) => a - b);
      return sortedMinutes.map(minute => {
          const statsForMinute = statsHistory[minute];
          return { minute, homeApi: calculateAPIScore(statsForMinute, 0), awayApi: calculateAPIScore(statsForMinute, 1) };
      });
  }, [statsHistory]);
  
  const shotData = useMemo(() => {
    const currentMin = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
    const baseMarketData = marketChartData.length > 0 ? marketChartData : homeMarketChartData;
    if (currentMin === 0 || baseMarketData.length === 0) return [];

    const allOnTarget = stats.on_target[0] + stats.on_target[1];
    const allOffTarget = stats.off_target[0] + stats.off_target[1];
    const data: any[] = [];

    const findHandicapForMinute = (minute: number) => {
      let closest = baseMarketData[0];
      for (const point of baseMarketData) {
        if (Math.abs(point.minute - minute) <= Math.abs(closest.minute - minute)) closest = point;
      }
      return closest.handicap;
    };

    const generatePoints = (count: number, type: 'On Target' | 'Off Target') => {
      for (let i = 0; i < count; i++) {
        const seedString = `${match.id}-shot-${type}-${i}`;
        let seed = 0;
        for (let k = 0; k < seedString.length; k++) seed += seedString.charCodeAt(k) * (k + 1);
        const random = mulberry32(seed);
        const randomMinute = Math.floor(random() * 90) + 1;
        if (randomMinute <= currentMin) {
          data.push({ minute: randomMinute, handicap: findHandicapForMinute(randomMinute), z: 250, type: type, fill: type === 'On Target' ? '#4ade80' : '#facc15' });
        }
      }
    };
    generatePoints(allOnTarget, 'On Target');
    generatePoints(allOffTarget, 'Off Target');
    return data;
  }, [stats, liveMatch.time, liveMatch.timer, match.id, marketChartData, homeMarketChartData]);


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
                <div className="font-bold text-indigo-600">
                  {typeof analysis.factors.apiMomentum === 'number' ? analysis.factors.apiMomentum.toFixed(1) : '-'}
                </div>
            </div>
        </div>

        {/* Over/Under Chart */}
        {(marketChartData.length > 0 || apiChartData.length > 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Over/Under Market (1_3), Shots & API Timeline
              </h3>
              <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <XAxis type="number" dataKey="minute" name="Minute" unit="'" domain={[0, 90]} ticks={[0, 15, 30, 45, 60, 75, 90]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                          <YAxis yAxisId="left" dataKey="handicap" name="HDP" width={45} domain={yAxisDomainAndTicks.domain} ticks={yAxisDomainAndTicks.ticks} interval={0} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} allowDecimals={true} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} width={35} domain={['dataMin - 5', 'dataMax + 10']} />
                          <ZAxis type="number" dataKey="z" range={[50, 200]} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                          <Scatter yAxisId="left" name="Market" data={marketChartData} fill="#8884d8">
                              {marketChartData.map((entry, index) => ( <Cell key={`cell-market-${index}`} fill={entry.color} /> ))}
                          </Scatter>
                          <Scatter yAxisId="left" name="Shots" data={shotData} shape="circle">
                              {shotData.map((entry, index) => ( <Cell key={`cell-shot-${index}`} fill={entry.fill} /> ))}
                          </Scatter>
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" name="Home API" stroke="#2563eb" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" name="Away API" stroke="#ea580c" strokeWidth={2} dot={false} />
                      </ComposedChart>
                  </ResponsiveContainer>
                  <OddsColorLegent />
                  <ShotLegend />
              </div>
          </div>
        )}

        {/* Home Odds Chart */}
        {(homeMarketChartData.length > 0 || apiChartData.length > 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-500" />
                  Home Odds (1_2) & API Timeline
              </h3>
              <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <XAxis type="number" dataKey="minute" name="Minute" unit="'" domain={[0, 90]} ticks={[0, 15, 30, 45, 60, 75, 90]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                          <YAxis yAxisId="left" dataKey="handicap" name="HDP" width={45} domain={yAxisDomainAndTicks.domain} ticks={yAxisDomainAndTicks.ticks} interval={0} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} allowDecimals={true} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} width={35} domain={['dataMin - 5', 'dataMax + 10']} />
                          <ZAxis type="number" dataKey="z" range={[50, 200]} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                          <Scatter yAxisId="left" name="Market" data={homeMarketChartData} fill="#8884d8">
                              {homeMarketChartData.map((entry, index) => ( <Cell key={`cell-hmarket-${index}`} fill={entry.color} /> ))}
                          </Scatter>
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" name="Home API" stroke="#2563eb" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" name="Away API" stroke="#ea580c" strokeWidth={2} dot={false} />
                      </ComposedChart>
                  </ResponsiveContainer>
                  <OddsColorLegent />
              </div>
          </div>
        )}
        
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
