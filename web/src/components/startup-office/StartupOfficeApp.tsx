import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveStartupOfficeApproval,
  getStartupOfficeGrowthSummary,
  rejectStartupOfficeApproval,
  runStartupOfficeLoop,
  type StartupOfficeApproval,
  type StartupOfficeArtifact,
  type StartupOfficeLoop,
  type StartupOfficeRun,
  updateStartupOfficeCompanyProfile,
} from "../../api/startupOffice";
import { useI18n } from "../../lib/i18n";
import { showNotice } from "../ui/Toast";
import { ApprovalDeskPanel } from "./ApprovalDeskPanel";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { ArtifactViewer } from "./ArtifactViewer";
import { CompanyProfilePanel } from "./CompanyProfilePanel";
import { CompanyPulsePanel } from "./CompanyPulsePanel";
import { OperatingObjectsPanel } from "./OperatingObjectsPanel";
import { OperatingLoopsPanel } from "./OperatingLoopsPanel";
import { ReceiptsTimelinePanel } from "./ReceiptsTimelinePanel";
import { RunDetailDrawer } from "./RunDetailDrawer";
import {
  STARTUP_OFFICE_APP_COPY,
  type StartupOfficeCopyLanguage,
} from "./startupOfficeCopy";
import {
  fallbackStartupOfficeSummary,
  STARTUP_OFFICE_SUMMARY_QUERY_KEY,
  type StartupOfficeProfileForm,
  visibleStartupOfficeLoops,
} from "./startupOfficeViewModel";

export function StartupOfficeApp() {
  const copy = useStartupOfficeCopy();
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<StartupOfficeRun | null>(null);
  const [selectedArtifact, setSelectedArtifact] =
    useState<StartupOfficeArtifact | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const fallbackSummary = useMemo(
    () => fallbackStartupOfficeSummary(copy),
    [copy],
  );

  const summaryQuery = useQuery({
    queryKey: STARTUP_OFFICE_SUMMARY_QUERY_KEY,
    queryFn: getStartupOfficeGrowthSummary,
    refetchInterval: 30_000,
  });
  const summary = summaryQuery.data ?? fallbackSummary;
  const loops = visibleStartupOfficeLoops(summary, copy);
  const firstApproval = summary.pending_approvals[0] ?? null;

  const refreshSummary = () =>
    queryClient.invalidateQueries({
      queryKey: STARTUP_OFFICE_SUMMARY_QUERY_KEY,
    });

  const runLoopMutation = useMutation({
    mutationFn: (loop: StartupOfficeLoop) =>
      runStartupOfficeLoop(loop.slug || loop.id, {
        objective: loop.objective,
      }),
    onSuccess: (result) => {
      showNotice(
        result.error ? copy.actionFailed(result.error) : copy.runQueued,
        result.error ? "error" : "success",
      );
      if (result.run) setSelectedRun(result.run);
      if (result.artifact) setSelectedArtifact(result.artifact);
      void refreshSummary();
    },
    onError: (error: Error) => {
      showNotice(copy.actionFailed(error.message), "error");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (approval: StartupOfficeApproval) =>
      approveStartupOfficeApproval(approval.id, {
        note: "Approved from Startup Office.",
      }),
    onSuccess: () => {
      showNotice(copy.approvalApproved, "success");
      void refreshSummary();
    },
    onError: (error: Error) => {
      showNotice(copy.actionFailed(error.message), "error");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (approval: StartupOfficeApproval) =>
      rejectStartupOfficeApproval(approval.id, {
        reason: "Rejected from Startup Office.",
      }),
    onSuccess: () => {
      showNotice(copy.approvalRejected, "success");
      void refreshSummary();
    },
    onError: (error: Error) => {
      showNotice(copy.actionFailed(error.message), "error");
    },
  });

  const profileMutation = useMutation({
    mutationFn: (profile: StartupOfficeProfileForm) =>
      updateStartupOfficeCompanyProfile(profile),
    onSuccess: () => {
      showNotice(copy.profileSaved, "success");
      setProfileOpen(false);
      void refreshSummary();
    },
    onError: (error: Error) => {
      showNotice(copy.profileSaveFailed(error.message), "error");
    },
  });

  const runningLoopSlug =
    runLoopMutation.variables?.slug || runLoopMutation.variables?.id || null;

  return (
    <section
      className="skills-growth startup-office-app"
      aria-label={copy.aria}
    >
      <div className="startup-office-header">
        <div>
          <p className="skills-kicker">{copy.kicker}</p>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
      </div>

      <div className="startup-office-grid">
        <CompanyPulsePanel
          copy={copy}
          isFallback={!summaryQuery.data || summaryQuery.isError}
          onEditProfile={() => setProfileOpen(true)}
          summary={summary}
        />
        <OperatingLoopsPanel
          copy={copy}
          isRunning={runLoopMutation.isPending}
          loops={loops}
          onRunLoop={(loop) => runLoopMutation.mutate(loop)}
          runningLoopSlug={runningLoopSlug}
        />
        <ApprovalDeskPanel
          approvals={summary.pending_approvals}
          approvingID={approveMutation.variables?.id ?? null}
          copy={copy}
          isBusy={approveMutation.isPending || rejectMutation.isPending}
          onApprove={(approval) => approveMutation.mutate(approval)}
          onReject={(approval) => rejectMutation.mutate(approval)}
          rejectingID={rejectMutation.variables?.id ?? null}
        />
        <CompanyProfilePanel
          copy={copy}
          isOpen={profileOpen}
          memoryPages={summary.memory_pages ?? []}
          onClose={() => setProfileOpen(false)}
          onEdit={() => setProfileOpen(true)}
          onSave={(profile) => profileMutation.mutate(profile)}
          profile={summary.company_profile}
          saving={profileMutation.isPending}
        />
        <OperatingObjectsPanel
          copy={copy}
          objects={summary.operating_objects}
        />
        <ReceiptsTimelinePanel
          copy={copy}
          nextApproval={firstApproval}
          receipts={summary.recent_receipts}
        />
        <ArtifactsPanel
          artifacts={summary.recent_artifacts ?? []}
          copy={copy}
          onInspectArtifact={setSelectedArtifact}
          onInspectRun={setSelectedRun}
          runs={summary.recent_runs}
        />
      </div>

      <RunDetailDrawer
        copy={copy}
        onClose={() => setSelectedRun(null)}
        run={selectedRun}
      />
      <ArtifactViewer
        artifact={selectedArtifact}
        copy={copy}
        onClose={() => setSelectedArtifact(null)}
      />
    </section>
  );
}

function useStartupOfficeCopy() {
  const { language } = useI18n();
  return (
    STARTUP_OFFICE_APP_COPY[language as StartupOfficeCopyLanguage] ??
    STARTUP_OFFICE_APP_COPY.en
  );
}
