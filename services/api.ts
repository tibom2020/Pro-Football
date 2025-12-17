import { MatchInfo, OddsData } from '../types';

// The previous proxy (corsproxy.io) is being blocked by the API (403 Forbidden).
// Switching to another public proxy to resolve the issue.
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

export const getInPlayEvents = async (token: string): Promise<MatchInfo[]> => {
  if (token === 'DEMO_MODE') {
    return new Promise(resolve => setTimeout(() => resolve(mockMatches), 500));
  }
  if (!token) return [];

  try {
    const targetUrl = `${B365_API_INPLAY}?sport_id=1&token=${token}`;
    const proxiedUrl = `${PROXY_URL}${encodeURIComponent(targetUrl)}`;
    const response = await fetch(proxiedUrl);
    
    if (!response.ok) {
      throw new Error(`Lỗi API: ${response.status}`);
    }

    const text = await response.text();
    if (!text) return [];

    const data = JSON.parse(text);
    if (data.success !== 1 && data.success !== "1") {
        throw new Error(data.error || 'API trả về lỗi nhưng không có thông báo cụ thể.');
    }
    const results = data.results || [];
    // Filter out Esoccer matches
    return results.filter((event: MatchInfo) => 
        event.league && event.league.name && !event.league.name.toLowerCase().includes('esoccer')
    );
  } catch (error) {
    console.error("Không thể tải danh sách trận đấu:", error);
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
    const proxiedUrl = `${PROXY_URL}${encodeURIComponent(targetUrl)}`;
    const response = await fetch(proxiedUrl);
    if (!response.ok) {
        console.error(`Error fetching details for event ${eventId}: Status ${response.status}`);
        return null;
    }
    const text = await response.text();
    if (!text) return null;
    
    const data = JSON.parse(text);
    const results: MatchInfo[] = data.results || [];
    const match = results.find(e => e.id === eventId);
    
    // Also filter here to prevent direct access to an Esoccer match
    if (match && match.league && match.league.name && match.league.name.toLowerCase().includes('esoccer')) {
      return null;
    }
    
    return match || null;
  } catch (error) {
    console.error(`Failed to fetch or parse match details for event ${eventId}`, error);
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
    const proxiedUrl = `${PROXY_URL}${encodeURIComponent(targetUrl)}`;
    const response = await fetch(proxiedUrl);
     if (!response.ok) {
        console.error(`Error fetching odds for event ${eventId}: Status ${response.status}`);
        return null;
    }
    const text = await response.text();
    if (!text) {
        console.warn(`Empty odds response for event ${eventId}`);
        return null;
    }
    const data = JSON.parse(text);
    return data || null;
  } catch (error) {
    console.error(`Failed to fetch or parse odds for event ${eventId}`, error);
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