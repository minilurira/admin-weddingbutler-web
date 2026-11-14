// 유입·검색의 "예약 퍼널" 카드. 예약 창을 연 뒤 단계별로 몇 번 넘어갔는지와 이탈을 보여 준다.
import { FUNNEL_SIDE, FUNNEL_STEPS, type FunnelCount } from "@/lib/ga4";

const ROSE = "#B0567E";
const ROSE_SOFT = "#E7C3D3";
const INK = "#1E1A1C";
const TEXT_3 = "#8C8188";

const DEVICES = [
  { key: "all", label: "전체" },
  { key: "mobile", label: "모바일" },
  { key: "desktop", label: "PC" },
] as const;

const n = (v: number) => v.toLocaleString("ko-KR");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "-");

function countOf(rows: FunnelCount[], event: string, device: string) {
  return rows.filter((r) => r.event === event && (device === "all" || r.device === device)).reduce((s, r) => s + r.count, 0);
}

function Column({ rows, device, label }: { rows: FunnelCount[]; device: string; label: string }) {
  const steps = FUNNEL_STEPS.map((s) => ({ ...s, value: countOf(rows, s.event, device) }));
  const top = steps[0].value;
  // 다음 단계로 넘어가지 못한 수가 가장 큰 구간
  let worst = -1;
  let worstLoss = 0;
  steps.forEach((s, i) => {
    if (i === 0) return;
    const loss = steps[i - 1].value - s.value;
    if (loss > worstLoss) {
      worstLoss = loss;
      worst = i;
    }
  });
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((s, i) => {
          const prev = i === 0 ? null : steps[i - 1].value;
          const hot = i === worst;
          return (
            <div key={s.event}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                <span style={{ color: INK, fontWeight: hot ? 800 : 400 }}>
                  {i + 1}. {s.label}
                </span>
                <span style={{ color: "#6E646A", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {n(s.value)}
                  {prev !== null && <span style={{ color: hot ? "#A8416C" : TEXT_3, fontWeight: hot ? 700 : 400 }}> ({pct(s.value, prev)})</span>}
                </span>
              </div>
              <div style={{ height: 6, background: "var(--wb-bg-1)", borderRadius: 3, marginTop: 5 }}>
                <div style={{ width: `${top > 0 ? Math.min(100, (s.value / top) * 100) : 0}%`, height: 6, background: hot ? ROSE : ROSE_SOFT, borderRadius: 3 }} />
              </div>
            </div>
          );
        })}
      </div>
      {worst > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "#A8416C", fontWeight: 700 }}>
          가장 많이 빠지는 구간: {steps[worst - 1].label} → {steps[worst].label} ({n(worstLoss)}회)
        </div>
      )}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--wb-line)", display: "flex", flexDirection: "column", gap: 4 }}>
        {FUNNEL_SIDE.map((s) => (
          <div key={s.event} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: "#6E646A" }}>
            <span>{s.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{n(countOf(rows, s.event, device))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FunnelChart({ rows }: { rows: FunnelCount[] }) {
  const hasSteps = rows.some((r) => r.event !== "reservation_open" && r.event !== "purchase");
  return (
    <>
      {!hasSteps && (
        <div style={{ fontSize: 13, color: TEXT_3, marginBottom: 12 }}>
          단계별 이벤트는 2026년 11월 6일 배포 이후부터 쌓입니다. GA4 반영에 하루 정도 걸릴 수 있어요.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 22 }}>
        {DEVICES.map((d) => (
          <Column key={d.key} rows={rows} device={d.key} label={d.label} />
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: TEXT_3, lineHeight: 1.6 }}>
        예약 창을 한 번 열 때 단계마다 한 번씩 셉니다(같은 사람이 여러 번 열면 여러 번). 괄호는 바로 앞 단계 대비 비율이고, <span style={{ color: ROSE, fontWeight: 700 }}>진한 막대</span>가
        가장 많이 빠지는 구간입니다. 테스트 결제는 빠집니다. 이름·연락처가 있는 사람별 기록은 미결제 예약에서 볼 수 있어요.
      </div>
    </>
  );
}
