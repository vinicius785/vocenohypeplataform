// Refatorado por completo — a implementação agora vive em ./aeo/. Este
// arquivo fica só como re-export pra não precisar tocar em
// projeto.$id.tsx (que importa `AeoMonitorPanel` por esse caminho).
export { AeoMonitorShell as AeoMonitorPanel } from "./aeo/AeoMonitorShell";
