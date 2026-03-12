"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useLiveEvents } from "@/hooks/useLiveEvents";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useLiveEvents();
  return <AppShell>{children}</AppShell>;
}
