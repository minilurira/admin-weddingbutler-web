"use client";

import { Suspense, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useIsMobile } from "@/lib/useIsMobile";
import { ToastProvider } from "./ToastContext";

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
      <div style={{ display: "flex", flexDirection: "row", minHeight: "100vh", color: "#1E1A1C", background: "#FFFFFF" }}>
        {navOpen && (
          <Sidebar
            mobile={mobile}
            onNavigate={closeNavOnMobile}
            totalCount={totalCount}
            confirmedCount={confirmedCount}
            monthAmount={monthAmount}
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
