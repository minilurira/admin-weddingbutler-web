import Link from "next/link";
import { inquiriesConfigured, listInquiries, type Inquiry } from "@/lib/inquiries";
import { formatStamp } from "@/lib/format";
import InquiryControls from "@/components/InquiryControls";

export const dynamic = "force-dynamic";

const FILTERS = ["전체", "미처리", "처리완료"] as const;

function Notice({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13.5, color: "#8C8188", padding: "24px 4px", lineHeight: 1.6 }}>{children}</div>;
}

export default async function InquiriesPage({ searchParams }: { searchParams: { filter?: string } }) {
  const filter = FILTERS.find((f) => f === searchParams.filter) ?? "전체";

  let all: Inquiry[] | null = null;
  let loadError = false;
  if (inquiriesConfigured()) {
    try {
      all = await listInquiries();
    } catch (err) {
      console.error(err);
      loadError = true;
    }
  }

  const items = (all ?? []).filter((it) =>
    filter === "전체" ? true : filter === "처리완료" ? Boolean(it.handled_at) : !it.handled_at
  );
  const openCount = (all ?? []).filter((it) => !it.handled_at).length;

  return (
    <main style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "6px 28px 48px", maxWidth: 860 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "10px 0 18px" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", marginRight: "auto" }}>
          문의 목록 {all && <span style={{ fontSize: 14, color: "#B0567E" }}>미처리 {openCount}건</span>}
        </h1>
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "전체" ? "/inquiries" : `/inquiries?filter=${encodeURIComponent(f)}`}
            style={{
              padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700,
              background: f === filter ? "#B0567E" : "#FFFFFF", color: f === filter ? "#FFFFFF" : "#6E646A",
              boxShadow: f === filter ? "none" : "inset 0 0 0 1px #E8E2E5",
            }}
          >
            {f}
          </Link>
        ))}
      </div>

      {!inquiriesConfigured() && (
        <Notice>Supabase 연결 정보가 없어 문의를 불러올 수 없습니다. Vercel 환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 를 설정해 주세요.</Notice>
      )}
      {loadError && <Notice>문의를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</Notice>}
      {all && items.length === 0 && <Notice>조건에 맞는 문의가 없습니다.</Notice>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it) => {
          const handled = Boolean(it.handled_at);
          const accent = handled ? "#4F9A72" : "#A8416C";
          return (
            <article
              key={it.id}
              style={{
                display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px 16px 20px", borderRadius: 16,
                background: handled ? "#F8F6F7" : "#FFF5F9",
                boxShadow: `inset 4px 0 0 0 ${accent}, inset 0 0 0 1px ${handled ? "transparent" : "#EBC2D3"}`,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px" }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, marginRight: 2 }}>{it.name} 님</span>
                <a href={`tel:${it.phone.replace(/[^0-9+]/g, "")}`} style={{ fontSize: 13, color: "#B0567E", fontWeight: 600 }}>
                  {it.phone}
                </a>
                <span style={{ flex: "0 0 auto", padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#FFFFFF", color: "#7A6F75", boxShadow: "inset 0 0 0 1px #E8E2E5" }}>
                  {it.topic}
                </span>
                <span
                  style={{
                    marginLeft: "auto", padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800,
                    background: handled ? "#E3F1E8" : "#A8416C", color: handled ? "#2B6A45" : "#FFFFFF",
                  }}
                >
                  {handled ? `처리완료 · ${formatStamp(new Date(it.handled_at!))}` : "미처리"}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12.5, color: "#8C8188" }}>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>접수 {formatStamp(new Date(it.created_at))}</span>
                {it.ceremony_date && <span>예식일 {it.ceremony_date}</span>}
                {it.area && <span>지역 {it.area}</span>}
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: "#413A3E", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {it.message}
              </p>
              <InquiryControls id={it.id} handled={handled} memo={it.admin_memo ?? ""} />
            </article>
          );
        })}
      </div>
    </main>
  );
}
