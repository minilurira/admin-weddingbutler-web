"use client";

import { Fragment, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastContext";
import { CSS } from "./FinanceView";
import { won } from "@/lib/pricing";
import { formatPhone } from "@/lib/format";
import { INCOME_TYPES, withholding, type IncomeType } from "@/lib/taxCalc";
import type { CommissionStatus, PartnerView } from "@/lib/referral";
import {
  cancelReferralPayout, deleteReferralPartner, issueReferralCode, resendReferralSms, saveTaxInfo, settleReferral, updateReferralPartner,
} from "@/lib/referralActions";

type Tab = "codes" | "settle" | "tax";
type Res = { ok: boolean; message: string };

const ST: Record<CommissionStatus, { label: string; cls: string }> = {
  pending: { label: "예식 전", cls: "warn" },
  ready: { label: "정산 가능", cls: "bad" },
  paid: { label: "정산 완료", cls: "good" },
  void: { label: "제외", cls: "mute" },
};
const PARTNER_TYPES: IncomeType[] = ["business", "other"];
const md = (d: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "-");
const prevMonth = (today: string) => {
  const [y, m] = today.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export default function ReferralView({ partners, today, residentKeyReady }: { partners: PartnerView[]; today: string; residentKeyReady: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("codes");
  const [open, setOpen] = useState(""); // 상세를 펼친 코드 주인 id
  const [q, setQ] = useState("");
  const [taxMonth, setTaxMonth] = useState(today.slice(0, 7));

  function run(fn: () => Promise<Res>, after?: (r: Res) => void) {
    startTransition(async () => {
      try {
        const r = await fn();
        toast(r.message);
        if (r.ok) router.refresh();
        after?.(r);
      } catch (e) {
        toast(e instanceof Error ? e.message : "처리하지 못했습니다.");
      }
    });
  }
  const form = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); return new FormData(e.currentTarget); };
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast("복사했습니다."), () => toast(text));

  const all = partners.flatMap((p) => p.commissions);
  const sumBy = (s: CommissionStatus) => all.filter((c) => c.status === s).reduce((a, c) => a + c.amount, 0);
  const readyPartners = partners.filter((p) => p.commissions.some((c) => c.status === "ready"));
  const shown = partners.filter((p) => !q.trim() || `${p.name} ${p.code} ${p.phone}`.toLowerCase().includes(q.trim().toLowerCase().replace(/-/g, "")));
  const monthPayouts = partners.flatMap((p) => p.payouts.filter((x) => !x.cancelled && x.paidAt.startsWith(taxMonth)).map((x) => ({ ...x, name: p.name, code: p.code })));

  return (
    <div className="fin">
      <style>{CSS}</style>
      <div className="top">
        <h1>영업대행</h1>
        <div className="tabs" role="tablist">
          {([["codes", "코드 목록"], ["settle", `정산${readyPartners.length ? ` (${readyPartners.length})` : ""}`], ["tax", "원천세 내역"]] as [Tab, string][]).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="sum">
        <div className="tile"><small>발급한 코드</small><b className="num">{partners.length}개</b><span>정지 {partners.filter((p) => p.status !== "active").length}개</span></div>
        <div className="tile"><small>예식 전 (예상)</small><b className="num">{won(sumBy("pending"))}</b><span>{all.filter((c) => c.status === "pending").length}건</span></div>
        <div className="tile net"><small>정산 가능</small><b className="num">{won(sumBy("ready"))}</b><span>{readyPartners.length}명 · [정산]을 눌러야 지급 처리됩니다</span></div>
        <div className="tile"><small>정산 완료 (세전)</small><b className="num">{won(sumBy("paid"))}</b><span>{all.filter((c) => c.status === "paid").length}건</span></div>
      </div>

      {!residentKeyReady && (
        <p className="box" style={{ margin: 0, color: "var(--bad)", fontWeight: 600 }}>
          주민등록번호 암호화 키(PII_ENCRYPTION_KEY)가 Vercel 환경변수에 없어 주민등록번호를 저장할 수 없습니다. 키를 추가하기 전에는 [정산]도 할 수 없습니다.
        </p>
      )}

      {tab === "codes" && (
        <section className="panel">
          <div className="box"><h2>코드 발급 <small className="sub">누구에게나 발급할 수 있습니다. 휴대폰 번호당 1개</small></h2>
            <form className="form" onSubmit={(e) => {
              const f = form(e);
              const el = e.currentTarget;
              run(() => issueReferralCode({
                name: String(f.get("name")), phone: String(f.get("phone")), ratePercent: Number(f.get("rate")) || 5, incomeType: String(f.get("incomeType")),
                memo: String(f.get("memo") ?? ""), sendSms: f.get("sms") === "on",
                bankName: String(f.get("bank") ?? ""), accountNumber: String(f.get("acct") ?? ""), accountHolder: String(f.get("holder") ?? ""),
              }), (r) => { if (r.ok) el.reset(); });
            }}>
              <div className="field"><label htmlFor="rName">이름</label><input id="rName" name="name" required placeholder="홍길동" /></div>
              <div className="field"><label htmlFor="rPhone">휴대폰</label><input id="rPhone" name="phone" required type="tel" inputMode="tel" placeholder="010-0000-0000" /></div>
              <div className="field"><label htmlFor="rRate">수수료율(%)</label><input id="rRate" name="rate" inputMode="decimal" defaultValue="5" /></div>
              <div className="field"><label htmlFor="rType">소득 구분</label>
                <select id="rType" name="incomeType" defaultValue="business">
                  {PARTNER_TYPES.map((t) => <option key={t} value={t}>{INCOME_TYPES[t].label}</option>)}
                </select></div>
              <div className="field"><label htmlFor="rBank">은행 (선택)</label><input id="rBank" name="bank" placeholder="국민" /></div>
              <div className="field"><label htmlFor="rAcct">계좌번호 (선택)</label><input id="rAcct" name="acct" inputMode="numeric" /></div>
              <div className="field"><label htmlFor="rHolder">예금주 (선택)</label><input id="rHolder" name="holder" /></div>
              <div className="field"><label htmlFor="rMemo">메모</label><input id="rMemo" name="memo" placeholder="예: 플래너 지인" /></div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text2)" }}><input type="checkbox" name="sms" defaultChecked /> 코드·링크 문자 보내기</label>
              <button className="btn" type="submit" disabled={pending}>발급</button>
            </form>
            <p className="note" style={{ fontSize: 12.5, color: "var(--muted)", margin: "10px 0 0" }}>
              계속 소개해 줄 사람은 사업소득(3.3%), 한두 번 소개하는 지인은 기타소득(8.8%, 1회 125,000원 이하면 0원)으로 고르세요. 주민등록번호는 발급 후 상세에서 입력합니다(정산 전 필수).
            </p>
          </div>

          <div className="box"><h2>코드 목록 <small className="sub">셀프 발급은 홈페이지 예약 조회에서 이전 결제 고객만 할 수 있습니다</small></h2>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·코드·휴대폰 검색" aria-label="검색"
              style={{ border: "1px solid var(--line)", background: "#fff", borderRadius: 12, padding: "9px 12px", width: "100%", maxWidth: 320, marginBottom: 10, boxSizing: "border-box" }} />
            <div className="scroll"><table style={{ minWidth: 860 }}>
              <thead><tr><th>이름</th><th>코드</th><th>발급</th><th className="r">예약</th><th className="r">예식 전</th><th className="r">정산 가능</th><th className="r">정산 완료</th><th>정산 준비</th><th /></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={9} className="empty">{partners.length ? "검색 결과가 없습니다." : "아직 발급한 코드가 없습니다."}</td></tr>}
                {shown.map((p) => {
                  const s = (st: CommissionStatus) => p.commissions.filter((c) => c.status === st).reduce((a, c) => a + c.amount, 0);
                  const isOpen = open === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr>
                        <td><b>{p.name}</b>{p.status !== "active" && <> <span className="pill mute">정지</span></>}<br /><small className="sub num">{formatPhone(p.phone)}</small></td>
                        <td className="num"><b>{p.code}</b> <button type="button" className="del" onClick={() => copy(p.url)}>링크 복사</button></td>
                        <td><small className="sub">{p.issuedBy === "self" ? "셀프" : "어드민"} · {p.createdAt}</small></td>
                        <td className="r num">{p.commissions.filter((c) => c.status !== "void").length}</td>
                        <td className="r num">{won(s("pending"))}</td>
                        <td className="r num" style={{ color: s("ready") ? "var(--accent)" : undefined, fontWeight: s("ready") ? 700 : 400 }}>{won(s("ready"))}</td>
                        <td className="r num">{won(s("paid"))}</td>
                        <td>{p.blocker ? <span className="pill warn">{p.blocker}</span> : <span className="pill good">완료</span>}</td>
                        <td className="r"><button type="button" className="del" onClick={() => setOpen(isOpen ? "" : p.id)}>{isOpen ? "닫기" : "상세"}</button></td>
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={9} style={{ background: "#fff" }}>
                          <PartnerDetail p={p} pending={pending} run={run} copy={copy} residentKeyReady={residentKeyReady} onDeleted={() => setOpen("")} />
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </section>
      )}

      {tab === "settle" && (
        <section className="panel">
          <div className="box" style={{ background: "var(--soft)" }}>
            <h2 style={{ marginBottom: 6 }}>정산 방법</h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text2)" }}>
              예식이 끝난 확정 예약의 수수료가 아래에 사람별로 모입니다. 자동으로 지급되지 않습니다. 매달 1~5일에 지난달({prevMonth(today).replace("-", "년 ")}월) 예식 건까지 <b>실지급액</b>을 계좌로 이체한 뒤 <b>[정산]</b>을 눌러 기록하세요. 누르면 코드 주인에게 안내 문자가 갑니다.
            </p>
          </div>
          {readyPartners.length === 0 && <div className="box"><p className="empty" style={{ margin: 0 }}>지금 정산할 수수료가 없습니다.</p></div>}
          {readyPartners.map((p) => <SettleBox key={p.id} p={p} pending={pending} run={run} copy={copy} />)}
        </section>
      )}

      {tab === "tax" && (
        <section className="panel">
          <div className="box"><h2>원천세 내역 <small className="sub">지급한 달 기준 · 원천세는 지급한 다음 달 10일까지 신고·납부</small></h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 12 }}>
              <div className="field"><label htmlFor="taxMonth">지급한 달</label><input id="taxMonth" type="month" value={taxMonth} onChange={(e) => setTaxMonth(e.target.value)} /></div>
              <a className="btn" href={`/api/admin/withholding?month=${taxMonth}`} style={{ textDecoration: "none" }}>엑셀(CSV) 내려받기</a>
            </div>
            <div className="scroll"><table>
              <thead><tr><th>지급일</th><th>이름</th><th>소득 구분</th><th className="r">지급액</th><th className="r">소득세</th><th className="r">지방소득세</th><th className="r">실지급액</th></tr></thead>
              <tbody>
                {monthPayouts.length === 0 && <tr><td colSpan={7} className="empty">이 달 영업대행 정산이 없습니다.</td></tr>}
                {monthPayouts.map((x) => (
                  <tr key={x.id}><td className="num">{x.paidAt}</td><td>{x.name} <small className="sub">{x.code}</small></td><td>{INCOME_TYPES[x.incomeType as IncomeType]?.label ?? x.incomeType}</td>
                    <td className="r num">{won(x.grossAmount)}</td><td className="r num">{won(x.incomeTax)}</td><td className="r num">{won(x.localTax)}</td><td className="r num"><b>{won(x.netAmount)}</b></td></tr>
                ))}
              </tbody>
            </table></div>
            <p className="note" style={{ fontSize: 12.5, color: "var(--muted)", margin: "10px 0 0" }}>
              내려받은 파일에는 버틀러 정산(지급 완료 처리한 참석 기록)도 함께 들어가며, 주민등록번호 전체가 담깁니다. 홈택스 입력이나 세무사 전달에만 쓰고 보관에 주의해 주세요.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function PartnerDetail({ p, pending, run, copy, residentKeyReady, onDeleted }: {
  p: PartnerView; pending: boolean; run: (fn: () => Promise<Res>, after?: (r: Res) => void) => void; copy: (t: string) => void; residentKeyReady: boolean; onDeleted: () => void;
}) {
  const [acctEdit, setAcctEdit] = useState(!p.accountNumber);
  const [rrn, setRrn] = useState("");
  const box: React.CSSProperties = { background: "var(--panel)", borderRadius: 14, padding: 14, minWidth: 0 };
  const h3: React.CSSProperties = { fontSize: 13.5, margin: "0 0 8px", fontWeight: 700 };
  const inp: React.CSSProperties = { border: "1px solid var(--line)", background: "#fff", borderRadius: 10, padding: "7px 10px", minWidth: 0 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "6px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div style={box}>
          <h3 style={h3}>코드</h3>
          <div className="num" style={{ fontSize: 13, wordBreak: "break-all" }}>{p.url}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <button type="button" className="del" onClick={() => copy(p.url)}>링크 복사</button>
            <button type="button" className="del" disabled={pending} onClick={() => run(() => resendReferralSms(p.id))}>안내 문자 다시 보내기</button>
            <button type="button" className="del" disabled={pending} onClick={() => {
              if (window.confirm(p.status === "active" ? "이 코드를 정지할까요? 정지 후 새 예약에는 적용되지 않습니다." : "이 코드를 다시 사용할 수 있게 할까요?")) run(() => updateReferralPartner(p.id, { status: p.status === "active" ? "blocked" : "active" }));
            }}>{p.status === "active" ? "정지" : "정지 해제"}</button>
            {p.commissions.length === 0 && <button type="button" className="del" disabled={pending} onClick={() => { if (window.confirm("코드를 삭제할까요?")) run(() => deleteReferralPartner(p.id), (r) => r.ok && onDeleted()); }}>삭제</button>}
          </div>
          <form style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => updateReferralPartner(p.id, { ratePercent: Number(f.get("rate")), memo: String(f.get("memo") ?? "") })); }}>
            <label style={{ fontSize: 12.5, color: "var(--muted)" }}>수수료율</label>
            <input name="rate" defaultValue={p.ratePercent} inputMode="decimal" style={{ ...inp, width: 56 }} />%
            <input name="memo" defaultValue={p.memo} placeholder="메모" style={{ ...inp, flex: "1 1 100px" }} />
            <button className="del" type="submit" disabled={pending}>저장</button>
          </form>
        </div>

        <div style={box}>
          <h3 style={h3}>정산 계좌 {p.accountNumber && (p.accountChecked ? <span className="pill good">예금주 확인</span> : <span className="pill warn">확인 필요</span>)}</h3>
          {acctEdit ? (
            <form style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => updateReferralPartner(p.id, { bankName: String(f.get("bank")), accountNumber: String(f.get("acct")), accountHolder: String(f.get("holder")) }), (r) => r.ok && setAcctEdit(false)); }}>
              <input name="bank" defaultValue={p.bankName} placeholder="은행" style={{ ...inp, width: 70 }} />
              <input name="acct" defaultValue={p.accountNumber} placeholder="계좌번호" inputMode="numeric" style={{ ...inp, flex: "1 1 120px" }} />
              <input name="holder" defaultValue={p.accountHolder || p.name} placeholder="예금주" style={{ ...inp, width: 80 }} />
              <button className="del" type="submit" disabled={pending}>저장</button>
              {p.accountNumber && <button type="button" className="del" onClick={() => setAcctEdit(false)}>취소</button>}
            </form>
          ) : (
            <>
              <div className="num" style={{ fontSize: 13 }}>{p.bankName} {p.accountNumber} {p.accountHolder}</div>
              {p.holderMismatch && <div style={{ fontSize: 12.5, color: "var(--bad)", marginTop: 4 }}>예금주({p.accountHolder})가 코드 주인 이름({p.name})과 다릅니다.</div>}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button type="button" className="del" onClick={() => setAcctEdit(true)}>수정</button>
                {!p.accountChecked
                  ? <button type="button" className="del" disabled={pending} onClick={() => run(() => updateReferralPartner(p.id, { accountChecked: true }))}>예금주 확인 완료</button>
                  : <button type="button" className="del" disabled={pending} onClick={() => run(() => updateReferralPartner(p.id, { accountChecked: false }))}>확인 취소</button>}
              </div>
            </>
          )}
        </div>

        <div style={box}>
          <h3 style={h3}>원천징수</h3>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select value={p.incomeType} aria-label="소득 구분" style={inp} disabled={pending}
              onChange={(e) => run(() => saveTaxInfo("partner", p.id, { incomeType: e.target.value }))}>
              {!p.incomeType && <option value="">소득 구분 선택</option>}
              {PARTNER_TYPES.map((t) => <option key={t} value={t}>{INCOME_TYPES[t].label}</option>)}
            </select>
          </div>
          {p.incomeType === "other" && p.payoutCount >= 2 && <div style={{ fontSize: 12.5, color: "var(--bad)", marginTop: 6 }}>이미 {p.payoutCount}번 정산했습니다. 반복 지급은 사업소득(3.3%)으로 바꾸는 것을 권장합니다.</div>}
          <form style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); run(() => saveTaxInfo("partner", p.id, { residentNo: rrn }), (r) => r.ok && setRrn("")); }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>주민등록번호</span>
            {p.residentNoMasked && <span className="num" style={{ fontSize: 13 }}>{p.residentNoMasked}</span>}
            <input value={rrn} onChange={(e) => setRrn(e.target.value.replace(/[^0-9-]/g, "").slice(0, 14))} placeholder={p.residentNoMasked ? "변경 시 입력" : "000000-0000000"} inputMode="numeric" autoComplete="off" style={{ ...inp, width: 140 }} disabled={!residentKeyReady} />
            <button className="del" type="submit" disabled={pending || !residentKeyReady || rrn.replace(/[^0-9]/g, "").length !== 13}>저장</button>
          </form>
        </div>
      </div>

      <div style={box}>
        <h3 style={h3}>추천 예약</h3>
        {p.commissions.length === 0 ? <p className="empty" style={{ margin: 0, fontSize: 13 }}>아직 이 코드로 들어온 예약이 없습니다.</p> : (
          <div className="scroll"><table style={{ minWidth: 560 }}>
            <thead><tr><th>예식일</th><th>예약</th><th className="r">기준 금액</th><th className="r">수수료</th><th>상태</th></tr></thead>
            <tbody>{p.commissions.map((c) => (
              <tr key={c.id}><td className="num">{c.weddingDate || "-"}</td><td><a href={`/reservations?id=${encodeURIComponent(c.reservationId)}`} style={{ color: "inherit" }}>{c.customer}</a> <small className="sub">{c.reservationId}</small></td>
                <td className="r num">{won(c.baseAmount)}</td><td className="r num">{won(c.amount)} <small className="sub">{c.ratePercent}%</small></td>
                <td><span className={`pill ${ST[c.status].cls}`}>{ST[c.status].label}</span>{c.voidReason && <small className="sub"> {c.voidReason}</small>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {p.payouts.length > 0 && (
        <div style={box}>
          <h3 style={h3}>정산 내역</h3>
          <div className="scroll"><table style={{ minWidth: 640 }}>
            <thead><tr><th>정산일</th><th>예식 달</th><th className="r">수수료</th><th className="r">원천징수</th><th className="r">실지급액</th><th>처리</th><th /></tr></thead>
            <tbody>{p.payouts.map((x) => (
              <tr key={x.id} style={{ opacity: x.cancelled ? 0.5 : 1 }}>
                <td className="num">{x.paidAt}</td><td className="num">{x.period}</td><td className="r num">{won(x.grossAmount)}</td>
                <td className="r num">{won(x.incomeTax + x.localTax)} <small className="sub">{INCOME_TYPES[x.incomeType as IncomeType]?.short}</small></td>
                <td className="r num"><b>{won(x.netAmount)}</b></td>
                <td><small className="sub">{x.paidBy}{x.memo ? ` · ${x.memo}` : ""}</small></td>
                <td className="r">{x.cancelled ? <span className="pill mute">취소됨</span> : <button type="button" className="del" disabled={pending} onClick={() => { if (window.confirm("이 정산을 취소할까요? 수수료가 다시 '정산 가능'으로 돌아갑니다. 이미 이체한 돈은 따로 처리해 주세요.")) run(() => cancelReferralPayout(x.id)); }}>정산 취소</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

function SettleBox({ p, pending, run, copy }: { p: PartnerView; pending: boolean; run: (fn: () => Promise<Res>) => void; copy: (t: string) => void }) {
  const ready = p.commissions.filter((c) => c.status === "ready");
  const [sel, setSel] = useState<string[]>(ready.map((c) => c.id));
  const [override, setOverride] = useState("");
  const [memo, setMemo] = useState("");
  const picked = ready.filter((c) => sel.includes(c.id));
  const sum = picked.reduce((a, c) => a + c.amount, 0);
  const gross = override.trim() ? Number(override.replace(/[^0-9]/g, "")) || 0 : sum;
  const type = (p.incomeType || "other") as IncomeType;
  const w = withholding(type, gross);

  function settle() {
    const lines = [
      `${p.name}님 정산을 기록합니다.`,
      `수수료 ${won(w.gross)} − 소득세 ${won(w.incomeTax)} − 지방소득세 ${won(w.localTax)} = 실지급액 ${won(w.net)}`,
      `계좌: ${p.bankName} ${p.accountNumber} ${p.accountHolder}`,
      "이 금액을 이체했나요? 확인을 누르면 '정산 완료'로 기록하고 안내 문자를 보냅니다.",
    ];
    if (!window.confirm(lines.join("\n"))) return;
    run(() => settleReferral({ partnerId: p.id, commissionIds: picked.map((c) => c.id), grossOverride: override.trim() ? gross : null, memo }));
  }

  return (
    <div className="box">
      <h2 style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {p.name} <small className="sub num">{p.code} · {INCOME_TYPES[type].label}{p.incomeType ? "" : " (미지정)"}</small>
        {p.blocker && <span className="pill warn">{p.blocker}</span>}
      </h2>
      {p.incomeType === "other" && p.payoutCount >= 2 && <p style={{ margin: "-6px 0 10px", fontSize: 12.5, color: "var(--bad)" }}>세 번째 이상 정산입니다. 반복 지급은 사업소득(3.3%)으로 바꾸는 것을 권장합니다(코드 목록 → 상세).</p>}
      <div className="scroll"><table style={{ minWidth: 520 }}>
        <thead><tr><th /><th>예식일</th><th>예약</th><th className="r">기준 금액</th><th className="r">수수료</th></tr></thead>
        <tbody>{ready.map((c) => (
          <tr key={c.id}>
            <td><input type="checkbox" aria-label={`${c.customer} 선택`} checked={sel.includes(c.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} /></td>
            <td className="num">{md(c.weddingDate)}</td><td>{c.customer} <small className="sub">{c.reservationId}</small></td>
            <td className="r num">{won(c.baseAmount)}</td><td className="r num">{won(c.amount)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginTop: 12 }}>
        <div className="field" style={{ width: 150 }}><label htmlFor={`ov-${p.id}`}>수수료 합계(조정 시)</label><input id={`ov-${p.id}`} inputMode="numeric" value={override} placeholder={sum.toLocaleString("ko-KR")} onChange={(e) => setOverride(e.target.value.replace(/[^0-9]/g, ""))} /></div>
        <div className="field" style={{ flex: "1 1 160px" }}><label htmlFor={`memo-${p.id}`}>메모</label><input id={`memo-${p.id}`} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 12월 정산" /></div>
        <div style={{ fontSize: 13, color: "var(--text2)", minWidth: 220 }}>
          수수료 <b className="num">{won(w.gross)}</b> − 원천징수 <b className="num">{won(w.incomeTax + w.localTax)}</b>{w.note && <small className="sub"> ({w.note})</small>}<br />
          실지급액 <b className="num" style={{ fontSize: 19, color: "var(--accent)" }}>{won(w.net)}</b>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {p.accountNumber && <button type="button" className="del" onClick={() => copy(`${p.bankName} ${p.accountNumber} ${p.accountHolder}`)}>계좌 복사</button>}
          <button type="button" className="btn" disabled={pending || !!p.blocker || picked.length === 0} onClick={settle}>정산</button>
        </div>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--muted)" }}>계좌: {p.accountNumber ? `${p.bankName} ${p.accountNumber} ${p.accountHolder}` : "미등록"}</p>
    </div>
  );
}
