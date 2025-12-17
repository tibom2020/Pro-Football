import React from 'react';
import { MatchInfo } from '../types';
import { Clock, ChevronRight } from 'lucide-react';

interface MatchListProps {
  events: MatchInfo[];
  onSelectMatch: (id: string) => void;
  isLoading: boolean;
}

export const MatchList: React.FC<MatchListProps> = ({ events, onSelectMatch, isLoading }) => {
  if (isLoading) {
    return <div className="p-8 text-center text-gray-500 animate-pulse">Loading live matches...</div>;
  }

  if (events.length === 0) {
    return <div className="p-8 text-center text-gray-500">No live matches found or check API Token.</div>;
  }

  return (
    <div className="space-y-3 pb-20">
      {events.map((event) => (
        <div 
          key={event.id}
          onClick={() => onSelectMatch(event.id)}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors cursor-pointer"
        >
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-md truncate max-w-[70%]">
              {event.league.name}
            </span>
            <div className="flex items-center text-red-500 text-xs font-bold">
              <Clock className="w-3 h-3 mr-1" />
              {event.timer?.tm || event.time || "0"}'
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex-1 text-right pr-3">
              <div className="font-bold text-gray-900 leading-tight">{event.home.name}</div>
            </div>
            
            <div className="bg-gray-100 px-3 py-1 rounded-lg font-mono font-bold text-lg text-gray-800 tracking-widest">
              {event.ss || "0-0"}
            </div>

            <div className="flex-1 text-left pl-3">
              <div className="font-bold text-gray-900 leading-tight">{event.away.name}</div>
            </div>
          </div>
          
          <div className="mt-3 flex justify-center">
            <span className="text-xs text-gray-400 flex items-center">
              Tap for Analysis <ChevronRight className="w-3 h-3 ml-1" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};