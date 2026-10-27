"use client";

import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/dashboard",
    label: "대시보드",
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
        <rect x="2.6" y="2.6" width="6.4" height="6.4" rx="2" fill="currentColor" />
        <rect x="11" y="2.6" width="6.4" height="6.4" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <rect x="2.6" y="11" width="6.4" height="6.4" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <rect x="11" y="11" width="6.4" height="6.4" rx="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/reservations",
    label: "예약 리스트",
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
        <rect x="2.5" y="4" width="15" height="2.4" rx="1.2" fill="currentColor" />
        <rect x="2.5" y="8.8" width="15" height="2.4" rx="1.2" fill="currentColor" />
        <rect x="2.5" y="13.6" width="15" height="2.4" rx="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/invitation-orders",
    label: "청첩장 결제",
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
        <rect x="3.2" y="3" width="13.6" height="14" rx="3" stroke="currentColor" strokeWidth="1.7" />
        <path d="M6.6 8h6.8M6.6 11.4h4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/inquiries",
    label: "문의 목록",
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
        <path d="M3.4 4.6a2 2 0 0 1 2-2h9.2a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H9l-3.6 3v-3h0a2 2 0 0 1-2-2V4.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <rect x="6.4" y="6.4" width="7.2" height="1.7" rx="0.85" fill="currentColor" />
        <rect x="6.4" y="9.6" width="4.6" height="1.7" rx="0.85" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/calendar",
    label: "캘린더",
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
        <rect x="2.6" y="4" width="14.8" height="13.4" rx="3.4" stroke="currentColor" strokeWidth="1.7" />
        <rect x="2.6" y="7.6" width="14.8" height="1.7" fill="currentColor" />
        <rect x="5.6" y="1.9" width="1.8" height="3.6" rx="0.9" fill="currentColor" />
        <rect x="12.6" y="1.9" width="1.8" height="3.6" rx="0.9" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/butlers",
    label: "버틀러 관리",
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
        <circle cx="7.6" cy="6.8" r="3" stroke="currentColor" strokeWidth="1.7" />
        <path d="M2.4 16.4c.4-2.9 2.6-4.6 5.2-4.6s4.8 1.7 5.2 4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="14.2" cy="7.6" r="2.3" fill="currentColor" />
        <path d="M13.6 12.2c2.2.1 3.6 1.5 4 3.9h-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/admins",
    label: "관리자 관리",
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3.8 16.4c.8-3 3.2-4.4 6.2-4.4s5.4 1.4 6.2 4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/finance",
    label: "손익관리",
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
        <rect x="2.6" y="3.4" width="14.8" height="13.2" rx="3.4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M6.6 8.2 10 12.2l3.4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="9.15" y="11" width="1.7" height="3.4" rx="0.85" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/errors",
    label: "오류 기록",
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
        <path d="M10 3.2l7.2 12.6H2.8L10 3.2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M10 8.4v3.4M10 13.9v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Sidebar({
  mobile, onNavigate, totalCount, confirmedCount, monthAmount,
}: {
  mobile: boolean;
  onNavigate: () => void;
  totalCount: number;
  confirmedCount: number;
  monthAmount: string;
}) {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: mobile ? 272 : 268,
        flex: mobile ? "0 0 272px" : "0 0 268px",
        boxSizing: "border-box",
        borderRight: "1px solid var(--wb-line)",
        display: "flex",
        flexDirection: "column",
        padding: "18px 18px 0",
        position: mobile ? "fixed" : "static",
        top: 0, left: 0,
        height: mobile ? "100%" : "auto",
        zIndex: mobile ? 50 : "auto",
        background: "#FFFFFF",
        boxShadow: mobile ? "0 18px 46px rgba(60,30,45,0.22)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 20px" }}>
        <Image src="/wb-logo.png" alt="웨딩버틀러" width={34} height={34} style={{ borderRadius: 11, display: "block" }} />
        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.5px" }}>웨딩버틀러</span>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {navItems.map((item) => {
          // 예약 리스트는 /reservations 에서만 켜고, 하위 화면(미결제 예약)은 따로 켠다
          const unpaidOpen = pathname?.startsWith("/reservations/unpaid") ?? false;
          const active = item.href === "/reservations" ? Boolean(pathname?.startsWith("/reservations")) && !unpaidOpen : pathname?.startsWith(item.href);
          return (
            <Fragment key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              style={{
                display: "flex", alignItems: "center", gap: 12, height: 46, padding: "0 14px",
                borderRadius: 12, fontSize: 14.5, fontWeight: 600, textAlign: "left",
                background: active ? "#F9EFF4" : "transparent",
                color: active ? "#B0567E" : "#6E646A",
              }}
            >
              {item.icon}
              {item.label}
              {item.href === "/reservations" && (
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#B0567E" }}>{totalCount}</span>
              )}
            </Link>
              {item.href === "/reservations" && (
                <Link
                  href="/reservations/unpaid"
                  onClick={onNavigate}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px 0 45px",
                    borderRadius: 12, fontSize: 13.5, fontWeight: 600,
                    background: unpaidOpen ? "#F9EFF4" : "transparent",
                    color: unpaidOpen ? "#B0567E" : "#8C8188",
                  }}
                >
                  미결제 예약
                </Link>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div
        style={{
          marginTop: "auto", borderTop: "1px solid var(--wb-line)", padding: "16px 6px 18px",
          display: "flex", flexDirection: "column", flexWrap: "wrap", gap: "10px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8C8188" }}>
          <span>이번 달 결제 확정</span>
          <span style={{ color: "#B0567E", fontWeight: 700 }}>{confirmedCount}건</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#8C8188" }}>
          <span>확정 금액</span>
          <span style={{ color: "#B0567E", fontWeight: 700 }}>{monthAmount}</span>
        </div>
      </div>
    </aside>
  );
}
