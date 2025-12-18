

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MatchInfo, PreGoalAnalysis, OddsItem, ProcessedStats } from '../types';
import { parseStats, getMatchDetails, getMatchOdds } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Scatter, XAxis, YAxis, Tooltip, Cell, Line, Legend } from 'recharts';

// --- Types for Highlights and Shots ---
interface Highlight {
    minute: number;
    level: 'weak' | 'medium' | 'strong';
    label: string;
}
interface AllHighlights {
    overUnder: Highlight[];
    homeOdds: Highlight[];
}
interface ShotEvent {
    minute: number;
    type: 'on' | 'off';
}

interface DashboardProps {
  token: string;
  match: MatchInfo;
  onBack: () => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const minute = label;
    const marketData = payload.find(p => p.dataKey === 'handicap')?.payload;
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

// --- API Calculation ---
const calculateAPIScore = (stats: ProcessedStats | undefined, sideIndex: 0 | 1): number => {
    if (!stats) return 0;
    const onTarget = stats.on_target[sideIndex];
    const offTarget = stats.off_target[sideIndex];
    const shots = onTarget + offTarget;
    const corners = stats.corners[sideIndex];
    const dangerous = stats.dangerous_attacks[sideIndex];
    return (shots * 1.0) + (onTarget * 3.0) + (corners * 0.7) + (dangerous * 0.1);
};

// --- Overlay Components ---
const OverlayContainer = ({ children }: { children: React.ReactNode }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            if (entries[0]) setWidth(entries[0].contentRect.width);
        });
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={containerRef} className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {width > 0 && React.Children.map(children, child =>
                React.isValidElement(child) ? React.cloneElement(child, { containerWidth: width } as any) : child
            )}
        </div>
    );
};

const HighlightBands = ({ highlights, containerWidth }: { highlights: Highlight[], containerWidth?: number }) => {
    if (!containerWidth || highlights.length === 0) return null;
    
    const calculateLeft = (minute: number) => {
        const yAxisLeftWidth = 45;
        const yAxisRightWidth = 35;
        const chartAreaWidth = containerWidth - yAxisLeftWidth - yAxisRightWidth;
        const leftOffset = yAxisLeftWidth;
        return leftOffset + (minute / 90) * chartAreaWidth;
    };

    return <>
        {highlights.map((h, i) => (
            <div key={i} className={`goal-highlight highlight-${h.level}`} style={{ left: `${calculateLeft(h.minute)}px` }}>
                <div className="highlight-label">{h.label}</div>
            </div>
        ))}
    </>;
};

const ShotBalls = ({ shots, containerWidth }: { shots: ShotEvent[], containerWidth?: number }) => {
    if (!containerWidth || shots.length === 0) return null;
    
    const calculateLeft = (minute: number) => {
        const yAxisLeftWidth = 45;
        const yAxisRightWidth = 35;
        const chartAreaWidth = containerWidth - yAxisLeftWidth - yAxisRightWidth;
        const leftOffset = yAxisLeftWidth;
        return leftOffset + (minute / 90) * chartAreaWidth - 10; // Center the ball
    };

    const shotsByMinute = shots.reduce((acc, shot) => {
        if (!acc[shot.minute]) acc[shot.minute] = [];
        acc[shot.minute].push(shot.type);
        return acc;
    }, {} as Record<number, ('on' | 'off')[]>);

    return <>
        {Object.entries(shotsByMinute).map(([minute, types]) => 
            types.map((type, index) => (
                 <div 
                    key={`${minute}-${index}`} 
                    className={`ball-icon ${type === 'on' ? 'ball-on' : 'ball-off'}`}
                    style={{ left: `${calculateLeft(Number(minute))}px`, top: `${6 + index * 24}px` }}
                    title={`Shot ${type}-target at ${minute}'`}
                >
                    ⚽
                </div>
            ))
        )}
    </>;
};

