import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getSkills, invokeSkill, type Skill } from "../../api/client";
import { showNotice } from "../ui/Toast";

export function SkillsApp() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: () => getSkills(),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <div className="app-loading-state">Loading skills...</div>;
  }

  if (error) {
    return <div className="app-empty-state">Could not load skills.</div>;
  }

  const skills = data?.skills ?? [];

  return (
    <>
      <div className="app-section-heading">
        <h3>Skills</h3>
        <p>Reusable local agent capabilities available in this workspace.</p>
      </div>

      {skills.length === 0 ? (
        <div className="app-empty-state">No skills registered yet.</div>
      ) : (
        skills.map((skill) => <SkillCard key={skill.name} skill={skill} />)
      )}
    </>
  );
}

function SkillCard({ skill }: { skill: Skill }) {
  const [invokeState, setInvokeState] = useState<"idle" | "invoking" | "done">(
    "idle",
  );

  const handleInvoke = useCallback(() => {
    if (!skill.name) return;
    setInvokeState("invoking");
    invokeSkill(skill.name, {})
      .then(() => {
        setInvokeState("done");
        setTimeout(() => setInvokeState("idle"), 1500);
      })
      .catch((e: Error) => {
        setInvokeState("idle");
        showNotice(`Invoke failed: ${e.message}`, "error");
      });
  }, [skill.name]);

  const buttonLabel =
    invokeState === "invoking"
      ? "Invoking..."
      : invokeState === "done"
        ? "\u2713 Invoked"
        : "\u26A1 Invoke";

  return (
    <div className="app-card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 16 }}>{"\u26A1"}</span>
        <span className="app-card-title" style={{ marginBottom: 0 }}>
          {skill.name || "Untitled"}
        </span>
      </div>

      {skill.description ? (
        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginBottom: 8,
            lineHeight: 1.45,
          }}
        >
          {skill.description}
        </div>
      ) : null}

      {skill.source ? (
        <div className="app-card-meta" style={{ marginBottom: 8 }}>
          Source: {skill.source}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={invokeState !== "idle"}
          onClick={handleInvoke}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
