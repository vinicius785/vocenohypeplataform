export type TeamMember = { id: string; name: string; photo?: string };

export function loadTeam(): TeamMember[] {
  try {
    const raw = localStorage.getItem("time:membros");
    if (!raw) return [];
    return (JSON.parse(raw) as TeamMember[]).map((m) => ({
      id: m.id,
      name: m.name,
      photo: m.photo,
    }));
  } catch {
    return [];
  }
}
