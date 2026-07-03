import { useEffect, useState } from "react";
import { Sidebar, MobileNav } from "@/components";
import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "./ErrorLayout";
import { useExpandedLayout } from "@/contexts";

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

export const DashboardLayout = () => {
  const { isExpanded } = useExpandedLayout();
  const isMobile = useIsMobile();

  return (
    <ErrorBoundary
      fallbackRender={() => {
        return <ErrorLayout />;
      }}
      resetKeys={["dashboard-error"]}
      onReset={() => {
        console.log("Reset");
      }}
    >
      <div className="relative flex h-screen w-screen overflow-hidden bg-background">
        {/* Draggable region — hide on mobile */}
        {!isMobile && (
          <div
            className="absolute left-0 right-0 top-0 z-50 h-10 select-none"
            data-tauri-drag-region={true}
          />
        )}

        {/* Sidebar — hidden on mobile */}
        {!isExpanded && !isMobile && <Sidebar />}

        {/* Main Content */}
        <main
          className={`flex flex-1 flex-col overflow-hidden ${
            isMobile ? "px-2 pb-16" : isExpanded ? "px-4" : "px-8"
          }`}
        >
          <Outlet />
        </main>

        {/* Bottom navigation on mobile */}
        {isMobile && <MobileNav />}
      </div>
    </ErrorBoundary>
  );
};
