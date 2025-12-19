
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
 * Performs a proxied fetch and handles common API/Proxy errors with retry logic for 429.
 */
const safeFetch = async (url: string, retries = 0): Promise<any> => {
    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY_MS = 2000; // 2 seconds

    const proxiedUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
    
    try {
        const response = await fetch(proxiedUrl);
        
        if (response.status === 403) {
          throw new Error("Lỗi truy cập (403). B365 hoặc Proxy đang chặn yêu cầu này. Vui lòng kiểm tra lại Token API hoặc thử lại sau.");
        }
        
        if (response.status === 429) {
          if (retries < MAX_RETRIES) {
            const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retries);
            console.warn(`Quá nhiều yêu cầu (429). Đang thử lại sau ${delay / 1000} giây... (Lần thử: ${retries + 1}/${MAX_RETRIES})`);
            await new Promise(res => setTimeout(res, delay));
            return safeFetch(url, retries + 1); // Retry the fetch
          } else {
            throw new Error("Quá nhiều yêu cầu (429). Đã đạt giới hạn tần suất của Proxy sau nhiều lần thử. Vui lòng chờ một lát rồi thử lại.");
          }
        }

        if (!response.ok) {
          throw new Error(`Lỗi kết nối: ${response.status} ${response.statusText}. Vui lòng kiểm tra kết nối mạng của bạn.`);
        }

        const text = await response.text();
        // If the response is empty, return null gracefully instead of throwing an error
        if (!text || text.trim().length === 0) {
            console.warn(`API đã trả về phản hồi trống cho URL: ${url}. Đang xử lý như không có dữ liệu.`);
            return null; 
        }

        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("Lỗi phân tích JSON. Phản hồi thô:", text);
            throw new Error("Phản hồi API không phải là JSON hợp lệ. Đảm bảo Token của bạn là chính xác.");
        }
    } catch (error) {
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            throw new Error('Lỗi mạng hoặc CORS. Vui lòng kiểm tra kết nối internet hoặc cài đặt CORS của trình duyệt.');
        }
        throw error;
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
    
    if (data === null) { // Handle graceful null return for empty response
        console.warn(`getInPlayEvents: Nhận được phản hồi trống. Không có sự kiện nào được tải.`);
        return [];
    }
    
    if (data.success !== 1 && data.success !== "1") {
        throw new Error(data.error || 'API đã trả về trạng thái thất bại.');
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

    if (data === null) { // Handle graceful null return for empty response
        console.warn(`getMatchDetails: Nhận được phản hồi trống cho sự kiện ${eventId}.`);
        return null;
    }
    
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
    
    if (data === null) { // Handle graceful null return for empty response
        console.warn(`getMatchOdds: Nhận được phản hồi trống hoặc không có dữ liệu tỷ lệ cược cho sự kiện ${eventId}.`);
        return null;
    }

    if (!data || data.success === 0 || data.success === "0") {
        console.warn(`API báo cáo lỗi khi lấy tỷ lệ cược cho sự kiện ${eventId}:`, data?.error || 'Lỗi không xác định');
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