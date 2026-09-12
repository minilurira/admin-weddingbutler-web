"use client";

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
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
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
          <span>이번 달 확정</span>
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
