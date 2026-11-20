import { loadReferralData, type PartnerView } from "@/lib/referral";
import { residentNoReady } from "@/lib/tax";
import ReferralView from "@/components/ReferralView";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  let partners: PartnerView[] | null = null;
  try {
    partners = await loadReferralData();
  } catch (e) {
    console.error("[referrals] load failed", e);
  }
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return (
    <main style={{ flex: 1, minWidth: 0, padding: "4px clamp(16px, 4vw, 28px) 48px" }}>
      {partners ? (
        <ReferralView partners={partners} today={kstToday} residentKeyReady={residentNoReady()} />
      ) : (
        <p style={{ color: "#A8416C", fontWeight: 600 }}>영업대행 데이터를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>
      )}
    </main>
  );
}
