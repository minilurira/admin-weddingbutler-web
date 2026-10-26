"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAdminUser, saveAdminPhone, setAdminPassword, type AdminResult } from "@/lib/adminUserActions";
import { formatPhone } from "@/lib/format";
import { useToast } from "./ToastContext";

interface Row { id: string; name: string; username: string; phone: string }

const input: React.CSSProperties = { border: 0, background: "#FFFFFF", borderRadius: 12, padding: "0 14px", height: 44, fontSize: 14, color: "#1E1A1C", boxSizing: "border-box", width: "100%" };
const btn: React.CSSProperties = { height: 44, padding: "0 16px", border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "#F1EDEF", color: "#473A3F" };

export default function AdminUsers({ users }: { users: Row[] }) {
  const toast = useToast();
  const router = useRouter();
  const [, start] = useTransition();
  const [phones, setPhones] = useState<Record<string, string>>(() => Object.fromEntries(users.map((u) => [u.id, u.phone ? formatPhone(u.phone) : ""])));
  const [pwOpen, setPwOpen] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState({ name: "", username: "", password: "", phone: "" });
  const [adding, setAdding] = useState(false);

  function run(fn: () => Promise<AdminResult>, after?: () => void) {
    setBusy(true);
    start(async () => {
      try {
        const r = await fn();
        toast(r.message);
        if (r.ok) { after?.(); router.refresh(); }
      } finally { setBusy(false); }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px" }}>관리자 관리</h1>
      <p style={{ margin: 0, fontSize: 13.5, color: "#6E646A", lineHeight: 1.7 }}>
        휴대폰 번호는 로그인 화면의 <b>비밀번호 찾기</b>에서 인증번호 문자를 받는 번호입니다. 번호가 없는 계정은 비밀번호 찾기를 쓸 수 없어요.
      </p>

      {users.map((u) => (
        <section key={u.id} style={{ background: "#F8F6F7", borderRadius: 16, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 16 }}>{u.name}</b>
            <span style={{ fontSize: 13, color: "#8C8188" }}>아이디 {u.username}</span>
            {!u.phone && <span style={{ fontSize: 12, fontWeight: 700, color: "#A8416C", background: "#FBEEF2", borderRadius: 999, padding: "2px 10px" }}>번호 미등록</span>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input aria-label={`${u.name} 휴대폰 번호`} inputMode="tel" value={phones[u.id] ?? ""} onChange={(e) => setPhones((p) => ({ ...p, [u.id]: e.target.value }))} placeholder="010-0000-0000" style={{ ...input, flex: "1 1 200px", width: "auto" }} />
            <button type="button" disabled={busy} style={btn} onClick={() => run(() => saveAdminPhone(u.id, phones[u.id] ?? ""))}>번호 저장</button>
            <button type="button" disabled={busy} style={ghost} onClick={() => { setPwOpen(pwOpen === u.id ? null : u.id); setPw(""); }}>비밀번호 변경</button>
          </div>
          {pwOpen === u.id && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input type="password" autoComplete="new-password" aria-label="새 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호 (8자 이상)" style={{ ...input, flex: "1 1 200px", width: "auto" }} />
              <button type="button" disabled={busy || pw.length < 8} style={{ ...btn, opacity: pw.length < 8 ? 0.55 : 1 }} onClick={() => run(() => setAdminPassword(u.id, pw), () => { setPwOpen(null); setPw(""); })}>변경하기</button>
            </div>
          )}
        </section>
      ))}

      <section style={{ background: "#F8F6F7", borderRadius: 16, padding: "16px 18px" }}>
        {!adding ? (
          <button type="button" style={btn} onClick={() => setAdding(true)}>+ 관리자 추가</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ fontSize: 15 }}>새 관리자</b>
            <input aria-label="이름" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="이름" style={input} />
            <input aria-label="아이디" value={add.username} autoCapitalize="none" onChange={(e) => setAdd({ ...add, username: e.target.value })} placeholder="아이디 (영문·숫자 3자 이상)" style={input} />
            <input aria-label="비밀번호" type="password" autoComplete="new-password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} placeholder="비밀번호 (8자 이상)" style={input} />
            <input aria-label="휴대폰 번호" inputMode="tel" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} placeholder="휴대폰 번호 (비밀번호 찾기용)" style={input} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={busy} style={btn} onClick={() => run(() => createAdminUser(add), () => { setAdd({ name: "", username: "", password: "", phone: "" }); setAdding(false); })}>계정 만들기</button>
              <button type="button" disabled={busy} style={ghost} onClick={() => setAdding(false)}>닫기</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
