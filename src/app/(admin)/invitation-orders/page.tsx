import { fetchInvitationOrders } from "@/lib/invitationOrders";
import InvitationOrders from "@/components/InvitationOrders";

export const dynamic = "force-dynamic";

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default async function InvitationOrdersPage({ searchParams }: { searchParams: { month?: string } }) {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.month ?? "") ? (searchParams.month as string) : kstToday().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const result = await fetchInvitationOrders(`${month}-01`, `${month}-${String(last).padStart(2, "0")}`);

  return (
    <main style={{ flex: 1, minWidth: 0, padding: "4px 28px 48px" }}>
      {result.ok ? (
        <InvitationOrders orders={result.orders} month={month} />
      ) : (
        <>
          <h1 style={{ margin: "0 0 18px", fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px" }}>청첩장 결제</h1>
          <p style={{ color: "#A8416C", fontWeight: 600 }}>{result.message}</p>
        </>
      )}
    </main>
  );
}
