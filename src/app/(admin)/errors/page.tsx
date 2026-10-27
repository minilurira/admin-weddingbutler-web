import Link from "next/link";
import { listErrorLogs } from "@/lib/errorLog";
import { formatStamp } from "@/lib/format";

export const dynamic = "force-dynamic";

const SOURCES: { key: string; label: string; color: string; bg: string }[] = [
  { key: "home", label: "홈페이지", color: "#3E4C5C", bg: "#EDF0F4" },
  { key: "admin", label: "어드민", color: "#7E3855", bg: "#F7EDF2" },
  { key: "browser", label: "고객 화면", color: "#8A5A00", bg: "#FBEFD9" },
];
const tag = (k: string) => SOURCES.find((s) => s.key === k) ?? { key: k, label: k, color: "#6E646A", bg: "#EEECED" };

export default async function ErrorsPage({ searchParams }: { searchParams: { source?: string } }) {
  const source = SOURCES.some((s) => s.key === searchParams.source) ? (searchParams.source as string) : "all";
  const [rows, all] = await Promise.all([listErrorLogs(source), listErrorLogs("all", 500)]);
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const counts = Object.fromEntries(SOURCES.map((s) => [s.key, (all ?? []).filter((r) => r.source === s.key && new Date(r.created_at).getTime() > dayAgo).length]));
  const chip = (active: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", height: 36, padding: "0 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: active ? "#F9EFF4" : "#F6F3F5", color: active ? "#B0567E" : "#6E646A" });

  return (
    <main style={{ flex: 1, minWidth: 0, padding: "4px 28px 48px" }}>
      <h1 style={{ margin: "0 0 10px", fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px" }}>오류 기록</h1>
      <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.7, color: "#6E646A" }}>
        홈페이지·어드민의 서버 오류와 고객 화면의 오류가 자동으로 모입니다. 전화번호·이메일·키는 가려서 저장하고, 같은 오류는 1분에 한 번만 남깁니다.
      </p>

      {rows === null ? (
        <p style={{ color: "#A8416C", fontWeight: 600, lineHeight: 1.8 }}>
          오류 기록을 불러오지 못했습니다. 홈페이지 Supabase에 <b>error_logs</b> 표가 만들어졌는지, 어드민 Vercel에 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 들어 있는지 확인해 주세요.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            {SOURCES.map((s) => (
              <div key={s.key} style={{ background: s.bg, borderRadius: 14, padding: "14px 18px", minWidth: 130 }}>
                <div style={{ fontSize: 12, color: s.color }}>{s.label} · 최근 24시간</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{counts[s.key] ?? 0}건</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <Link href="/errors" style={chip(source === "all")}>전체</Link>
            {SOURCES.map((s) => <Link key={s.key} href={`/errors?source=${s.key}`} style={chip(source === s.key)}>{s.label}</Link>)}
          </div>
          <div style={{ background: "#F8F6F7", borderRadius: 18, padding: "6px 16px 10px" }}>
            {rows.length === 0 && <p style={{ padding: "22px 4px", color: "#8C8188", fontSize: 14 }}>기록된 오류가 없습니다. 👍</p>}
            {rows.map((r) => {
              const t = tag(r.source);
              return (
                <details key={r.id} style={{ borderBottom: "1px solid #ECE7E9", padding: "10px 0" }}>
                  <summary style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", listStyle: "none" }}>
                    <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: t.bg, color: t.color }}>{t.label}</span>
                    <span style={{ fontSize: 12.5, color: "#8C8188", whiteSpace: "nowrap" }}>{formatStamp(new Date(r.created_at))}</span>
                    {r.scope && <b style={{ fontSize: 13 }}>{r.scope}</b>}
                    <span style={{ fontSize: 13.5, color: "#33232A", wordBreak: "break-word" }}>{r.message}</span>
                  </summary>
                  {r.detail && <pre style={{ margin: "10px 0 0", padding: 12, borderRadius: 10, background: "#FFFFFF", fontSize: 11.5, lineHeight: 1.6, color: "#6E646A", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.detail}</pre>}
                </details>
              );
            })}
          </div>
          <p style={{ marginTop: 14, fontSize: 12, color: "#9A8F95", lineHeight: 1.7 }}>오래된 기록은 자동으로 지워지지 않습니다. 정리하려면 Supabase SQL에서 <code>delete from error_logs where created_at &lt; now() - interval &apos;90 days&apos;;</code>를 실행하세요.</p>
        </>
      )}
    </main>
  );
}
