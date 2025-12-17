import React, { useState, useEffect } from 'react';
import { MatchList } from './components/MatchList';
import { Dashboard } from './components/Dashboard';
import { MatchInfo } from './types';
import { getInPlayEvents, getMatchDetails } from './services/api';
import { KeyRound, ShieldCheck } from 'lucide-react';

const App = () => {
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<MatchInfo | null>(null);
  const [events, setEvents] = useState<MatchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load token from local storage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('b365_token');
    if (savedToken) {
      setToken(savedToken);
      setHasToken(true);
    }
  }, []);

  // Fetch events loop
  useEffect(() => {
    if (!hasToken) return;
    
    let isMounted = true;
    const fetchEvents = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getInPlayEvents(token);
        if (isMounted) {
          setEvents(data);
        }
      } catch (err: any) {
        if (isMounted) {
          if (err instanceof TypeError && err.message === 'Failed to fetch') {
            setError('Lỗi mạng hoặc CORS. Vui lòng kiểm tra console của trình duyệt để biết thêm chi tiết.');
          } else {
            setError(err.message || 'Đã xảy ra lỗi không xác định.');
          }
          setEvents([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 20000); // 20s refresh
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [hasToken, token]);

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length > 5) {
      localStorage.setItem('b365_token', token);
      setHasToken(true);
    }
  };

  const handleSelectMatch = async (id: string) => {
    // Optimistic selection from list
    const matchFromList = events.find(e => e.id === id);
    if (matchFromList) setCurrentMatch(matchFromList);
    
    // Fetch full details (if needed separately)
    const details = await getMatchDetails(token, id);
    if (details) setCurrentMatch(details);
  };

  const handleLogout = () => {
    setHasToken(false);
    localStorage.removeItem('b365_token');
    setEvents([]);
    setError(null);
    setCurrentMatch(null);
    setToken('');
  }

  if (!hasToken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="bg-white/10 p-4 rounded-full mb-6 backdrop-blur-md">
            <ShieldCheck className="w-12 h-12 text-blue-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Pro Analytics Access</h1>
        <p className="text-gray-400 text-center mb-8 text-sm">Enter your B365 API Token to access real-time match data and analysis tools.</p>
        
        <form onSubmit={handleTokenSubmit} className="w-full max-w-sm space-y-4">
          <div className="relative">
            <KeyRound className="absolute left-3 top-3.5 text-gray-500 w-5 h-5" />
            <input 
              type="text" 
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste API Token here..." 
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none text-white placeholder-gray-500 transition-all"
            />
          </div>
          <button 
            type="submit" 
            disabled={token.length < 5}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/50"
          >
            Authenticate
          </button>
          <div className="text-center mt-4">
             <a href="#" onClick={(e) => { e.preventDefault(); setToken("DEMO_MODE"); setHasToken(true); }} className="text-xs text-gray-500 underline">Try Demo Mode</a>
          </div>
        </form>
      </div>
    );
  }

  if (currentMatch) {
    return (
      <Dashboard 
        token={token} 
        match={currentMatch} 
        onBack={() => setCurrentMatch(null)} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto shadow-2xl overflow-hidden">
      <div className="bg-white px-5 py-4 sticky top-0 z-10 border-b border-gray-100 flex justify-between items-center">
        <h1 className="text-xl font-black text-slate-800 tracking-tight">Live Matches</h1>
        <button onClick={handleLogout} className="text-xs text-red-500 font-medium">Logout</button>
      </div>
      
      <div className="p-4">
        {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-md" role="alert">
                <p className="font-bold">Lỗi</p>
                <p>{error}</p>
            </div>
        )}
        <MatchList 
          events={events} 
          onSelectMatch={handleSelectMatch} 
          isLoading={loading && events.length === 0 && !error} 
        />
      </div>
    </div>
  );
};

export default App;