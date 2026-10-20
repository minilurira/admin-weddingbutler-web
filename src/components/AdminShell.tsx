"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useIsMobile } from "@/lib/useIsMobile";
import { ToastProvider } from "./ToastContext";
import { getSidebarStats } from "@/lib/statsActions";

export default function AdminShell({
  userName, totalCount, confirmedCount, monthAmount, children,
}: {
  userName: string;
  totalCount: number;
  confirmedCount: number;
  monthAmount: string;
  children: React.ReactNode;
}) {
  const mobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(true);
  const [touched, setTouched] = useState(false);
  const pathname = usePathname();
  const [stats, setStats] = useState({ totalCount, confirmedCount, monthAmount });

  useEffect(() => {
    setStats({ totalCount, confirmedCount, monthAmount });
  }, [totalCount, confirmedCount, monthAmount]);

  // 레이아웃은 화면을 옮겨도 다시 그려지지 않으니 하단 숫자는 이동할 때마다 새로 받는다.
  useEffect(() => {
    let alive = true;
    getSidebarStats().then((s) => alive && setStats(s)).catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  useEffect(() => {
    if (!touched) setNavOpen(!mobile);
  }, [mobile, touched]);

  function toggleNav() {
    setTouched(true);
    setNavOpen((v) => !v);
  }

  function closeNavOnMobile() {
    if (mobile) setNavOpen(false);
  }

  return (
    <ToastProvider>
      <div className={!mobile && !navOpen ? "wb-nav-closed" : undefined} style={{ display: "flex", flexDirection: "row", minHeight: "100vh", color: "#1E1A1C", background: "#FFFFFF" }}>
        {navOpen && (
          <Sidebar
            mobile={mobile}
            onNavigate={closeNavOnMobile}
            totalCount={stats.totalCount}
            confirmedCount={stats.confirmedCount}
            monthAmount={stats.monthAmount}
          />
        )}
        {mobile && navOpen && (
          <div
            onClick={() => setNavOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(40,26,33,0.32)" }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Suspense fallback={null}>
            <Header mobile={mobile} userName={userName} onToggleNav={toggleNav} />
          </Suspense>
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
