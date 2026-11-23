"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssignmentView } from "@/lib/assign";
import { deskSideOptions, won } from "@/lib/pricing";
import { useToast } from "./ToastContext";

// 카카오톡 팀 단톡방에 올릴 버틀러 모집 문구 (2026-11-23 루리님 요청).
// 단톡방 자동 발송 API가 없어서, 휴대폰은 공유창(Web Share)으로 카카오톡 → 방 선택, PC는 문구를 복사해 붙여 넣는다.
// 고객 이름·연락처는 넣지 않는다. 담당은 "신랑측/신부측/양가 통합"만 쓴다.

/** 모집 문구에 보여 줄 스태프 페이 구성 (2026-11-23 루리님: 기본급 65,000 + 차비 10,000 = 75,000). 매니저 페이는 문구에 넣지 않는다. */
const STAFF_PAY = { base: 65000, transport: 10000 };
const RECRUIT_GRADES = { staff: "스태프 버틀러", manager: "매니저 버틀러" } as const;
type RecruitGrade = keyof typeof RECRUIT_GRADES;

const selectStyle: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "#1E1A1C", minWidth: 0 };
const btn: React.CSSProperties = { height: 38, padding: "0 16px", border: 0, borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer" };

export function recruitText(o: { dateLabel: string; venue: string; arriveBy: string; side: string; grade: RecruitGrade; need: number }): string {
  return [
    "[웨딩버틀러 버틀러 모집]",
    `예식: ${o.dateLabel}`,
    `장소: ${o.venue || "추후 안내"}`,
    `도착: ${o.arriveBy === "추후 안내" ? "추후 안내" : `${o.arriveBy}까지 (예식 1시간 전)`}`,
    ...(o.side ? [`담당: ${o.side}`] : []),
    `모집: ${RECRUIT_GRADES[o.grade]} ${o.need}명`,
    ...(o.grade === "staff" ? [`페이: ${won(STAFF_PAY.base + STAFF_PAY.transport)} (기본급 ${won(STAFF_PAY.base)} + 차비 ${won(STAFF_PAY.transport)})`] : []),
    "가능하신 분은 답장 주세요!",
  ].join("\n");
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래 방식으로 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

/** 예약 상세 배정 카드 안의 "단톡방 모집 공유". 확정 예약에 남은 자리가 있을 때만 보인다 (ButlerAssign.tsx). */
export default function StaffRecruitShare({ required, data }: { required: number; data: AssignmentView }) {
  const toast = useToast();
  const remaining = Math.max(0, required - data.assigned.length);
  const sideOptions = deskSideOptions(data.side, data.plan);
  const fixedSide = data.side === "신랑측" || data.side === "신부측" ? data.side : "";
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState<RecruitGrade>("staff");
  const [side, setSide] = useState<string>(sideOptions[0] ?? "");
  const [need, setNeed] = useState(remaining || 1);
  const generated = useMemo(
    () => recruitText({ ...data.share, side: sideOptions.length ? side : fixedSide, grade, need }),
    [data.share, side, fixedSide, sideOptions.length, grade, need],
  );
  const [text, setText] = useState(generated);
  useEffect(() => { setText(generated); }, [generated]);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"); }, []);

  async function onShare() {
    if (canShare) {
      try { await navigator.share({ text }); return; } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // 공유창을 닫음
      }
    }
    toast((await copy(text)) ? "모집 문구를 복사했습니다. 카카오톡 단톡방에 붙여 넣어 주세요." : "복사하지 못했습니다. 문구를 길게 눌러 직접 복사해 주세요.");
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #F4F1F3" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>단톡방 모집 공유</b>
        <span style={{ fontSize: 12.5, color: "#A79BA1" }}>모집 문구를 만들어 카카오톡 팀 채팅방에 보냅니다 (고객 이름·연락처 제외).</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setOpen(!open)} style={{ border: 0, background: "transparent", color: "#8A3F61", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{open ? "닫기" : "문구 만들기"}</button>
      </div>

      {open && (
        <div style={{ marginTop: 10, padding: 14, borderRadius: 14, background: "#FAF7F9" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select style={selectStyle} value={grade} onChange={(e) => setGrade(e.target.value as RecruitGrade)} aria-label="모집 등급">
              {(Object.keys(RECRUIT_GRADES) as RecruitGrade[]).map((g) => <option key={g} value={g}>{RECRUIT_GRADES[g]}</option>)}
            </select>
            {sideOptions.length > 0 && (
              <select style={selectStyle} value={side} onChange={(e) => setSide(e.target.value)} aria-label="담당 쪽">
                {sideOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <label style={{ fontSize: 13, color: "#6E646A" }}>모집 <input type="number" min={1} value={need} onChange={(e) => setNeed(Math.max(1, Number(e.target.value) || 1))} style={{ ...selectStyle, width: 56 }} />명 (남은 자리 {remaining}명)</label>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} aria-label="모집 문구"
            style={{ display: "block", width: "100%", boxSizing: "border-box", margin: "12px 0", padding: "12px 14px", border: 0, borderRadius: 12, background: "#FEF9DC", color: "#3C3A2E", fontSize: 13, lineHeight: 1.7, fontFamily: "inherit", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void onShare()} style={{ ...btn, background: "#FEE500", color: "#191600" }}>{canShare ? "카카오톡으로 공유" : "문구 복사"}</button>
            {canShare && <button type="button" onClick={async () => toast((await copy(text)) ? "모집 문구를 복사했습니다." : "복사하지 못했습니다.")} style={{ ...btn, background: "#F1ECEF", color: "#5B4F56" }}>문구 복사</button>}
            {text !== generated && <button type="button" onClick={() => setText(generated)} style={{ ...btn, background: "transparent", color: "#8C8188", fontWeight: 600 }}>처음 문구로</button>}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#A79BA1" }}>휴대폰은 공유창에서 카카오톡 → 팀 채팅방을 고르면 됩니다. PC는 복사한 뒤 카카오톡 PC에 붙여 넣어 주세요.</p>
        </div>
      )}
    </div>
  );
}
