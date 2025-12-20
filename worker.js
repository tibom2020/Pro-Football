export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('target');

    if (!targetUrl) {
      return new Response('Missing target URL', { status: 400 });
    }

    // Tạo key duy nhất dựa trên URL (loại bỏ ký tự đặc biệt)
    const cacheKey = btoa(targetUrl).substring(0, 64);
    
    // 1. Kiểm tra cache trong KV
    const cachedResponse = await env.B365_CACHE.get(cacheKey);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: { 
          ...corsHeaders, 
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '' 
        }
      });
    }

    // 2. Nếu có cache, trả về ngay lập tức
    if (cachedResponse) {
      return new Response(cachedResponse, {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-Proxy-Cache': 'HIT' // Đánh dấu là lấy từ cache
        },
      });
    }

    // 3. Nếu chưa có cache, gọi API thật
    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
            'Accept': 'application/json',
            // Thêm các header cần thiết của B365 tại đây nếu cần
        },
        redirect: 'follow',
      });

      const data = await response.text();

      // Chỉ lưu vào cache nếu API trả về thành công (status 200)
      if (response.ok) {
        // expirationTtl: 60 (giây) = Hạn chế 1 phút gọi 1 lần
        await env.B365_CACHE.put(cacheKey, data, { expirationTtl: 60 });
      }

      return new Response(data, {
        status: response.status,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-Proxy-Cache': 'MISS' // Đánh dấu là gọi API thật
        },
      });

    } catch (err) {
      return new Response('Proxy Error: ' + err.message, { status: 500 });
    }
  },
};