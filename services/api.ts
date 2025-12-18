
import { MatchInfo, OddsData } from '../types';

/**
 * PROXY STRATEGY:
 * B365 API often blocks common public proxies like allorigins or corsproxy.io.
 * codetabs.com is a reliable alternative that frequently bypasses these filters.
 */
const PROXY_URL = "https://api.codetabs.com/v1/proxy?quest=";

const B365_API_INPLAY = "https://api.b365api.com/v3/events/inplay";
const B365_API_ODDS = "https://api.b365api.com/v2/event/odds";

const mockMatches: MatchInfo[] = [
  {
    id: "1",
    league: { name: "Premier League - Demo" },
    home: { name: "Manchester United" },
    away: { name: "Liverpool" },
    ss: "1-1",
    time: "65",
    timer: { tm: 65, ts: 0, tt: "1", ta: 0, md: 0 },
    stats: {
      attacks: ["60", "75"],
      dangerous_attacks: ["35", "50"],
      on_target: ["5", "8"],
      off_target: ["4", "6"],
      corners: ["3", "5"],
      yellowcards: ["1", "2"],
      redcards: ["0", "0"],
    },
  },
  {
    id: "2",
    league: { name: "La Liga - Demo" },
    home: { name: "Real Madrid" },
    away: { name: "Barcelona" },
    ss: "2-0",
    time: "78",
    timer: { tm: 78, ts: 0, tt: "1", ta: 0, md: 0 },
    stats: {
      attacks: ["80", "50"],
      dangerous_attacks: ["60", "25"],
      on_target: ["10", "2"],
      off_target: ["7", "3"],
      corners: ["8", "1"],
      yellowcards: ["0", "3"],
      redcards: ["0", "0"],
    },
  },
];

const mockOdds: OddsData = {
    results: {
        odds: {
            "1_2": [],
            "1_3": [
                { id: '1', over_od: '1.85', under_od: '1.95', handicap: '2.5', time_str: '0', add_time: '0' }
            ]
        }
    }
};

/**
 * Performs a proxied fetch and handles common API/Proxy errors.
 */
const safeFetch = async (url: string) => {
    const proxiedUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
    const response = await fetch(proxiedUrl);
    
    if (response.status === 403) {
      throw new Error("Access Forbidden (403). B365 or the Proxy is blocking this request. Check your API Token or try again later.");
    }
    
    if (response.status === 429) {
      throw new Error("Too Many Requests (429). Proxy rate limit reached.");
    }

    if (!response.ok) {
      throw new Error(`Connection Error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) {
        throw new Error("The API returned an empty response.");
    }

    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("JSON Parse Error. Raw response:", text);
        throw new Error("The API response was not valid JSON. Ensure your token is correct.");
    }
};

export const getInPlayEvents = async (token: string): Promise<MatchInfo[]> => {
  if (token === 'DEMO_MODE') {
    return new Promise(resolve => setTimeout(() => resolve(mockMatches), 500));
  }
  if (!token) return [];

  try {
    const targetUrl = `${B365_API_INPLAY}?sport_id=1&token=${token}`;
    const data = await safeFetch(targetUrl);
    
    if (data.success !== 1 && data.success !== "1") {
        throw new Error(data.error || 'The API returned a failure status.');
    }
    
    const results = data.results || [];
    return results.filter((event: MatchInfo) => 
        event.league && event.league.name && !event.league.name.toLowerCase().includes('esoccer')
    );
  } catch (error) {
    console.error("Failed to load match list:", error);
    throw error;
  }
};

export const getMatchDetails = async (token: string, eventId: string): Promise<MatchInfo | null> => {
  if (token === 'DEMO_MODE') {
    return mockMatches.find(e => e.id === eventId) || null;
  }
  if (!token || !eventId) return null;
  try {
    const targetUrl = `${B365_API_INPLAY}?sport_id=1&token=${token}`;
    const data = await safeFetch(targetUrl);
    
    const results: MatchInfo[] = data.results || [];
    const match = results.find(e => e.id === eventId);
    
    if (match && match.league && match.league.name && match.league.name.toLowerCase().includes('esoccer')) {
      return null;
    }
    
    return match || null;
  } catch (error) {
    console.error(`Failed to fetch match details for event ${eventId}:`, error);
    return null;
  }
};

export const getMatchOdds = async (token: string, eventId: string): Promise<OddsData | null> => {
  if (token === 'DEMO_MODE') {
    return mockOdds;
  }
  if (!token || !eventId) return null;
  try {
    const targetUrl = `${B365_API_ODDS}?token=${token}&event_id=${eventId}`;
    const data = await safeFetch(targetUrl);
    
    if (!data || data.success === 0 || data.success === "0") {
        console.warn(`API reported failure fetching odds for event ${eventId}:`, data?.error || 'Unknown error');
        return null;
    }
    return data || null;
  } catch (error) {
    console.error(`Failed to fetch odds for event ${eventId}:`, error);
    return null;
  }
};

export const parseStats = (stats: Record<string, string[]> | undefined) => {
  const parse = (key: string): [number, number] => {
    const arr = stats?.[key];
    if (arr && arr.length === 2) {
      return [parseInt(arr[0] || '0'), parseInt(arr[1] || '0')];
    }
    return [0, 0];
  };

  return {
    attacks: parse('attacks'),
    dangerous_attacks: parse('dangerous_attacks'),
    on_target: parse('on_target'),
    off_target: parse('off_target'),
    corners: parse('corners'),
    yellowcards: parse('yellowcards'),
    redcards: parse('redcards'),
  };
};
