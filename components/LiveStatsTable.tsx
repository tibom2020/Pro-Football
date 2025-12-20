

import React, { useMemo } from 'react';
import { MatchInfo, ProcessedStats } from '../types';

interface LiveStatsTableProps {
  liveMatch: MatchInfo;
  oddsHistory: { minute: number; over: number; under: number; handicap: string }[];
  homeOddsHistory: { minute: number; home: number; handicap: string }[];
  apiChartData: { minute: number; homeApi: number; awayApi: number }[];
}

export const LiveStatsTable: React.FC<LiveStatsTableProps> = ({
  liveMatch,
  oddsHistory,
  homeOddsHistory,
  apiChartData,
}) => {
  const currentMinute = useMemo(() => liveMatch.timer?.tm || liveMatch.time || '0', [liveMatch.timer, liveMatch.time]);

  const latestOdds = useMemo(() => {
    if (oddsHistory.length === 0) return null;
    return oddsHistory[oddsHistory.length - 1]; // Get the last (latest) entry
  }, [oddsHistory]);

  const latestHomeOdds = useMemo(() => {
    if (homeOddsHistory.length === 0) return null;
    return homeOddsHistory[homeOddsHistory.length - 1]; // Get the last (latest) entry
  }, [homeOddsHistory]);

  const latestApiScores = useMemo(() => {
    if (apiChartData.length === 0) return null;
    return apiChartData[apiChartData.length - 1]; // Get the last (latest) entry
  }, [apiChartData]);

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mt-4">
      <h3 className="text-sm font-bold text-gray-700 mb-3">Thống kê trực tiếp</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <StatItem label="HDP Đội nhà" value={latestHomeOdds?.handicap ? parseFloat(latestHomeOdds.handicap).toFixed(2) : '-'} />
        <StatItem label="HDP Tài/Xỉu" value={latestOdds?.handicap ? parseFloat(latestOdds.handicap).toFixed(2) : '-'} />
        <StatItem label="Tỷ lệ Đội nhà" value={latestHomeOdds?.home ? latestHomeOdds.home.toFixed(3) : '-'} />
        <StatItem label="Tỷ lệ Tài" value={latestOdds?.over ? latestOdds.over.toFixed(3) : '-'} />
        <StatItem label="API Đội nhà" value={latestApiScores?.homeApi ? latestApiScores.homeApi.toFixed(1) : '-'} color="text-blue-600" />
        <StatItem label="API Đội khách" value={latestApiScores?.awayApi ? latestApiScores.awayApi.toFixed(1) : '-'} color="text-orange-600" />
      </div>
    </div>
  );
};

const StatItem: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex justify-between items-center border-b border-gray-100 last:border-b-0 py-1">
    <span className="text-gray-500 font-medium">{label}:</span>
    <span className={`font-bold ${color || 'text-gray-800'}`}>{value}</span>
  </div>
);