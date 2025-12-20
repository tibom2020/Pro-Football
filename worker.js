
// --- CẤU HÌNH CLOUDFLARE WORKER: QUAN TRỌNG ---
// 1. Sao chép và dán *toàn bộ* nội dung file này vào Cloudflare Worker của bạn.
// 2. TRONG CLOUDFLARE DASHBOARD:
//    - Chuyển đến Worker của bạn (Workers & Pages -> Tên Worker của bạn).
//    - Vào mục "Settings" (Cài đặt).
//    - Chọn "Variables" (Biến) -> "Bindings" (Ràng buộc).
//    - Trong phần "Rate Limiters" (Giới hạn tần suất), nhấp vào "Add binding" (Thêm ràng buộc).
//    - "Variable name" (Tên biến): Nhập chính xác `B365_RATE_LIMITER`
//    - "Rate limiter" (Giới hạn tần suất): Chọn một Rate Limiter bạn đã tạo.
//      -> Nếu bạn chưa có, hãy tạo một Rate Limiter mới:
//         - Tên (ví dụ: `B365_API_Limit`)
//         - Limit (Giới hạn): `1`
//         - Period (Chu kỳ): `20` (giây)
//         - Burst (Đột biến): `0` (hoặc `1` nếu bạn muốn cho phép 1 yêu cầu tức thì)
//    - Lưu các thay đổi.
// 3. Đảm bảo Worker của bạn đã được triển khai (Deploy) thành công.
// ----------------------------------------------------

// B365_RATE_LIMITER là một biến toàn cục được Cloudflare tự động inject vào môi trường Worker
// dựa trên cấu hình binding của bạn.
// @ts-ignore - Đây là một biến toàn cục được inject bởi Cloudflare Workers runtime.
//           - Nếu bạn muốn có tính năng kiểm tra kiểu TypeScript đầy đủ cho Worker, hãy cân nhắc
//             đổi tên file này thành `worker.ts` và đảm bảo dự án Cloudflare của bạn được cấu hình
//             để build các Worker TypeScript.
// Biến `B365_RATE_LIMITER` sẽ có sẵn dưới dạng toàn cục khi Worker chạy.

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204, // No Content
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400', // Cache preflight response for 24 hours
      },
    });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('target');

  if (!targetUrl) {
    // Ensure 400 response also has CORS headers
    return new Response('Missing "target" query parameter', { status: 400, headers: { 
        'Access-Control-Allow-Origin': '*', // CORS header
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }});
  }

  // --- Kiểm tra giới hạn tần suất bằng binding Rate Limiter ---
  // Sử dụng một khóa duy nhất cho tất cả các yêu cầu đến B365 API
  // Điều này sẽ kiểm tra giới hạn 1 yêu cầu/20 giây bạn đã cấu hình trên Cloudflare Dashboard.
  const { success } = await B365_RATE_LIMITER.limit({ key: 'b365_api_calls' });

  if (!success) {
    // Nếu đạt giới hạn tần suất của Worker, trả về lỗi 429
    // `Retry-After` header giúp client biết khi nào nên thử lại.
    return new Response('Too Many Requests - Worker rate limit exceeded. Please wait.', { status: 429, headers: { 
        'Retry-After': '20', // Thông báo cho client chờ 20 giây
        'Access-Control-Allow-Origin': '*', // CORS header
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
     } });
  }
  // --- Kết thúc kiểm tra giới hạn tần suất ---

  // Nếu không đạt giới hạn, thực hiện yêu cầu đến B365 API
  try {
    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    // Tạo phản hồi mới để tránh lỗi CORS và sửa lỗi 403 nếu có
    const newResponse = new Response(proxyResponse.body, proxyResponse);
    newResponse.headers.set('Access-Control-Allow-Origin', '*'); // Rất quan trọng cho CORS
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return newResponse;

  } catch (error) {
    console.error("Worker fetch error:", error);
    // Trả về lỗi 500 nếu Worker không thể fetch target URL
    return new Response(`Worker failed to fetch target: ${error.message}`, { status: 500, headers: {
        'Access-Control-Allow-Origin': '*', // CORS header
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    } });
  }
}