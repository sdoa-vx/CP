import { supabase } from "../utils/supabase";
import { openPrForProposal } from "./prWorker";
import { logger } from "../utils/logger";

let workerInterval: NodeJS.Timeout | null = null;

export function startPrJobWorker() {
  if (workerInterval) return;

  const isDryRun = process.argv.includes("--dry-run");
  logger.info(`[SDOA PR Worker] Starting loop (Dry Run: ${isDryRun})...`);

  workerInterval = setInterval(async () => {
    if (!supabase) return;

    try {
      // Query one queued job
      const { data: jobs, error } = await supabase
        .from("sdoa_pr_jobs")
        .select("*")
        .eq("status", "queued")
        .limit(1);

      if (error) {
        logger.error(`[SDOA PR Worker] Failed to fetch queued jobs: ${error.message}`);
        return;
      }

      if (!jobs || jobs.length === 0) return;

      const job = jobs[0];
      logger.info(`[SDOA PR Worker] Processing job ${job.id} for canonicalId: ${job.canonical_id}`);

      // Set job status to processing
      await supabase
        .from("sdoa_pr_jobs")
        .update({ status: "processing" })
        .eq("id", job.id);

      const files = job.payload || {};
      const filePaths = Object.keys(files);
      if (filePaths.length === 0) {
        throw new Error("No files in job payload.");
      }

      const filePath = filePaths[0];
      const fileContent = files[filePath];

      const cleanName = job.canonical_id.split(".")[0];
      const mockProposal = {
        id: job.canonical_id,
        type: "module",
        name: cleanName,
        targetRepo: job.repo || process.env.GITHUB_REPO
      };

      let prUrl = "";
      if (isDryRun) {
        logger.info(`[DRY RUN] Would create PR on branch ${job.branch} in ${job.repo}`);
        prUrl = `https://github.com/sdoa-community/library/pull/mock-${Date.now()}`;
      } else {
        const openedPr = await openPrForProposal(mockProposal, filePath, fileContent);
        if (!openedPr) throw new Error("prWorker returned null URL.");
        prUrl = openedPr;
      }

      logger.info(`[SDOA PR Worker] PR submitted: ${prUrl}`);
      await supabase
        .from("sdoa_pr_jobs")
        .update({
          status: "submitted",
          pr_url: prUrl,
          submitted_at: new Date().toISOString()
        })
        .eq("id", job.id);
    } catch (err: any) {
      logger.error(`[SDOA PR Worker] Job execution failed: ${err.message}`);
      if (supabase) {
        await supabase
          .from("sdoa_pr_jobs")
          .update({ status: "error" })
          .eq("id", (global as any).currentJobId || "").catch(() => {});
      }
    }
  }, 5000);
}
