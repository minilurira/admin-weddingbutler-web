import { loadFinanceData } from "@/lib/financeData";
import FinanceView, { type FinanceData } from "@/components/FinanceView";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  let data: FinanceData | null = null;
  let error = "";
  try {
    data = await loadFinanceData();
  } catch (e) {
    console.error("[finance] load failed", e);
    error = "지출관리 데이터를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.";
  }

  return (
    <main style={{ flex: 1, minWidth: 0, padding: "4px 28px 48px" }}>
      {data ? <FinanceView data={data} view="finance" /> : <p style={{ color: "#A8416C", fontWeight: 600 }}>{error}</p>}
    </main>
  );
}
