import type { ReactNode } from "react";
import { PortalRuntimeContext, type PortalRuntime } from "./portal-runtime";

export function PortalRuntimeProvider({
  value,
  children,
}: {
  value: PortalRuntime;
  children: ReactNode;
}) {
  return <PortalRuntimeContext.Provider value={value}>{children}</PortalRuntimeContext.Provider>;
}
