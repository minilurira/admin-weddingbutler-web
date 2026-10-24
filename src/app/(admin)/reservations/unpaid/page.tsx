import { fetchUnpaid } from "@/lib/unpaid";
import UnpaidList from "@/components/UnpaidList";

export const dynamic = "force-dynamic";

const DAYS = [7, 30, 60, 93];

export default async function UnpaidPage({ searchParams }: { searchParams: { days?: string } }) {
  const requested = Number(searchParams.days);
  const days = DAYS.includes(requested) ? requested : 30;
  const result = await fetchUnpaid(days);

  return (
    <main style={{ flex: 1, minWidth: 0, padding: "4px 28px 48px" }}>
      {result.ok ? (
        <UnpaidList rows={result.rows} failed={result.failed} days={days} dayOptions={DAYS} />
      ) : (
        <>
          <h1 style={{ margin: "0 0 18px", fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px" }}>미결제 예약</h1>
          <p style={{ color: "#A8416C", fontWeight: 600 }}>{result.message}</p>
        </>
      )}
    </main>
  );
}
