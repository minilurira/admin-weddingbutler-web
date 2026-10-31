import Link from "next/link";
import { won } from "@/lib/pricing";
import { RANGE_OPTIONS, resolvePeriod, businessStats } from "@/lib/analyticsData";
import { ga4Configured, ga4ConfigProblem, ga4Summary, type Ga4Summary } from "@/lib/ga4";
import { searchAdConfigured, keywordVolumes, trackedKeywords, type KeywordVolume } from "@/lib/naverSearchAd";
import { Card, Notice, StatTile, DailyBars, RankList } from "@/components/AnalyticsCharts";

export const dynamic = "force-dynamic";

const CHANNEL_KO: Record<string, string> = {
  "Organic Search": "자연검색",
  Direct: "직접 방문",
  Referral: "다른 사이트 링크",
  "Organic Social": "소셜(인스타 등)",
  "Paid Search": "검색 광고",
  "Paid Social": "소셜 광고",
  Display: "디스플레이 광고",
  Email: "이메일",
  "Organic Video": "동영상",
  Unassigned: "미분류",
};
const DEVICE_KO: Record<string, string> = { mobile: "모바일", desktop: "PC", tablet: "태블릿" };

const n = (v: number) => v.toLocaleString("ko-KR");
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

export default async function AnalyticsPage({ searchParams }: { searchParams: { range?: string } }) {
  const period = resolvePeriod(searchParams.range);

  const gaReady = ga4Configured();
  const adReady = searchAdConfigured();
  const [biz, ga, kw] = await Promise.all([
    businessStats(period),
    gaReady
      ? ga4Summary({ startDate: period.start, endDate: period.end }, { startDate: period.prevStart, endDate: period.prevEnd }).then(
          (data) => ({ data, error: null as string | null }),
          (e: unknown) => ({ data: null as Ga4Summary | null, error: e instanceof Error ? e.message : String(e) })
        )
      : Promise.resolve({ data: null as Ga4Summary | null, error: ga4ConfigProblem() }),
    adReady
      ? keywordVolumes().then(
          (data) => ({ data, error: null as string | null }),
          (e: unknown) => ({ data: [] as KeywordVolume[], error: e instanceof Error ? e.message : String(e) })
        )
      : Promise.resolve({ data: [] as KeywordVolume[], error: null as string | null }),
  ]);

  const g = ga.data;
  const conversion = g && g.current.sessions > 0 ? (biz.requested / g.current.sessions) * 100 : null;
  const dailySessions: Record<string, number> = {};
  for (const d of g?.daily ?? []) dailySessions[d.date] = d.sessions;

  return (
    <main style={{ flex: 1, minWidth: 0, padding: "4px 28px 48px" }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px" }}>유입·검색</h1>
      <div style={{ fontSize: 13, color: "#8C8188", marginBottom: 18 }}>
        {md(period.start)} ~ {md(period.end)} · 직전 기간 {md(period.prevStart)} ~ {md(period.prevEnd)}과 비교
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {RANGE_OPTIONS.map((o) => {
          const on = o.key === period.key;
          return (
            <Link
              key={o.key}
              href={`/analytics?range=${o.key}`}
              style={{
                padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700,
                background: on ? "#B0567E" : "#F6F3F5", color: on ? "#FFFFFF" : "#6E646A",
              }}
            >
              {o.label}
            </Link>
          );
        })}
      </div>

      {!g && (
        <div style={{ marginBottom: 18 }}>
          <Notice>
            {ga.error ? (
              <>
                <b>GA4 데이터를 불러오지 못했습니다.</b>
                <br />
                {ga.error}
              </>
            ) : (
              <>
                <b>GA4가 아직 연결되지 않았습니다.</b> 어드민 Vercel 환경변수에 <code>GA4_PROPERTY_ID</code>(숫자 속성 ID)와{" "}
                <code>GA4_SERVICE_ACCOUNT_JSON</code>(서비스 계정 키 파일 내용 전체)을 넣고 다시 배포하면 방문 지표가 보입니다.
              </>
            )}
          </Notice>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
        {g && (
          <>
            <StatTile label="방문자" value={n(g.current.users)} current={g.current.users} prev={g.previous.users} />
            <StatTile label="세션(방문 수)" value={n(g.current.sessions)} current={g.current.sessions} prev={g.previous.sessions} />
            <StatTile label="페이지뷰" value={n(g.current.pageViews)} current={g.current.pageViews} prev={g.previous.pageViews} />
            <StatTile label="네이버 검색 유입" value={n(g.organic.naver)} current={g.organic.naver} prev={g.organic.naverPrev} />
            <StatTile label="구글 검색 유입" value={n(g.organic.google)} current={g.organic.google} prev={g.organic.googlePrev} />
          </>
        )}
        <StatTile label="예약 신청" value={`${n(biz.requested)}건`} current={biz.requested} prev={biz.requestedPrev} />
        <StatTile
          label="문의 접수"
          value={biz.inquiries === null ? "-" : `${n(biz.inquiries)}건`}
          current={biz.inquiries ?? undefined}
          prev={biz.inquiriesPrev}
          hint={biz.inquiries === null ? "문의 DB 미연결" : undefined}
        />
        <StatTile
          label="방문 대비 예약 전환율"
          value={conversion === null ? "-" : `${conversion.toFixed(1)}%`}
          hint={conversion === null ? "GA4 연결 후 표시" : "예약 신청 ÷ 세션"}
        />
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {g && (
          <Card title="일별 세션" sub={`합계 ${n(g.current.sessions)}`}>
            <DailyBars days={period.days} values={dailySessions} unit="세션" />
          </Card>
        )}

        <Card title="일별 예약 신청" sub={`합계 ${n(biz.requested)}건`}>
          <DailyBars days={period.days} values={biz.dailyRequested} unit="예약 신청" color="#7E3855" />
        </Card>

        {g && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <Card title="유입 채널" sub="세션 기준">
              <RankList rows={g.channels} format={(name) => CHANNEL_KO[name] ?? name} />
            </Card>
            <Card title="유입 소스 / 매체 상위 10" sub="예: naver / organic = 네이버 검색">
              <RankList rows={g.sourceMedium} />
            </Card>
            <Card title="처음 들어온 페이지 상위 10">
              <RankList rows={g.landingPages} format={(name) => (name === "/" ? "/ (메인)" : name)} />
            </Card>
            <Card title="기기">
              <RankList rows={g.devices} format={(name) => DEVICE_KO[name] ?? name} />
            </Card>
          </div>
        )}

        <Card title="예약·문의·결제" sub={`${period.label} 신청 기준`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <StatTile label="예약 신청" value={`${n(biz.requested)}건`} />
            <StatTile label="그중 확정" value={`${n(biz.confirmed)}건`} />
            <StatTile label="그중 취소" value={`${n(biz.cancelled)}건`} />
            <StatTile label="확정 금액" value={won(biz.paidAmount)} />
            <StatTile label="문의 접수" value={biz.inquiries === null ? "-" : `${n(biz.inquiries)}건`} />
            <StatTile label="그중 미처리" value={biz.inquiriesOpen === null ? "-" : `${n(biz.inquiriesOpen)}건`} />
          </div>
        </Card>

        <Card title="키워드 월간 검색량" sub="네이버, 최근 30일 · 검색광고 키워드도구">
          {!adReady ? (
            <Notice>
              네이버 검색광고 API를 연결하면 키워드별 월간 검색수가 보입니다(광고 집행 없이 무료). 검색광고 → 도구 → API 사용 관리에서 키를 발급받아 어드민
              Vercel에 <code>NAVER_SEARCHAD_CUSTOMER_ID</code>, <code>NAVER_SEARCHAD_API_KEY</code>, <code>NAVER_SEARCHAD_SECRET</code>을 넣어 주세요. 볼 키워드는{" "}
              <code>NAVER_SEARCHAD_KEYWORDS</code>에 쉼표로 적습니다(현재: {trackedKeywords().join(", ")}).
            </Notice>
          ) : kw.error ? (
            <Notice>{kw.error}</Notice>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ color: "#8C8188", textAlign: "left" }}>
                    <th style={{ padding: "8px 6px", fontWeight: 600 }}>키워드</th>
                    <th style={{ padding: "8px 6px", fontWeight: 600, textAlign: "right" }}>모바일</th>
                    <th style={{ padding: "8px 6px", fontWeight: 600, textAlign: "right" }}>PC</th>
                    <th style={{ padding: "8px 6px", fontWeight: 600, textAlign: "right" }}>합계</th>
                    <th style={{ padding: "8px 6px", fontWeight: 600, textAlign: "right" }}>경쟁 정도</th>
                  </tr>
                </thead>
                <tbody>
                  {kw.data.map((k) => (
                    <tr key={k.keyword} style={{ borderTop: "1px solid var(--wb-line)" }}>
                      <td style={{ padding: "9px 6px", fontWeight: 700 }}>{k.keyword}</td>
                      <td style={{ padding: "9px 6px", textAlign: "right" }}>{k.mobile === null ? "10 미만" : n(k.mobile)}</td>
                      <td style={{ padding: "9px 6px", textAlign: "right" }}>{k.pc === null ? "10 미만" : n(k.pc)}</td>
                      <td style={{ padding: "9px 6px", textAlign: "right", fontWeight: 700 }}>
                        {k.mobile === null && k.pc === null ? "-" : n((k.mobile ?? 0) + (k.pc ?? 0))}
                      </td>
                      <td style={{ padding: "9px 6px", textAlign: "right", color: "#6E646A" }}>{k.competition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div style={{ fontSize: 12, color: "#A79BA1", lineHeight: 1.6 }}>
          네이버 서치어드바이저의 노출수·클릭수·검색어는 공개 API가 없어 여기에 나오지 않습니다. 필요하면 searchadvisor.naver.com에서 확인하세요. GA4 수치는 10분마다 새로 불러옵니다.
        </div>
      </div>
    </main>
  );
}
