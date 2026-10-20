import { inquiriesConfigured, listInquiries, type Inquiry } from "@/lib/inquiries";
import InquiryTable from "@/components/InquiryTable";

export const dynamic = "force-dynamic";

function Notice({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13.5, color: "#8C8188", padding: "24px 4px", lineHeight: 1.6 }}>{children}</div>;
}

export default async function InquiriesPage() {
  let items: Inquiry[] | null = null;
  let loadError = false;
  if (inquiriesConfigured()) {
    try {
      items = await listInquiries();
    } catch (err) {
      console.error(err);
      loadError = true;
    }
  }

  return (
    <main style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "6px 28px 48px" }}>
      {!inquiriesConfigured() && (
        <Notice>Supabase 연결 정보가 없어 문의를 불러올 수 없습니다. Vercel 환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 를 설정해 주세요.</Notice>
      )}
      {loadError && <Notice>문의를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</Notice>}
      {items && <InquiryTable items={items} />}
    </main>
  );
}
