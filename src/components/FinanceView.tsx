"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastContext";
import {
  addButler, addCost, addShift, deleteButler, deleteCost, deleteShift, runReconciliation, saveSettings, setCash, setShiftPaid, updateShiftPay,
} from "@/lib/financeActions";
import type { ReconcileResult } from "@/lib/finance";
import { CARD_SETTLE_BUSINESS_DAYS, addBusinessDays, cardFee } from "@/lib/financeCalc";

export interface FinanceData {
  today: string;
  settings: { feeRate: number; bankDate: string; bankBalance: number };
  reservations: { id: string; date: string; couple: string; plan: string; total: number; card: number; paidDate: string; cash: number | null }[];
  costs: { id: string; name: string; amount: number; kind: "once" | "monthly"; date: string; memo: string }[];
  butlers: { id: string; name: string }[];
  shifts: { id: string; butlerId: string; date: string; rid: string; pay: number; paid: boolean }[];
}

type Tab = "income" | "cost" | "butler" | "bank" | "recon";
const won = (n: number) => Math.round(n).toLocaleString("ko-KR") + "원";
const md = (d: string) => d.slice(5).replace("-", "/");
const toInt = (v: string) => Number(v.replace(/[^0-9]/g, "")) || 0;

export default function FinanceView({ data }: { data: FinanceData }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const [tab, setTab] = useState<Tab>("income");
  const [sRes, setSRes] = useState(data.reservations[0]?.id ?? "");
  const [sDate, setSDate] = useState(data.reservations[0]?.date ?? data.today);
  const [delButler, setDelButler] = useState(""); // 삭제 확인 중인 버틀러 id
  const [recon, setRecon] = useState<ReconcileResult | null>(null);
  const [reconMonth, setReconMonth] = useState("");
  const [reconBusy, setReconBusy] = useState(false);
  const [hideTest, setHideTest] = useState(true); // 테스트 거래([TEST]·1,000원 이하)는 기본으로 숨긴다

  /** 선택한 달(접수일 기준)의 결제를 포트원과 맞춰 본다. 읽기 전용이라 언제 눌러도 안전하다. */
  async function checkRecon() {
    setReconBusy(true);
    try {
      setRecon(await runReconciliation(month));
      setReconMonth(month);
    } catch (e) {
      toast(e instanceof Error ? e.message : "대사에 실패했습니다.");
    } finally {
      setReconBusy(false);
    }
  }

  const { settings, reservations, costs, butlers, shifts } = data;
  const feeOf = (card: number) => cardFee(card, settings.feeRate);
  const inMonth = (d: string) => d.startsWith(month);
  const bName = (id: string) => butlers.find((b) => b.id === id)?.name ?? "?";

  /** 서버 액션을 실행하고 화면을 새로 읽는다. 실패하면 토스트로 알린다. */
  function run(fn: () => Promise<unknown>, okMsg?: string) {
    startTransition(async () => {
      try {
        await fn();
        if (okMsg) toast(okMsg);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "저장하지 못했습니다.");
      }
    });
  }

  function shiftMonth(k: number) {
    let [y, m] = month.split("-").map(Number);
    m += k;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(`${y}-${String(m).padStart(2, "0")}`);
  }

  /* 이번 달 집계 */
  // 수입 리스트는 결제일(예약 접수일) 기준으로 모으고 정렬한다. 예식일은 옆에 함께 보여 준다.
  const rs = reservations.filter((r) => inMonth(r.paidDate)).sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.date.localeCompare(b.date));
  const card = rs.reduce((s, r) => s + r.card, 0);
  const cash = rs.reduce((s, r) => s + (r.cash ?? 0), 0);
  const fee = rs.reduce((s, r) => s + feeOf(r.card), 0);
  const gross = card + cash, income = gross - fee;
  const monthly = costs.filter((c) => c.kind === "monthly" && c.date.slice(0, 7) <= month).reduce((s, c) => s + c.amount, 0);
  const once = costs.filter((c) => c.kind === "once" && inMonth(c.date)).reduce((s, c) => s + c.amount, 0);
  const ms = shifts.filter((s) => inMonth(s.date)).sort((a, b) => a.date.localeCompare(b.date));
  const pay = ms.reduce((s, x) => s + x.pay, 0);
  const cost = monthly + once + pay, net = income - cost;
  const unpaid = ms.filter((s) => !s.paid);

  /* 통장 잔액 예상: 기준일 이후의 입금·출금만 더해 월말 잔액을 이어서 계산한다.
     입금 = 카드는 결제일 + 7영업일에 (카드 − 수수료), 현금은 예식일에 (미입력 잔금은 총액−카드로 예상)
     출금 = 월 비용(시작일의 일자마다) + 일회성 + 미지급 버틀러 정산 */
  const base = settings.bankDate, bm = base.slice(0, 7);
  const projection = (() => {
    let bal = settings.bankBalance;
    return Array.from({ length: 6 }, (_, i) => {
      let [y, m] = bm.split("-").map(Number);
      m += i;
      while (m > 12) { m -= 12; y++; }
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const inc = reservations.reduce((a, r) => {
        const settle = addBusinessDays(r.paidDate, CARD_SETTLE_BUSINESS_DAYS); // 카드: 결제 후 7영업일에 수수료를 뗀 금액이 입금
        const cardIn = settle.startsWith(key) && settle > base ? r.card - feeOf(r.card) : 0;
        const cashIn = r.date.startsWith(key) && r.date > base ? (r.cash ?? Math.max(0, r.total - r.card)) : 0; // 현금: 예식 당일
        return a + cardIn + cashIn;
      }, 0);
      const mon = costs.filter((x) => x.kind === "monthly" && x.date.slice(0, 7) <= key && `${key}-${x.date.slice(8)}` > base).reduce((a, x) => a + x.amount, 0);
      const one = costs.filter((x) => x.kind === "once" && x.date.startsWith(key) && x.date > base).reduce((a, x) => a + x.amount, 0);
      const py = shifts.filter((x) => !x.paid && (x.date.slice(0, 7) < bm ? bm : x.date.slice(0, 7)) === key).reduce((a, x) => a + x.pay, 0);
      bal += inc - (mon + one + py);
      return { m: key, inc, mon, one, pay: py, end: bal };
    });
  })();
  const curProj = projection.find((p) => p.m === month);
  const lowest = projection.reduce((a, p) => (p.end < a.end ? p : a), projection[0]);
  const maxAbs = Math.max(...projection.map((p) => Math.abs(p.end)), 1);
  const [yy, mm] = month.split("-");

  const form = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); return new FormData(e.currentTarget); };

  return (
    <div className="fin">
      <style>{CSS}</style>

      <div className="top">
        <h1>정산 관리</h1>
        <div className="month" role="group" aria-label="월 선택">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달">‹</button>
          <b className="num">{yy}년 {Number(mm)}월</b>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달">›</button>
        </div>
      </div>

      <div className="sum">
        <div className="tile"><small>실수입 (카드수수료 제외)</small><b className="num">{won(income)}</b><span>매출 {won(gross)} − 수수료 {won(fee)}</span></div>
        <div className="tile"><small>총 비용</small><b className="num">{won(cost)}</b><span>월 {won(monthly)} · 일회성 {won(once)} · 버틀러 {won(pay)}</span></div>
        <div className="tile net"><small>순수익 (실수입 − 비용)</small><b className="num">{won(net)}</b><span>{income ? `이익률 ${Math.round((net / income) * 100)}%` : "수입 없음"}</span></div>
        <div className="tile"><small>버틀러 미정산</small><b className="num">{won(unpaid.reduce((a, s) => a + s.pay, 0))}</b><span>{unpaid.length}건 지급 대기</span></div>
        <div className="tile"><small>월말 예상 통장 잔액</small><b className={`num ${curProj && curProj.end < 0 ? "neg" : ""}`}>{curProj ? won(curProj.end) : "-"}</b><span>{curProj ? `기준일 ${md(base)} 잔액에서 계산` : "기준일 이후 달만 계산"}</span></div>
      </div>

      <div className="tabs" role="tablist">
        {([["income", "수입"], ["cost", "비용"], ["butler", "버틀러 관리"], ["bank", "통장 잔액"], ["recon", "결제 대사"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "income" && (
        <section className="panel">
          <div className="box"><div className="inline">
            <div className="field"><label htmlFor="feeRate">카드 수수료율 (%, 부가세 별도)</label>
              <input id="feeRate" key={settings.feeRate} inputMode="decimal" defaultValue={settings.feeRate}
                onBlur={(e) => { const v = parseFloat(e.target.value.replace(",", ".")); if (Number.isFinite(v) && v !== settings.feeRate) run(() => saveSettings({ feeRate: v }), "수수료율을 저장했습니다."); }} /></div>
            <p className="note" style={{ margin: "0 0 6px", flex: 1, minWidth: 220 }}>카드결제 금액에만 적용됩니다. 신용카드 3.2%는 부가세 별도라서 실제로는 {(settings.feeRate * 1.1).toFixed(2)}%({settings.feeRate}% × 1.1)를 뺍니다. 수수료는 결제 후 {CARD_SETTLE_BUSINESS_DAYS}영업일에 입금(정산)될 때 PG가 미리 떼고 보냅니다.</p>
          </div></div>
          <div className="box"><h2>결제수단별 수입</h2>
            <div className="bar" role="img" aria-label={`카드 ${gross ? Math.round((card / gross) * 100) : 0}%`}>
              <i style={{ width: `${gross ? (card / gross) * 100 : 0}%`, background: "var(--card)" }} />
              <i style={{ width: `${gross ? (cash / gross) * 100 : 0}%`, background: "var(--cash)" }} />
            </div>
            <div className="legend">
              <span style={{ ["--c" as string]: "var(--card)" }}>카드결제 <b className="num">{won(card)}</b></span>
              <span style={{ ["--c" as string]: "var(--cash)" }}>현금결제 <b className="num">{won(cash)}</b></span>
              <span style={{ ["--c" as string]: "var(--bad)" }}>카드수수료 <b className="num neg">−{won(fee)}</b></span>
            </div>
          </div>
          <div className="box"><h2>예약별 수입 <small className="sub">확정된 예약 · 결제일 순</small></h2>
            <div className="scroll"><table style={{ minWidth: 860 }}>
              <thead><tr><th>결제일</th><th>예식일</th><th>예약</th><th className="r">카드결제</th><th className="r">카드수수료</th><th className="r">현금결제</th><th className="r">실수입</th><th>카드 입금 예정 <small className="sub">(예상)</small></th><th>상태</th></tr></thead>
              <tbody>
                {rs.length === 0 && <tr><td colSpan={9} className="empty">이 달에 결제된 확정 예약이 없습니다.</td></tr>}
                {rs.map((r) => {
                  const f = feeOf(r.card), unentered = r.cash === null;
                  return (
                    <tr key={r.id}>
                      <td className="num">{md(r.paidDate)}</td>
                      <td className="num">{md(r.date)}</td>
                      <td>{r.couple}<br /><small className="sub">{r.id} · {r.plan}</small></td>
                      <td className="r num">{won(r.card)}</td>
                      <td className="r num neg">{f ? `−${won(f)}` : "-"}</td>
                      <td className="r"><input className="cell num" key={`${r.id}:${r.cash}`} inputMode="numeric" defaultValue={r.cash ?? ""} placeholder={`예상 ${Math.max(0, r.total - r.card).toLocaleString("ko-KR")}`} aria-label={`${r.couple} 현금결제 금액`}
                        onBlur={(e) => { const t = e.target.value.trim(); const next = t === "" ? null : toInt(t); if (next !== r.cash) run(() => setCash(r.id, next)); }} /></td>
                      <td className="r num"><b>{won(r.card - f + (r.cash ?? 0))}</b></td>
                      <td className="num">{(() => { const d = addBusinessDays(r.paidDate, CARD_SETTLE_BUSINESS_DAYS); return <>{md(d)}<br /><small className="sub">{won(r.card - f)}{d <= data.today ? " · 입금일 경과" : ""}</small></>; })()}</td>
                      <td>{unentered ? (r.date > data.today ? <span className="pill mute">예식 전</span> : <span className="pill warn">잔금 확인 필요</span>) : <span className="pill good">수금 완료</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={3}>합계</td><td className="r num">{won(card)}</td><td className="r num neg">−{won(fee)}</td><td className="r num">{won(cash)}</td><td className="r num">{won(income)}</td><td colSpan={2} /></tr></tfoot>
            </table></div>
            <p className="note">월은 결제일(예약 접수일) 기준입니다. 카드결제는 예약에 기록된 결제 금액(홈페이지 KG이니시스)을 그대로 가져옵니다. 현금결제는 예식 당일 받은 잔금을 입력하세요(칸을 벗어나면 저장). 예식일이 아직 안 지난 예약은 잔금이 비어 있어도 "예식 전"으로 표시합니다. 실수입 = 카드결제 − 카드수수료 + 현금결제. 취소된 예약은 포함하지 않습니다. "카드 입금 예정"은 결제 후 7영업일에 수수료를 뗀 금액이 들어온다고 가정한 예상입니다. 실제 입금일과 입금액은 이니시스 정산 내역을 연동하면 보여 드릴 수 있습니다.</p>
          </div>
        </section>
      )}

      {tab === "cost" && (
        <section className="panel">
          <div className="box"><h2>비용 입력</h2>
            <form className="form" key={costs.length} onSubmit={(e) => { const f = form(e); run(() => addCost({ name: String(f.get("name")), amount: toInt(String(f.get("amount"))), kind: String(f.get("kind")), date: String(f.get("date")), memo: String(f.get("memo") ?? "") }), "비용을 추가했습니다."); }}>
              <div className="field"><label htmlFor="cName">항목</label><input id="cName" name="name" required placeholder="예: 사무실 월세" /></div>
              <div className="field"><label htmlFor="cAmount">금액(원)</label><input id="cAmount" name="amount" required inputMode="numeric" placeholder="예: 150000" /></div>
              <div className="field"><label htmlFor="cKind">구분</label><select id="cKind" name="kind"><option value="once">일회성 비용</option><option value="monthly">월 비용 (매달 반복)</option></select></div>
              <div className="field"><label htmlFor="cDate">날짜 (월 비용은 시작일)</label><input id="cDate" name="date" type="date" required defaultValue={`${month}-01`} /></div>
              <div className="field"><label htmlFor="cMemo">메모 (선택)</label><input id="cMemo" name="memo" placeholder="예: 세금계산서 발행" /></div>
              <button className="btn" type="submit">추가</button>
            </form>
          </div>
          <div className="row2">
            {(["monthly", "once"] as const).map((kind) => {
              const items = costs.filter((x) => x.kind === kind && (kind === "monthly" ? x.date.slice(0, 7) <= month : inMonth(x.date)));
              return (
                <div className="box" key={kind}>
                  <h2>{kind === "monthly" ? "월 비용" : "일회성 비용"} <small className="sub">{kind === "monthly" ? "매달 반복" : `${yy}년 ${Number(mm)}월`}</small></h2>
                  <div className="scroll"><table style={{ minWidth: 420 }}>
                    <thead><tr><th>항목</th><th className="r">금액</th><th>{kind === "monthly" ? "시작월" : "날짜"}</th><th /></tr></thead>
                    <tbody>
                      {items.length === 0 && <tr><td colSpan={4} className="empty">등록된 비용이 없습니다.</td></tr>}
                      {items.map((x) => (
                        <tr key={x.id}>
                          <td>{x.name}{x.memo && <><br /><small className="sub">{x.memo}</small></>}</td>
                          <td className="r num">{won(x.amount)}</td>
                          <td className="num">{kind === "monthly" ? x.date.slice(0, 7) : md(x.date)}</td>
                          <td className="r"><button type="button" className="del" onClick={() => run(() => deleteCost(x.id), "삭제했습니다.")}>삭제</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td>소계</td><td className="r num">{won(items.reduce((s, x) => s + x.amount, 0))}</td><td colSpan={2} /></tr></tfoot>
                  </table></div>
                </div>
              );
            })}
          </div>
          <div className="box"><h2>이번 달 비용 한눈에</h2>
            <div className="legend">
              <span style={{ ["--c" as string]: "var(--accent)" }}>월 비용 <b className="num">{won(monthly)}</b></span>
              <span style={{ ["--c" as string]: "var(--cash)" }}>일회성 <b className="num">{won(once)}</b></span>
              <span style={{ ["--c" as string]: "var(--good)" }}>버틀러 정산 <b className="num">{won(pay)}</b></span>
            </div>
            <p className="note">총 비용 = 월 비용 + 일회성 비용 + 버틀러 정산금. 위쪽 요약의 &quot;총 비용&quot;과 같은 값입니다.</p>
          </div>
        </section>
      )}

      {tab === "butler" && (
        <section className="panel">
          <div className="box"><h2>버틀러 리스트 <small className="sub">총 수입은 전체 기간 정산 합계</small></h2>
            <div className="scroll"><table style={{ minWidth: 700 }}>
              <thead><tr><th>이름</th><th className="r">참석</th><th className="r">총 수입</th><th className="r">지급 완료</th><th className="r">미지급</th><th className="r">{Number(mm)}월 정산</th><th /></tr></thead>
              <tbody>
                {butlers.length === 0 && <tr><td colSpan={7} className="empty">아래에서 버틀러를 먼저 추가해 주세요.</td></tr>}
                {butlers.map((b) => {
                  const all = shifts.filter((s) => s.butlerId === b.id);
                  const total = all.reduce((a, s) => a + s.pay, 0);
                  const paidSum = all.filter((s) => s.paid).reduce((a, s) => a + s.pay, 0);
                  const monthSum = ms.filter((s) => s.butlerId === b.id).reduce((a, s) => a + s.pay, 0);
                  const confirming = delButler === b.id;
                  return (
                    <tr key={b.id}>
                      <td><b>{b.name}</b></td>
                      <td className="r num">{all.length}회</td>
                      <td className="r num"><b>{won(total)}</b></td>
                      <td className="r num">{won(paidSum)}</td>
                      <td className="r num" style={{ color: all.length === 0 ? "var(--muted)" : total - paidSum ? "var(--accent)" : "var(--good)", fontWeight: 700 }}>{all.length === 0 ? "-" : total - paidSum ? won(total - paidSum) : "정산 완료"}</td>
                      <td className="r num">{won(monthSum)}</td>
                      <td className="r">
                        {confirming ? (
                          <>
                            <small className="sub" style={{ color: "var(--bad)" }}>참석 기록 {all.length}건도 함께 삭제됩니다</small>{" "}
                            <button type="button" className="del" style={{ color: "var(--bad)", fontWeight: 700 }} onClick={() => { setDelButler(""); run(() => deleteButler(b.id), "버틀러를 삭제했습니다."); }}>삭제 확인</button>
                            <button type="button" className="del" onClick={() => setDelButler("")}>취소</button>
                          </>
                        ) : <button type="button" className="del" onClick={() => setDelButler(b.id)}>삭제</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td>버틀러 총 수입</td><td className="r num">{shifts.length}회</td><td className="r num">{won(shifts.reduce((a, s) => a + s.pay, 0))}</td><td className="r num">{won(shifts.filter((s) => s.paid).reduce((a, s) => a + s.pay, 0))}</td><td className="r num">{won(shifts.filter((s) => !s.paid).reduce((a, s) => a + s.pay, 0))}</td><td className="r num">{won(pay)}</td><td /></tr></tfoot>
            </table></div>
            <form className="form" key={butlers.length} style={{ marginTop: 14, gridTemplateColumns: "minmax(0,1fr) auto" }}
              onSubmit={(e) => { const f = form(e); run(() => addButler(String(f.get("name"))), "버틀러를 추가했습니다."); }}>
              <div className="field"><label htmlFor="bNew">버틀러 추가</label><input id="bNew" name="name" required placeholder="이름" /></div>
              <button className="btn" type="submit">추가</button>
            </form>
          </div>
          <div className="box"><h2>참석·정산 기록 입력</h2>
            {butlers.length === 0 || reservations.length === 0 ? (
              <p className="empty">버틀러와 확정된 예약이 모두 있어야 기록할 수 있습니다.</p>
            ) : (
              <form className="form" key={shifts.length} onSubmit={(e) => { const f = form(e); run(() => addShift({ butlerId: String(f.get("butler")), date: sDate, reservationId: sRes, pay: toInt(String(f.get("pay"))) }), "기록을 추가했습니다."); }}>
                <div className="field"><label htmlFor="sButler">버틀러</label><select id="sButler" name="butler">{butlers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                <div className="field"><label htmlFor="sRes">참석한 예약</label>
                  <select id="sRes" value={sRes} onChange={(e) => { setSRes(e.target.value); const r = reservations.find((x) => x.id === e.target.value); if (r) setSDate(r.date); }}>
                    {reservations.map((r) => <option key={r.id} value={r.id}>{`${md(r.date)} · ${r.couple} (${r.plan})`}</option>)}
                  </select></div>
                <div className="field"><label htmlFor="sDate">참석일</label><input id="sDate" type="date" required value={sDate} onChange={(e) => setSDate(e.target.value)} /></div>
                <div className="field"><label htmlFor="sPay">정산 금액(원)</label><input id="sPay" name="pay" required inputMode="numeric" placeholder="예: 120000" /></div>
                <button className="btn" type="submit">기록 추가</button>
              </form>
            )}
            <p className="note">예약을 고르면 참석일이 예식일로 자동 입력됩니다. 정산 금액은 건별로 직접 정합니다.</p>
          </div>
          <div className="box"><h2>참석·정산 내역 <small className="sub">{yy}년 {Number(mm)}월</small></h2>
            <div className="scroll"><table>
              <thead><tr><th>참석일</th><th>버틀러</th><th>예약</th><th className="r">정산 금액</th><th>지급</th><th /></tr></thead>
              <tbody>
                {ms.length === 0 && <tr><td colSpan={6} className="empty">이 달 기록이 없습니다.</td></tr>}
                {ms.map((s) => {
                  const r = reservations.find((x) => x.id === s.rid);
                  return (
                    <tr key={s.id}>
                      <td className="num">{md(s.date)}</td>
                      <td>{bName(s.butlerId)}</td>
                      <td>{r ? <>{r.couple} <small className="sub">{r.id}</small></> : <small className="sub">{s.rid}</small>}</td>
                      <td className="r"><input className="cell num" key={`${s.id}:${s.pay}`} inputMode="numeric" defaultValue={s.pay} aria-label="정산금액"
                        onBlur={(e) => { const v = toInt(e.target.value); if (v !== s.pay) run(() => updateShiftPay(s.id, v)); }} /></td>
                      <td><button type="button" className={`pill ${s.paid ? "good" : "warn"}`} onClick={() => run(() => setShiftPaid(s.id, !s.paid))}>{s.paid ? "지급 완료" : "미지급"}</button></td>
                      <td className="r"><button type="button" className="del" onClick={() => run(() => deleteShift(s.id), "삭제했습니다.")}>삭제</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={3}>합계</td><td className="r num">{won(pay)}</td><td colSpan={2} /></tr></tfoot>
            </table></div>
            <p className="note">&quot;미지급&quot;을 누르면 &quot;지급 완료&quot;로 바뀝니다. 정산 금액을 고치면 합계가 바로 갱신됩니다.</p>
          </div>
        </section>
      )}

      {tab === "bank" && (
        <section className="panel">
          <div className="box"><h2>통장 잔액 기준</h2>
            <div className="inline">
              <div className="field"><label htmlFor="bankDate">기준일 (잔액을 확인한 날)</label>
                <input id="bankDate" type="date" key={settings.bankDate} defaultValue={settings.bankDate}
                  onBlur={(e) => { if (e.target.value && e.target.value !== settings.bankDate) run(() => saveSettings({ bankDate: e.target.value }), "기준일을 저장했습니다."); }} /></div>
              <div className="field"><label htmlFor="bankBal">그날의 통장 잔액(원)</label>
                <input id="bankBal" inputMode="numeric" key={settings.bankBalance} defaultValue={settings.bankBalance}
                  onBlur={(e) => { const v = Number(e.target.value.replace(/[^0-9-]/g, "")) || 0; if (v !== settings.bankBalance) run(() => saveSettings({ bankBalance: v }), "잔액을 저장했습니다."); }} /></div>
            </div>
            <p className="note">기준일 이후의 입금과 출금만 반영합니다. 기준일 전의 매출과 비용은 이미 잔액에 들어 있다고 봅니다. 은행 잔액이 바뀌면 이 두 칸을 새로 입력하세요.</p>
          </div>
          <div className={lowest.end < 0 ? "warnbox" : "okbox"}>
            {lowest.end < 0
              ? `${lowest.m.replace("-", "년 ")}월에 잔액이 부족해질 것으로 예상됩니다 (${won(lowest.end)}). 비용이나 버틀러 정산 시기를 확인하세요.`
              : `6개월 동안 잔액이 부족해지는 달은 없습니다. 가장 낮은 달은 ${lowest.m.replace("-", "년 ")}월 ${won(lowest.end)}입니다.`}
          </div>
          <div className="box"><h2>월별 예상 잔액 (6개월)</h2>
            <div className="scroll"><table>
              <thead><tr><th>월</th><th className="r">입금 예정</th><th className="r">월 비용</th><th className="r">일회성</th><th className="r">버틀러 정산</th><th className="r">월말 예상 잔액</th></tr></thead>
              <tbody>
                {projection.map((p) => (
                  <tr key={p.m}>
                    <td className="num">{p.m.replace("-", "년 ")}월</td>
                    <td className="r num">{won(p.inc)}</td><td className="r num">{won(p.mon)}</td><td className="r num">{won(p.one)}</td><td className="r num">{won(p.pay)}</td>
                    <td className="r num" style={{ minWidth: 150 }}>
                      <b className={p.end < 0 ? "neg" : ""}>{won(p.end)}</b>
                      <div className="meter"><i style={{ width: `${(Math.abs(p.end) / maxAbs) * 100}%`, ...(p.end < 0 ? { background: "var(--bad)" } : {}) }} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <p className="note">입금 예정은 카드결제는 결제일 + {CARD_SETTLE_BUSINESS_DAYS}영업일(주말·공휴일 제외)에 수수료를 뗀 금액이, 현금은 예식일에 들어오는 것으로 계산합니다. 아직 입력하지 않은 잔금은 &quot;총액 − 카드결제&quot;로 예상합니다. 결제일은 예약 접수일입니다. 버틀러 정산은 기록한 것만 반영하며, 미지급 건은 지급 예정으로 봅니다. 출금은 월 비용의 시작일 일자, 일회성 비용의 날짜에 나가는 것으로 봅니다.</p>
          </div>
        </section>
      )}
      {tab === "recon" && (
        <section className="panel">
          <div className="box"><h2>결제 건 대사 <small className="sub">{yy}년 {Number(mm)}월 접수분</small></h2>
            <div className="inline">
              <button type="button" className="btn" disabled={reconBusy} onClick={checkRecon}>{reconBusy ? "확인하는 중…" : `${Number(mm)}월 결제 대사하기`}</button>
            </div>
            <p className="note">예약 DB의 결제 상태·금액을 포트원 결제 기록과 한 건씩 맞춰 보고, 어드민 예약과도 비교합니다. 읽기 전용이라 아무것도 바꾸지 않습니다. 결제일이 아니라 접수일 기준이며, 건수가 많으면 몇 초 걸립니다. 위쪽 월 선택(‹ ›)으로 달을 바꿉니다.</p>
            <p className="note">포트원 API는 카드 수수료와 은행 입금액을 건별로 제공하지 않아서, 수수료와 입금액 대사는 하지 않습니다. 수수료는 수입 탭의 요율로 계산합니다.</p>
          </div>
          {recon && (() => {
            const vis = recon.rows.filter((r) => !(hideTest && r.isTest));
            const hiddenTest = recon.rows.length - vis.length;
            const bad = vis.filter((r) => r.verdict === "mismatch");
            const order = { mismatch: 0, unpaid: 2, ok: 1 } as const;
            const rows = vis.slice().sort((a, b) => order[a.verdict] - order[b.verdict]);
            // 숨긴 테스트 거래를 뺀 합계를 다시 계산한다 (포트원은 취소 금액을 뺀 실제 결제액)
            const sum = {
              checked: vis.length,
              ok: vis.filter((r) => r.verdict === "ok").length,
              unpaid: vis.filter((r) => r.verdict === "unpaid").length,
              dbPaidTotal: vis.filter((r) => r.dbStatus === "paid").reduce((a, r) => a + r.dbAmount, 0),
              pgPaidTotal: vis.filter((r) => r.pgStatus === "PAID" || r.pgStatus === "PARTIAL_CANCELLED").reduce((a, r) => a + r.pgAmount - (r.pgCancelledAmount ?? 0), 0),
              adminPaidTotal: vis.filter((r) => r.dbStatus === "paid").reduce((a, r) => a + (r.adminPaid ?? 0), 0),
            };
            return (
              <>
                {reconMonth !== month && <div className="warnbox">아래 결과는 {reconMonth.replace("-", "년 ")}월 기준입니다. {Number(mm)}월은 다시 대사해 주세요.</div>}
                <div className={bad.length || recon.summary.failed ? "warnbox" : "okbox"}>
                  {bad.length
                    ? `확인이 필요한 결제가 ${bad.length}건 있습니다.`
                    : recon.summary.failed ? `${recon.summary.failed}건은 포트원 조회에 실패해 대사하지 못했습니다.` : `대사한 ${sum.checked}건 모두 일치합니다.`}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--text2)", fontWeight: 600 }}>
                  <input type="checkbox" checked={hideTest} onChange={(e) => setHideTest(e.target.checked)} />
                  테스트 거래 숨기기 <span className="sub">[TEST] 이름 또는 1,000원 이하 결제{hiddenTest ? ` · 지금 ${hiddenTest}건 숨김` : ""}</span>
                </label>
                <div className="sum">
                  <div className="tile"><small>대사한 결제</small><b className="num">{sum.checked}건</b><span>일치 {sum.ok} · 미결제 {sum.unpaid}</span></div>
                  <div className="tile net"><small>확인 필요</small><b className="num">{bad.length}건</b><span>조회 실패 {recon.summary.failed}건</span></div>
                  <div className="tile"><small>포트원 결제 합계</small><b className="num">{won(sum.pgPaidTotal)}</b><span>취소 금액 제외</span></div>
                  <div className="tile"><small>예약 DB 결제 합계</small><b className="num">{won(sum.dbPaidTotal)}</b><span>어드민 기록 {won(sum.adminPaidTotal)}</span></div>
                </div>
                <div className="box"><h2>대사 결과</h2>
                  <div className="scroll"><table style={{ minWidth: 760 }}>
                    <thead><tr><th>접수일</th><th>예약번호</th><th>예약 상태</th><th className="r">예약 금액</th><th>포트원 상태</th><th className="r">포트원 금액</th><th>판정</th></tr></thead>
                    <tbody>
                      {rows.length === 0 && <tr><td colSpan={7} className="empty">이 달에 접수된 예약이 없습니다.</td></tr>}
                      {rows.map((r) => (
                        <tr key={r.bookingNo}>
                          <td className="num">{md(r.createdAt.slice(0, 10))}</td>
                          <td className="num">{r.bookingNo}</td>
                          <td>{{ pending: "결제 대기", paid: "결제 완료", failed: "결제 실패", cancelled: "취소" }[r.dbStatus] ?? r.dbStatus}</td>
                          <td className="r num">{won(r.dbAmount)}</td>
                          <td>{r.pgStatus}</td>
                          <td className="r num">{won(r.pgAmount)}</td>
                          <td>{r.verdict === "ok" ? <span className="pill good">일치</span> : r.verdict === "unpaid" ? <span className="pill mute">미결제</span> : <><span className="pill bad">확인 필요</span><br /><small className="sub" style={{ color: "var(--bad)" }}>{r.reason}</small></>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
                {recon.failed.length > 0 && (
                  <div className="box"><h2>포트원 조회에 실패한 예약</h2>
                    {recon.failed.map((f) => <p className="note" key={f.bookingNo} style={{ margin: "4px 0" }}>{f.bookingNo} · {f.message}</p>)}
                  </div>
                )}
              </>
            );
          })()}
        </section>
      )}
    </div>
  );
}

const CSS = `
.fin { --panel:#F8F6F7; --soft:#F9EFF4; --line:#ECE7E9; --ink:#1E1A1C; --text2:#6E646A; --muted:#8C8188;
  --accent:#B0567E; --accent-dark:#98416A; --rose-tile:#F7EDF2; --beige-tile:#F2F1EE; --beige-ink:#4E4A43; --blue-tile:#EDF0F4; --blue-ink:#3E4C5C;
  --good:#2B6A45; --good-bg:#E3F1E8; --warn:#8A5A00; --warn-bg:#FBEFD9; --bad:#A8416C; --card:#B0567E; --cash:#D9A441;
  display:flex; flex-direction:column; gap:18px; font-size:14px; line-height:1.6; }
.fin h1 { font-size:27px; margin:0; font-weight:800; letter-spacing:-0.7px; }
.fin .num { font-variant-numeric:tabular-nums; }
.fin .top { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; }
.fin .month { display:flex; align-items:center; gap:4px; background:var(--panel); border-radius:14px; padding:4px; }
.fin .month button { width:34px; height:34px; border-radius:10px; color:var(--text2); }
.fin .month b { min-width:108px; text-align:center; font-weight:700; }
.fin button, .fin input, .fin select { font:inherit; color:inherit; }
.fin button { border:0; background:transparent; border-radius:10px; cursor:pointer; }
.fin button:hover { background:var(--soft); }
.fin button:focus-visible, .fin input:focus-visible, .fin select:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.fin .sum { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; }
.fin .tile { border-radius:18px; padding:20px 22px; min-height:112px; min-width:0; background:var(--rose-tile); }
.fin .tile:nth-child(2) { background:var(--beige-tile); color:var(--beige-ink); }
.fin .tile:nth-child(4) { background:var(--blue-tile); color:var(--blue-ink); }
.fin .tile:nth-child(5) { background:var(--panel); }
.fin .tile small { font-size:13px; display:block; opacity:.8; font-weight:600; }
.fin .tile b { display:block; font-size:22px; margin-top:4px; font-weight:800; letter-spacing:-0.4px; }
.fin .tile span { font-size:12.5px; opacity:.75; }
.fin .tile.net { background:var(--accent); color:#fff; }
.fin .tile.net small, .fin .tile.net span { opacity:.88; }
.fin .tabs { display:flex; gap:6px; overflow-x:auto; }
.fin .tabs button { padding:10px 18px; border-radius:12px; font-size:14.5px; font-weight:600; color:var(--text2); white-space:nowrap; }
.fin .tabs button[aria-selected="true"] { background:var(--soft); color:var(--accent); }
.fin .panel { display:flex; flex-direction:column; gap:14px; }
.fin .box { background:var(--panel); border-radius:18px; padding:20px; min-width:0; }
.fin .box h2 { font-size:15.5px; margin:0 0 14px; font-weight:700; }
.fin .sub { color:var(--muted); font-weight:400; font-size:12.5px; }
.fin .row2 { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; }
.fin .bar { display:flex; height:14px; border-radius:7px; overflow:hidden; background:var(--line); }
.fin .bar i { display:block; }
.fin .legend { display:flex; flex-wrap:wrap; gap:6px 18px; margin-top:12px; font-size:13px; color:var(--text2); }
.fin .legend b { color:var(--ink); }
.fin .legend span::before { content:""; display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; background:var(--c); }
.fin .scroll { overflow-x:auto; }
.fin table { width:100%; border-collapse:collapse; font-size:13.5px; min-width:640px; }
.fin th { text-align:left; font-weight:600; color:var(--muted); padding:8px 12px; border-bottom:1px solid var(--line); white-space:nowrap; font-size:12.5px; }
.fin td { padding:11px 12px; border-bottom:1px solid var(--line); vertical-align:middle; }
.fin th.r, .fin td.r { text-align:right; }
.fin tfoot td { font-weight:800; border-bottom:0; color:var(--accent); }
.fin tfoot td:first-child { color:var(--ink); }
.fin .empty { color:var(--muted); }
.fin .pill { display:inline-block; padding:3px 11px; border-radius:99px; font-size:12px; font-weight:700; }
.fin .pill.good { background:var(--good-bg); color:var(--good); }
.fin .pill.warn { background:var(--warn-bg); color:var(--warn); }
.fin .pill.bad { background:var(--rose-tile); color:var(--bad); }
.fin .pill.mute { background:var(--panel); color:var(--muted); }
.fin .btn:disabled { opacity:.6; cursor:default; }
.fin .field { display:flex; flex-direction:column; gap:4px; min-width:0; }
.fin .field label { font-size:12.5px; color:var(--muted); font-weight:600; }
.fin .field input, .fin .field select { border:1px solid var(--line); background:#fff; border-radius:12px; padding:10px 12px; min-width:0; width:100%; }
.fin td input.cell { width:112px; text-align:right; border:1px solid var(--line); background:#fff; border-radius:10px; padding:6px 10px; }
.fin .form { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; align-items:end; }
.fin .btn { background:var(--accent); color:#fff; padding:11px 18px; font-weight:700; border-radius:12px; }
.fin .btn:hover { background:var(--accent-dark); }
.fin .del { color:var(--muted); padding:4px 8px; font-size:12.5px; }
.fin .del:hover { color:var(--bad); background:transparent; }
.fin .butlers { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; }
.fin .bcard { border-radius:14px; padding:16px 18px; background:#fff; display:flex; flex-direction:column; gap:2px; }
.fin .bcard b { font-size:15.5px; }
.fin .bcard small { color:var(--muted); }
.fin .bcard .owe { margin-top:6px; font-size:18px; font-weight:800; color:var(--accent); }
.fin .bcard .owe.zero { color:var(--good); }
.fin .note { font-size:12.5px; color:var(--muted); margin:12px 0 0; }
.fin .neg { color:var(--bad) !important; }
.fin .meter { height:6px; border-radius:3px; background:var(--line); margin-top:6px; overflow:hidden; }
.fin .meter i { display:block; height:100%; background:var(--accent); border-radius:3px; }
.fin .inline { display:flex; flex-wrap:wrap; gap:12px; align-items:end; }
.fin .inline .field { width:170px; }
.fin .warnbox { background:var(--warn-bg); color:var(--warn); border-radius:12px; padding:10px 14px; font-weight:600; font-size:13.5px; }
.fin .okbox { background:var(--good-bg); color:var(--good); border-radius:12px; padding:10px 14px; font-weight:600; font-size:13.5px; }
@media (max-width:760px) { .fin .row2 { grid-template-columns:minmax(0,1fr); } }
`;
