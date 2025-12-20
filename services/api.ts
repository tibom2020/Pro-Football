
import { MatchInfo, OddsData, ProcessedStats, AIPredictionResponse } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

/**
 * PROXY STRATEGY:
 * B365 API often blocks common public proxies like allorigins or corsproxy.io.
 * For personal projects, a private proxy like a Cloudflare Worker is recommended
 * for better reliability and and custom logic.
 *
 * REPLACE THE URL BELOW WITH YOUR OWN CLOUDFLARE WORKER URL.
 * Example: "https://YOUR_WORKER_NAME.YOUR_SUBDOMAIN.workers.dev/"
 * Make sure your Worker is configured to forward the 'target' query parameter
 * and correctly sets CORS headers.
 */
const PROXY_URL = "https://long-tooth-f7a5.phanvietlinh-0b1.workers.dev/"; 

const B365_API_INPLAY = "https://api.b365api.com/v3/events/inplay";
const B365_API_ODDS = "https://api.b365api.com/v2/event/odds";

// --- Client-side Rate Limiting Configuration ---
// Enforce a strict minimum 30-second interval between ANY two API calls to provide a robust buffer against proxy's 20s limit.
const MIN_API_CALL_INTERVAL = 30 * 1000; // 30 seconds
let lastApiCallTime = 0; // Timestamp of the last API call initiated

/**
 * Ensures that API requests adhere to a strict client-side rate limit.
 * Will pause execution if the limit would be exceeded.
 */
const enforceRateLimit = async () => {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCallTime;

    if (timeSinceLastCall < MIN_API_CALL_INTERVAL) {
        const waitTime = MIN_API_CALL_INTERVAL - timeSinceLastCall;
        console.warn(`Client-side rate limit active. Waiting ${waitTime / 1000}s before next API call.`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    // Update last API call time *after* any potential wait, and *before* the fetch attempt.
    // This marks the start of the "next" allowed interval.
    lastApiCallTime = Date.now(); 
};


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
            "1_2": [], // Mock for home/away odds
            "1_3": [ // Mock for over/under odds
                { id: '1', over_od: '1.85', under_od: '1.95', handicap: '2.5', time_str: '0', add_time: '0' }
            ]
        }
    }
};

/**
 * Performs a proxied fetch and handles common API/Proxy errors with retry logic for 429.
 * Applies client-side rate limit before each fetch attempt.
 */
const safeFetch = async (url: string, retries = 0): Promise<any> => {
    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY_MS = 2000; // 2 seconds

    // Apply client-side rate limit before attempting fetch
    await enforceRateLimit();

    // Construct the proxied URL for your Cloudflare Worker
    // The worker expects the original B365 URL as a 'target' query parameter
    const proxiedUrl = `${PROXY_URL}?target=${encodeURIComponent(url)}`;
    
    try {
        const response = await fetch(proxiedUrl);
        
        if (response.status === 403) {
          throw new Error("Lỗi truy cập (403). B365 hoặc Proxy đang chặn yêu cầu này. Vui lòng kiểm tra lại Token API hoặc thử lại sau.");
        }
        
        if (response.status === 429) {
          if (retries < MAX_RETRIES) {
            const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retries);
            console.warn(`Quá nhiều yêu cầu (429) từ Proxy. Đang thử lại sau ${delay / 1000} giây... (Lần thử: ${retries + 1}/${MAX_RETRIES})`);
            await new Promise(res => setTimeout(res, delay));
            return safeFetch(url, retries + 1); // Retry the fetch
          } else {
            // Updated 429 error message
            throw new Error("Quá nhiều yêu cầu (429). Đã đạt giới hạn tần suất của Proxy sau nhiều lần thử. Vui lòng kiểm tra cấu hình Rate Limiter của Cloudflare Worker và thử lại sau 20-40 giây.");
          }
        }

        if (!response.ok) {
            // Enhanced error message for clarity
            throw new Error(`Lỗi kết nối: ${response.status} ${response.statusText}. Vui lòng kiểm tra kết nối mạng của bạn hoặc trạng thái của Cloudflare Worker.`);
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
            throw new Error("Phản hồi API không phải là JSON hợp lệ. Đảm bảo Token của bạn là chính xác và Worker hoạt động đúng.");
        }
    } catch (error) {
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            // Enhanced error message for network/CORS
            throw new Error('Lỗi mạng hoặc CORS. Vui lòng kiểm tra kết nối internet, đảm bảo Cloudflare Worker của bạn đang hoạt động và đã được cấu hình CORS chính xác (Access-Control-Allow-Origin: *).');
        }
        throw error;
    }
};