export const Dashboard: React.FC<DashboardProps> = ({ token, match, onBack }) => {
  const [liveMatch, setLiveMatch] = useState<MatchInfo>(match);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [oddsHistory, setOddsHistory] = useState<{ minute: number; over: number; under: number; handicap: string }[]>([]);
  const [homeOddsHistory, setHomeOddsHistory] = useState<{ minute: number; home: number; handicap: string }[]>([]);
  const [statsHistory, setStatsHistory] = useState<Record<number, ProcessedStats>>({});
  const [highlights, setHighlights] = useState<AllHighlights>({ overUnder: [], homeOdds: [] });
  const [shotEvents, setShotEvents] = useState<ShotEvent[]>([]);
  
  const stats = useMemo(() => parseStats(liveMatch.stats), [liveMatch.stats]);

  // --- Persistence Effects ---
  useEffect(() => {
    const savedHistory = localStorage.getItem(`statsHistory_${match.id}`);
    if (savedHistory) setStatsHistory(JSON.parse(savedHistory)); else setStatsHistory({});
    
    const savedHighlights = localStorage.getItem(`highlights_${match.id}`);
    if (savedHighlights) setHighlights(JSON.parse(savedHighlights)); else setHighlights({ overUnder: [], homeOdds: [] });
  }, [match.id]);

  useEffect(() => {
     if (Object.keys(statsHistory).length > 0) {
        localStorage.setItem(`statsHistory_${match.id}`, JSON.stringify(statsHistory));
     }
  }, [statsHistory, match.id]);

  useEffect(() => {
    if (highlights.overUnder.length > 0 || highlights.homeOdds.length > 0) {
        localStorage.setItem(`highlights_${match.id}`, JSON.stringify(highlights));
    }
  }, [highlights, match.id]);

  const marketChartData = useMemo(() => {
    const dataByHandicap: Record<string, { minute: number; over: number; under: number; handicap: string; }[]> = {};
    oddsHistory.forEach(p => {
        if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = [];
        dataByHandicap[p.handicap].push(p);
    });
    const finalData: any[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#f87171', colorName = 'red';
            if (index > 0) {
                const diff = point.over - points[index - 1].over;
                if (diff < -0.02) { color = '#facc15'; colorName = 'yellow'; }
                else if (Math.abs(diff) <= 0.02) { color = '#4ade80'; colorName = 'green'; }
            }
            return { ...point, handicap: parseFloat(point.handicap), color, colorName, highlight: false };
        });
        for (let i = 0; i <= coloredPoints.length - 3; i++) {
            const [b1, b2, b3] = [coloredPoints[i], coloredPoints[i+1], coloredPoints[i+2]];
            if (b3.minute - b1.minute < 5 && (b1.colorName === 'yellow' || b1.colorName === 'green') && b1.colorName === b2.colorName && b2.colorName === b3.colorName && !b1.highlight) {
                b1.highlight = b2.highlight = b3.highlight = true;
            }
        }
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
    const finalData: any[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#f87171', colorName = 'red';
            const handicapValue = parseFloat(point.handicap);
            if (index > 0) {
                const diff = point.home - points[index - 1].home;
                if (handicapValue < 0) {
                    if (diff < -0.02) { color = '#facc15'; colorName = 'yellow'; }
                    else if (Math.abs(diff) <= 0.02) { color = '#4ade80'; colorName = 'green'; }
                } else {
                    if (diff > 0.02) { color = '#facc15'; colorName = 'yellow'; }
                    else if (Math.abs(diff) <= 0.02) { color = '#4ade80'; colorName = 'green'; }
                }
            }
            return { ...point, handicap: handicapValue, color, colorName, highlight: false };
        });
        for (let i = 0; i <= coloredPoints.length - 3; i++) {
            const [b1, b2, b3] = [coloredPoints[i], coloredPoints[i+1], coloredPoints[i+2]];
            if (b3.minute - b1.minute < 5 && (b1.colorName === 'yellow' || b1.colorName === 'green') && b1.colorName === b2.colorName && b2.colorName === b3.colorName && !b1.highlight) {
                b1.highlight = b2.highlight = b3.highlight = true;
            }
        }
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [homeOddsHistory]);

  const runPatternDetection = useCallback(() => {
    const currentMinute = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
    if (!currentMinute || currentMinute < 10) return;

    const normalize = (val: number, maxVal: number) => Math.max(0, Math.min(1, val / (maxVal || 1)));
    const allTimes = Object.keys(statsHistory).map(Number).sort((a,b)=>a-b);

    const getAPIMomentumAt = (minute: number, window: number) => {
        const currentTotal = calculateAPIScore(statsHistory[minute], 0) + calculateAPIScore(statsHistory[minute], 1);
        const pastMinute = Math.max(0, minute - window);
        const pastTimes = allTimes.filter(t => t <= pastMinute);
        const pastTime = pastTimes.length > 0 ? Math.max(...pastTimes) : (allTimes[0] || 0);
        const pastTotal = calculateAPIScore(statsHistory[pastTime], 0) + calculateAPIScore(statsHistory[pastTime], 1);
        return currentTotal - pastTotal;
    };
    
    const getBubbleIntensity = (chartData: any[], minute: number, range: number) => {
        return chartData.filter(b => b.minute >= minT && b.minute <= minute && (b.colorName==='green' || b.colorName==='yellow' || b.highlight))
                        .reduce((acc, b) => acc + (b.highlight ? 1.6 : 1.0), 0);
    };

    const getShotClusterScore = (minute: number, window: number) => {
        const minT = Math.max(0, minute - window + 1);
        let score = 0;
        allTimes.filter(t => t >= minT && t <= minute).forEach(t => {
            const s = statsHistory[t];
            if (s) score += (s.on_target[0] + s.on_target[1]) * 3.0 + (s.off_target[0] + s.off_target[1]) * 1.0;
        });
        return score;
    };
    
    const apiMomentum = getAPIMomentumAt(currentMinute, 5);
    const apiNorm = normalize(apiMomentum, 8);

    const bubbleOver = getBubbleIntensity(marketChartData, currentMinute, 3);
    const bubbleHome = getBubbleIntensity(homeMarketChartData, currentMinute, 3);
    const bubbleNorm = normalize(bubbleOver + bubbleHome, 8);

    const shots = getShotClusterScore(currentMinute, 5);
    const shotsNorm = normalize(shots, 6);

    let score = (0.20 * apiNorm) + (0.55 * bubbleNorm) + (0.25 * shotsNorm);
    if (apiNorm < 0.15) score *= 0.4;
    if (bubbleNorm > 0.6 && apiNorm > 0.5) score += 0.15;
    score = Math.min(score, 1.0);

    let level: Highlight['level'] | null = null;
    if (score >= 0.78) level = 'strong';
    else if (score >= 0.62) level = 'medium';
    else if (score >= 0.45) level = 'weak';
    
    if (level) {
        const newHighlight: Highlight = { minute: currentMinute, level, label: `${Math.round(score * 100)}%` };
        setHighlights(prev => {
            const alreadyExists = prev.overUnder.some(h => h.minute === newHighlight.minute);
            if (!alreadyExists) {
                return {
                    overUnder: [...prev.overUnder, newHighlight],
                    homeOdds: [...prev.homeOdds, newHighlight]
                };
            }
            return prev;
        });
    }
  }, [liveMatch.timer, liveMatch.time, statsHistory, marketChartData, homeMarketChartData]);

  // Main Data Fetching Effect
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
          const currentTime = detailsData.timer?.tm;
          if (currentTime && detailsData.stats) {
            setStatsHistory(prev => ({ ...prev, [currentTime]: parseStats(detailsData.stats) }));
          }
        }
        if (oddsData) {
            const overMarkets = oddsData.results?.odds?.['1_3'];
            if (overMarkets) {
                // Simplified processing, assuming main market is what we get
                const newHistory = overMarkets
                    .filter(m => m.time_str && m.over_od && m.under_od && m.handicap)
                    .map(m => ({ minute: parseInt(m.time_str), over: parseFloat(m.over_od!), under: parseFloat(m.under_od!), handicap: m.handicap! }))
                    .sort((a, b) => a.minute - b.minute);
                setOddsHistory(newHistory);
            }
            const homeMarkets = oddsData.results?.odds?.['1_2'];
            if (homeMarkets) {
                const newHomeHistory = homeMarkets
                    .filter(m => m.time_str && m.home_od && m.away_od && m.handicap)
                    .map(m => ({ minute: parseInt(m.time_str), home: parseFloat(m.home_od!), handicap: m.handicap! }))
                    .sort((a,b) => a.minute - b.minute);
                setHomeOddsHistory(newHomeHistory);
            }
        }
        // Run detection after data update
        runPatternDetection();
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 20000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [liveMatch.id, token, runPatternDetection]);
  
  // Effect to update shot events from stats history
  useEffect(() => {
      const allTimes = Object.keys(statsHistory).map(Number).sort((a,b)=>a-b);
      if (allTimes.length < 2) return;
      const newShots: ShotEvent[] = [];
      for(let i=1; i<allTimes.length; i++) {
          const t = allTimes[i];
          const prevT = allTimes[i-1];
          const stat = statsHistory[t];
          const prevStat = statsHistory[prevT];
          if(!stat || !prevStat) continue;

          const onTargetDelta = (stat.on_target[0] + stat.on_target[1]) - (prevStat.on_target[0] + prevStat.on_target[1]);
          const offTargetDelta = (stat.off_target[0] + stat.off_target[1]) - (prevStat.off_target[0] + prevStat.off_target[1]);
          
          for(let j=0; j<onTargetDelta; j++) newShots.push({ minute: t, type: 'on' });
          for(let j=0; j<offTargetDelta; j++) newShots.push({ minute: t, type: 'off' });
      }
      setShotEvents(newShots);
  }, [statsHistory]);

  // FIX: An unclosed comment was causing parsing errors. Also, implemented a simple refresh logic.
  const handleRefresh = async () => {
    setIsRefreshing(true);
    const details = await getMatchDetails(token, liveMatch.id);
    if (details) {
      setLiveMatch(details);
    }
    setIsRefreshing(false);
  };
  const analysis: PreGoalAnalysis = useMemo(() => { return {score:0, level:'low', factors:{apiMomentum:0, shotCluster:0, pressure:0}}}, []);
  const scoreParts = (liveMatch.ss || "0-0").split("-");

  const yAxisDomainAndTicks = useMemo(() => {
      const defaultTicks = [-1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0];
      return { domain: [-1,1], ticks: defaultTicks };
  }, [marketChartData, homeMarketChartData]);
  
  const apiChartData = useMemo(() => {
      const sortedMinutes = Object.keys(statsHistory).map(Number).sort((a, b) => a - b);
      return sortedMinutes.map(minute => ({ minute, homeApi: calculateAPIScore(statsHistory[minute], 0), awayApi: calculateAPIScore(statsHistory[minute], 1) }));
  }, [statsHistory]);
  
  return (
    <div className="pb-10">
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
        <div className={`rounded-2xl p-4 flex items-center justify-between shadow-sm border ${analysis.level === 'very-high' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${analysis.level === 'very-high' ? 'bg-red-500 text-white' : 'bg-white text-gray-500'}`}><Siren className="w-6 h-6" /></div>
                <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Goal Probability</div>
                    <div className={`text-2xl font-black ${analysis.level === 'very-high' ? 'text-red-600' : 'text-gray-800'}`}>{analysis.score}%</div>
                </div>
            </div>
            <div className="text-right">
                <div className="text-xs text-gray-500">Momentum</div>
                <div className="font-bold text-indigo-600">{typeof analysis.factors.apiMomentum === 'number' ? analysis.factors.apiMomentum.toFixed(1) : '-'}</div>
            </div>
        </div>

        {(marketChartData.length > 0 || apiChartData.length > 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" />Over/Under Market (1_3) & API Timeline</h3>
              <div className="relative h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <XAxis type="number" dataKey="minute" name="Minute" unit="'" domain={[0, 90]} ticks={[0, 15, 30, 45, 60, 75, 90]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                          <YAxis yAxisId="left" dataKey="handicap" name="HDP" width={45} domain={yAxisDomainAndTicks.domain} ticks={yAxisDomainAndTicks.ticks} interval={0} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} allowDecimals={true} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} width={35} domain={['dataMin - 5', 'dataMax + 10']} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                          <Scatter yAxisId="left" name="Market" data={marketChartData} fill="#8884d8">{marketChartData.map((e, i) => ( <Cell key={`c-${i}`} fill={e.color} /> ))}</Scatter>
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" name="Home API" stroke="#2563eb" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" name="Away API" stroke="#ea580c" strokeWidth={2} dot={false} />
                      </ComposedChart>
                  </ResponsiveContainer>
                  <OverlayContainer>
                      <HighlightBands highlights={highlights.overUnder} />
                      <ShotBalls shots={shotEvents} />
                  </OverlayContainer>
                  <OddsColorLegent />
              </div>
          </div>
        )}

        {(homeMarketChartData.length > 0 || apiChartData.length > 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-purple-500" />Home Odds (1_2) & API Timeline</h3>
              <div className="relative h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <XAxis type="number" dataKey="minute" name="Minute" unit="'" domain={[0, 90]} ticks={[0, 15, 30, 45, 60, 75, 90]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                          <YAxis yAxisId="left" dataKey="handicap" name="HDP" width={45} domain={yAxisDomainAndTicks.domain} ticks={yAxisDomainAndTicks.ticks} interval={0} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} allowDecimals={true} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} width={35} domain={['dataMin - 5', 'dataMax + 10']} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                          <Scatter yAxisId="left" name="Market" data={homeMarketChartData} fill="#8884d8">{homeMarketChartData.map((e, i) => ( <Cell key={`c-${i}`} fill={e.color} /> ))}</Scatter>
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" name="Home API" stroke="#2563eb" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" name="Away API" stroke="#ea580c" strokeWidth={2} dot={false} />
                      </ComposedChart>
                  </ResponsiveContainer>
                   <OverlayContainer>
                      <HighlightBands highlights={highlights.homeOdds} />
                      <ShotBalls shots={shotEvents} />
                  </OverlayContainer>
                  <OddsColorLegent />
              </div>
          </div>
        )}
        
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
                <span className={`text-lg font-bold ${highlight && home > away ? 'text-blue-600' : 'text-gray-800'}`}>{home}</span>
                <span className={`text-lg font-bold ${highlight && away > home ? 'text-orange-600' : 'text-gray-800'}`}>{away}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${homePct}%` }}></div>
                <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${100 - homePct}%` }}></div>
            </div>
        </div>
    );
};