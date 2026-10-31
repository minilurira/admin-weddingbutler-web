// 유입·검색 대시보드의 그래프·표. 서버 컴포넌트로 SVG를 그린다(차트 라이브러리 없음).
// 막대마다 <title>을 넣어 마우스를 올리면 날짜와 값이 보인다.

const ROSE = "#B0567E";
const ROSE_SOFT = "#E7C3D3";
const INK = "#1E1A1C";
const TEXT_3 = "#8C8188";
const LINE = "#ECE7E9";

export function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "#FFFFFF", border: "1px solid var(--wb-line-2)", borderRadius: 18, padding: "18px 20px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{title}</h2>
        {sub && <span style={{ fontSize: 12, color: TEXT_3 }}>{sub}</span>}
      </div>
      {children}
    </section>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "#6E646A", background: "var(--wb-bg-1)", borderRadius: 12, padding: "14px 16px", lineHeight: 1.6 }}>{children}</div>;
}

function deltaText(cur: number, prev: number | null | undefined) {
  if (prev === null || prev === undefined) return null;
  if (prev === 0) return cur === 0 ? { text: "변화 없음", up: null } : { text: "새로 발생", up: true };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: "변화 없음", up: null };
  return { text: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, up: pct > 0 };
}

export function StatTile({ label, value, prev, current, hint }: { label: string; value: string; current?: number; prev?: number | null; hint?: string }) {
  const delta = current !== undefined ? deltaText(current, prev) : null;
  return (
    <div style={{ background: "var(--wb-bg-2)", borderRadius: 16, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: TEXT_3, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: INK, marginTop: 6, letterSpacing: "-0.5px" }}>{value}</div>
      <div style={{ fontSize: 12, marginTop: 4, color: TEXT_3, minHeight: 16 }}>
        {delta && <span style={{ color: delta.up === null ? TEXT_3 : delta.up ? "#2F7A55" : "#A8416C", fontWeight: 700 }}>{delta.text}</span>}
        {delta && " 직전 기간 대비"}
        {!delta && hint}
      </div>
    </div>
  );
}

const shortDate = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

// 일별 막대 그래프 하나(한 가지 값). 서로 다른 단위를 한 축에 겹치지 않도록 지표마다 따로 그린다.
export function DailyBars({ days, values, unit, color = ROSE }: { days: string[]; values: Record<string, number>; unit: string; color?: string }) {
  const W = 720;
  const H = 150;
  const padL = 34;
  const padB = 22;
  const padT = 8;
  const max = Math.max(1, ...days.map((d) => values[d] ?? 0));
  const niceMax = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const step = (W - padL) / Math.max(1, days.length);
  const barW = Math.max(2, Math.min(18, step - 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax);
  const labelEvery = Math.ceil(days.length / 8);
  const total = days.reduce((s, d) => s + (values[d] ?? 0), 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`일별 ${unit}, 합계 ${total}`} style={{ display: "block" }}>
      {[0, 0.5, 1].map((t) => {
        const v = Math.round(niceMax * t);
        return (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke={LINE} strokeWidth={1} />
            <text x={padL - 6} y={y(v) + 4} fontSize={10.5} fill={TEXT_3} textAnchor="end">{v}</text>
          </g>
        );
      })}
      {days.map((d, i) => {
        const v = values[d] ?? 0;
        const x = padL + i * step + (step - barW) / 2;
        const top = y(v);
        const h = H - padB - top;
        return (
          <g key={d}>
            {/* 마우스 대상은 막대보다 넓게 */}
            <rect x={padL + i * step} y={padT} width={step} height={H - padT - padB} fill="transparent">
              <title>{`${shortDate(d)} · ${unit} ${v.toLocaleString("ko-KR")}`}</title>
            </rect>
            {v > 0 && (
              <path
                d={`M${x},${H - padB} V${top + Math.min(3, h)} Q${x},${top} ${x + Math.min(3, barW / 2)},${top} H${x + barW - Math.min(3, barW / 2)} Q${x + barW},${top} ${x + barW},${top + Math.min(3, h)} V${H - padB} Z`}
                fill={color}
                pointerEvents="none"
              />
            )}
            {i % labelEvery === 0 && (
              <text x={padL + i * step + step / 2} y={H - 6} fontSize={10.5} fill={TEXT_3} textAnchor="middle">{shortDate(d)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// 순위 표 + 비율 막대
export function RankList({ rows, unit = "세션", empty = "데이터가 없습니다.", format }: { rows: { name: string; value: number }[]; unit?: string; empty?: string; format?: (name: string) => string }) {
  if (rows.length === 0) return <div style={{ fontSize: 13, color: TEXT_3 }}>{empty}</div>;
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => (
        <div key={r.name} title={`${r.name} · ${unit} ${r.value.toLocaleString("ko-KR")}`}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span style={{ color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{format ? format(r.name) : r.name}</span>
            <span style={{ color: "#6E646A", flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>
              {r.value.toLocaleString("ko-KR")} <span style={{ color: TEXT_3 }}>({Math.round((r.value / total) * 100)}%)</span>
            </span>
          </div>
          <div style={{ height: 6, background: "var(--wb-bg-1)", borderRadius: 3, marginTop: 5 }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: 6, background: ROSE_SOFT, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
