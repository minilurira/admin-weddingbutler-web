/** @type {import('next').NextConfig} */

// 기본 보안 헤더. 결제창(포트원)·분석 스크립트가 깨질 수 있는 엄격한 CSP는 넣지 않았다(넣으려면 결제 흐름을 시험하며 따로 적용).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
