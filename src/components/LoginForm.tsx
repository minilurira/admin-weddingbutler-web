"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { requestAdminReset, resetAdminPassword } from "@/lib/adminReset";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // 비밀번호 찾기: off → 아이디 입력(ask) → 인증번호·새 비밀번호(code)
  const [reset, setReset] = useState<"off" | "ask" | "code">("off");
  const [resetCode, setResetCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [notice, setNotice] = useState("");

  async function doLogin() {
    if (!username.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { username, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function doReset() {
    setError("");
    setLoading(true);
    try {
      if (reset === "ask") {
        const r = await requestAdminReset(username);
        if (!r.ok) return setError(r.message);
        setReset("code");
        setNotice("등록된 휴대폰으로 인증번호를 보냈습니다. (번호가 등록돼 있지 않으면 문자가 오지 않아요)");
        return;
      }
      if (newPw !== newPw2) return setError("새 비밀번호가 서로 다릅니다.");
      const r = await resetAdminPassword(username, resetCode, newPw);
      if (!r.ok) return setError(r.message);
      setReset("off");
      setPassword("");
      setResetCode("");
      setNewPw("");
      setNewPw2("");
      setNotice("비밀번호를 바꿨습니다. 새 비밀번호로 로그인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (reset !== "off") void doReset();
    else doLogin();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    if (reset !== "off") { e.preventDefault(); void doReset(); } else doLogin();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: "linear-gradient(160deg, #FDF7FA 0%, #F7E9F0 42%, #EFDCE6 100%)",
        color: "#1E1A1C",
      }}
    >
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 32px" }}>
        <form
          onSubmit={onSubmit}
          style={{ width: "100%", maxWidth: 372, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}
        >
          <Image src="/wb-logo.png" alt="웨딩버틀러" width={64} height={64} style={{ borderRadius: 20, display: "block", marginBottom: 22 }} />
          <h1 style={{ margin: "0 0 8px", fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px" }}>웨딩버틀러 어드민</h1>
          <p style={{ margin: "0 0 34px", fontSize: 14, color: "#8C8188" }}>축의대 대행 예약을 확인하고 확정하세요.</p>

          <label style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, fontWeight: 700, color: "#6E646A", marginBottom: 14 }}>
            아이디
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              onKeyDown={onKeyDown}
              placeholder="아이디"
              style={{ border: 0, background: "#FFFFFF", borderRadius: 14, padding: "15px 16px", fontSize: 14.5, color: "#1E1A1C" }}
            />
          </label>
          {reset === "off" && (
            <label style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, fontWeight: 700, color: "#6E646A" }}>
              비밀번호
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={onKeyDown}
                placeholder="비밀번호를 입력하세요"
                style={{ border: 0, background: "#FFFFFF", borderRadius: 14, padding: "15px 16px", fontSize: 14.5, color: "#1E1A1C" }}
              />
            </label>
          )}
          {reset === "code" && (
            <>
              {[
                { label: "인증번호 (6자리)", v: resetCode, set: setResetCode, ph: "문자로 받은 번호", type: "text" },
                { label: "새 비밀번호 (8자 이상)", v: newPw, set: setNewPw, ph: "새 비밀번호", type: "password" },
                { label: "새 비밀번호 확인", v: newPw2, set: setNewPw2, ph: "한 번 더 입력", type: "password" },
              ].map((f) => (
                <label key={f.label} style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, fontWeight: 700, color: "#6E646A", marginBottom: 14 }}>
                  {f.label}
                  <input type={f.type} inputMode={f.type === "text" ? "numeric" : undefined} autoComplete={f.type === "text" ? "one-time-code" : "new-password"} value={f.v} onChange={(e) => { f.set(e.target.value); setError(""); }} placeholder={f.ph} style={{ border: 0, background: "#FFFFFF", borderRadius: 14, padding: "15px 16px", fontSize: 14.5, color: "#1E1A1C" }} />
                </label>
              ))}
            </>
          )}

          <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 22px" }}>
            {reset === "off" ? <button
              type="button"
              onClick={() => setRemember((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 8, border: 0, background: "transparent", padding: 0, fontSize: 13, color: "#6E646A" }}
            >
              <span
                style={{
                  width: 18, height: 18, borderRadius: 6,
                  border: `1px solid ${remember ? "#B0567E" : "#DDD5D9"}`,
                  background: remember ? "#B0567E" : "#FFFFFF",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 11, fontWeight: 700,
                }}
              >
                {remember ? "✓" : ""}
              </span>
              로그인 상태 유지
            </button> : <span />}
            <button type="button" onClick={() => { setError(""); setNotice(""); setReset(reset === "off" ? "ask" : "off"); }} style={{ border: 0, background: "transparent", padding: 0, fontSize: 13, color: "#B0567E", cursor: "pointer", textDecoration: "underline" }}>
              {reset === "off" ? "비밀번호 찾기" : "로그인으로 돌아가기"}
            </button>
          </div>

          {notice && !error && (
            <div role="status" style={{ width: "100%", marginBottom: 14, padding: "12px 14px", borderRadius: 12, background: "#EEF6F0", color: "#2F6B45", fontSize: 13, fontWeight: 600 }}>
              {notice}
            </div>
          )}

          {error && (
            <div style={{ width: "100%", marginBottom: 14, padding: "12px 14px", borderRadius: 12, background: "#FBEEF2", color: "#A8416C", fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", height: 54, border: 0, borderRadius: 14, background: "#B0567E", color: "#fff", fontSize: 15.5, fontWeight: 700, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "처리 중…" : reset === "ask" ? "인증번호 받기" : reset === "code" ? "비밀번호 변경" : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
