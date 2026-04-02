"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

const PUBLIC_ROUTES = ["/login", "/invite"];

export default function AuthWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed]   = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const isPublic = PUBLIC_ROUTES.includes(pathname);

    if (!token && !isPublic) {
      router.replace("/login");
    } else if (token && pathname === "/login") {
      router.replace("/");
    } else {
      setAuthed(!!token);
      setChecked(true);
    }
  }, [pathname, router]);

  // Don't render anything until we've checked auth
  if (!checked) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Public routes (login page) — no sidebar
  if (PUBLIC_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  // Authenticated routes — show sidebar layout
  return (
    <>
      <Sidebar />
      <div className="ml-56 min-h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </>
  );
}