import { supabase } from "@/integrations/supabase/client";

export type BugReport = {
  id: string;
  reporterId: string | null;
  reporterName: string;
  clientLabel: string | null;
  description: string;
  screenshotPath: string | null;
  pageContext: string | null;
  createdAt: string;
};

function mapRow(row: {
  id: string;
  reporter_id: string | null;
  reporter_name: string;
  client_label: string | null;
  description: string;
  screenshot_path: string | null;
  page_context: string | null;
  created_at: string;
}): BugReport {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    clientLabel: row.client_label,
    description: row.description,
    screenshotPath: row.screenshot_path,
    pageContext: row.page_context,
    createdAt: row.created_at,
  };
}

export async function submitBugReport(input: {
  description: string;
  screenshotFile?: File | null;
  pageContext?: string;
}): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error("Sessão inválida.");

  let screenshotPath: string | null = null;
  if (input.screenshotFile) {
    const ext = input.screenshotFile.name.split(".").pop() ?? "png";
    const path = `${authData.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("bug-reports")
      .upload(path, input.screenshotFile, { contentType: input.screenshotFile.type });
    if (uploadError) throw uploadError;
    screenshotPath = path;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", authData.user.id)
    .maybeSingle();

  const { error } = await supabase.from("bug_reports").insert({
    reporter_id: authData.user.id,
    reporter_name: profile?.full_name || authData.user.email || "",
    description: input.description.trim(),
    screenshot_path: screenshotPath,
    page_context: input.pageContext ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function listBugReports(): Promise<BugReport[]> {
  const { data, error } = await supabase
    .from("bug_reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function deleteBugReport(id: string, screenshotPath: string | null): Promise<void> {
  if (screenshotPath) {
    await supabase.storage.from("bug-reports").remove([screenshotPath]);
  }
  const { error } = await supabase.from("bug_reports").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getBugScreenshotUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("bug-reports").createSignedUrl(path, 60 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