export const getInPlayEvents = async (token: string): Promise<MatchInfo[]> => {
  if (token === 'DEMO_MODE') {
    // Return a deep copy of mockMatches to ensure immutability and reliability in demo mode
    return new Promise(resolve => setTimeout(() => resolve(JSON.parse(JSON.stringify(mockMatches))), 500));
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
    // Also return a deep copy for a specific match in demo mode
    const match = JSON.parse(JSON.stringify(mockMatches)).find((e: MatchInfo) => e.id === eventId) || null;
    return new Promise(resolve => setTimeout(() => resolve(match), 200));
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
    // Return a deep copy of mockOdds for demo mode
    return new Promise(resolve => setTimeout(() => resolve(JSON.parse(JSON.stringify(mockOdds))), 100));
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

// --- Gemini AI Integration ---
// Initialize GoogleGenAI client
// Uses process.env.API_KEY which will be defined via vite.config.ts for client-side access.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export async function getGeminiGoalPrediction(
  matchId: string,
  currentMinute: number,
  homeTeamName: string,
  awayTeamName: string,
  homeScore: number,
  awayScore: number,
  currentStats: ProcessedStats | undefined,
  homeApi: number,
  awayApi: number,
  latestOverOdds: { handicap: string; over: number; under: number } | null,
  latestHomeOdds: { handicap: string; home: number; away: number } | null,
  apiMomentum: number,
  shotCluster: number,
  pressure: number,
): Promise<AIPredictionResponse | null> {
  // Check for the API key. It's expected to be injected via vite.config.ts if running in browser.
  if (!process.env.API_KEY) {
    console.error("Gemini API Key (API_KEY) is not set. Please ensure it's configured in your environment variables (e.g., .env for local dev, Vercel dashboard for deployment) and that vite.config.ts defines it.");
    return null;
  }

  const generateStatsText = (stats: ProcessedStats | undefined) => {
    if (!stats) return "N/A";
    return `
      Tấn công của đội nhà: ${stats.attacks[0]}, Tấn công của đội khách: ${stats.attacks[1]}
      Tấn công nguy hiểm của đội nhà: ${stats.dangerous_attacks[0]}, Tấn công của đội khách: ${stats.dangerous_attacks[1]}
      Sút trúng đích của đội nhà: ${stats.on_target[0]}, Sút trúng đích của đội khách: ${stats.on_target[1]}
      Sút chệch đích của đội nhà: ${stats.off_target[0]}, Sút chệch đích của đội khách: ${stats.off_target[1]}
      Phạt góc của đội nhà: ${stats.corners[0]}, Phạt góc của đội khách: ${stats.corners[1]}
      Thẻ vàng của đội nhà: ${stats.yellowcards[0]}, Thẻ vàng của đội khách: ${stats.yellowcards[1]}
      Thẻ đỏ của đội nhà: ${stats.redcards[0]}, Thẻ đỏ của đội khách: ${stats.redcards[1]}
    `;
  };

  const generateOddsText = (
    overOdds: { handicap: string; over: number; under: number } | null,
    homeOdds: { handicap: string; home: number; away: number } | null,
  ) => {
    let oddsText = "";
    if (overOdds) {
      oddsText += `Tỷ lệ Kèo Tài/Xỉu (Handicap): ${overOdds.handicap} (Kèo Tài: ${overOdds.over}, Kèo Xỉu: ${overOdds.under})\n`;
    }
    if (homeOdds) {
      oddsText += `Tỷ lệ Kèo Châu Á (Handicap): ${homeOdds.handicap} (Kèo Đội nhà: ${homeOdds.home}, Kèo Đội khách: ${homeOdds.away})\n`;
    }
    return oddsText || "Không có tỷ lệ cược mới nhất.";
  };

  const promptContent = `
    Bạn là một chuyên gia phân tích trận đấu bóng đá với kiến thức sâu sắc về động lực trận đấu và thị trường cá cược.
    Dựa trên các số liệu thống kê trận đấu thời gian thực, tỷ số hiện tại, tỷ lệ cược và các yếu tố phân tích truyền thống sau đây,
    hãy dự đoán xác suất có bàn thắng được ghi trong *5 phút tiếp theo* của trận đấu.
    Cung cấp dự đoán của bạn dưới dạng phần trăm (0-100), mức độ tin cậy và một lý do ngắn gọn.
    Tất cả các phần trong phản hồi (bao gồm lý do và mức độ tin cậy) phải bằng tiếng Việt.

    ID trận đấu: ${matchId}
    Phút hiện tại: ${currentMinute}
    Tỷ số: ${homeScore}-${awayScore}
    Đội nhà: ${homeTeamName}, Đội khách: ${awayTeamName}

    --- Thống kê trực tiếp ---
    ${generateStatsText(currentStats)}
    Điểm API đội nhà: ${homeApi.toFixed(1)}, Điểm API đội khách: ${awayApi.toFixed(1)}

    --- Tỷ lệ cược mới nhất ---
    ${generateOddsText(latestOverOdds, latestHomeOdds)}

    --- Các yếu tố phân tích truyền thống ---
    Động lực API (5 phút gần nhất): ${apiMomentum.toFixed(1)}
    Cụm sút (tổng số cú sút 5 phút gần nhất): ${shotCluster.toFixed(1)}
    Áp lực (từ biến động tỷ lệ cược): ${pressure.toFixed(1)}

    --- Định dạng đầu ra ---
    Xuất dự đoán của bạn TUYỆT ĐỐI theo định dạng JSON, tuân thủ schema sau. KHÔNG bao gồm bất kỳ văn bản nào khác trước hoặc sau JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Use gemini-3-flash-preview
      contents: [{ parts: [{ text: promptContent }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            goal_probability: {
              type: Type.INTEGER,
              description: 'Xác suất bàn thắng được ghi trong 5 phút tiếp theo, dưới dạng phần trăm (0-100).'
            },
            confidence_level: {
              type: Type.STRING,
              description: 'Mức độ tin cậy của dự đoán (thấp, trung bình, cao, rất cao).',
              enum: ['thấp', 'trung bình', 'cao', 'rất cao'] // Vietnamese enum
            },
            reasoning: {
              type: Type.STRING,
              description: 'Một giải thích ngắn gọn, súc tích cho dự đoán này (bằng tiếng Việt).'
            }
          },
          required: ['goal_probability', 'confidence_level'],
          propertyOrdering: ['goal_probability', 'confidence_level', 'reasoning']
        },
        temperature: 0.5, // Lower temperature for more deterministic output
        topK: 40,
        topP: 0.95,
      },
    });

    const jsonStr = response.text.trim();
    if (jsonStr) {
      try {
        const parsedResponse: AIPredictionResponse = JSON.parse(jsonStr);
        return parsedResponse;
      } catch (jsonError) {
        console.error("Failed to parse Gemini JSON response:", jsonError, "Raw response:", jsonStr);
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini API call failed:", error);
    // You might want to throw a more specific error or handle it in Dashboard.tsx
    return null;
  }
}