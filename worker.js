
// Khai báo binding Rate Limiter.
// Cloudflare tự động inject biến này dựa trên cấu hình binding của bạn.
// Đảm bảo "Variable name" trong binding là B365_RATE_LIMITER trên Cloudflare Dashboard.
declare const B365_RATE_LIMITER: RateLimiter;

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('target');

  if (!targetUrl) {
    return new Response('Missing "target" query parameter', { status: 400 });
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
    