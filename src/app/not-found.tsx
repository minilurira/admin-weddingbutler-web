export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, fontFamily: "inherit" }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>페이지를 찾을 수 없습니다</h1>
      <a href="/" style={{ fontSize: 14 }}>홈으로 돌아가기</a>
    </div>
  );
}
