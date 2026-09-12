"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string) => {
    clearTimeout(timer.current);
    setToast(msg);
    timer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      {toast && (
        <div
          style={{
            position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)",
            background: "#2B2126", color: "#fff", padding: "14px 24px", borderRadius: 999,
            fontSize: 13.5, fontWeight: 600, boxShadow: "0 14px 34px rgba(60,30,45,0.22)", zIndex: 80,
          }}
        >
          {toast}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
