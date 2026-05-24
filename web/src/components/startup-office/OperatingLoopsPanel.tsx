import { Play } from "iconoir-react";

import type { StartupOfficeLoop } from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";
import { labelFromRecord } from "./startupOfficeViewModel";

interface OperatingLoopsPanelProps {
  copy: StartupOfficeAppCopy;
  isRunning: boolean;
  loops: StartupOfficeLoop[];
  onRunLoop: (loop: StartupOfficeLoop) => void;
  runningLoopSlug?: string | null;
}

export function OperatingLoopsPanel({
  copy,
  isRunning,
  loops,
  onRunLoop,
  runningLoopSlug,
}: OperatingLoopsPanelProps) {
  return (
    <section className="skills-panel startup-office-loops">
      <div className="skills-section-head">
        <h3>{copy.loopsTitle}</h3>
        <p>{copy.loopsDescription}</p>
      </div>
      <div className="startup-loop-list">
        {loops.map((loop) => {
          const loopKey = loop.slug || loop.id;
          const isCurrentLoop = isRunning && runningLoopSlug === loopKey;
          return (
            <article className="startup-loop-card" key={loopKey}>
              <div>
                <div className="startup-loop-meta">
                  <span>{loop.department}</span>
                  <span>{labelFromRecord(copy.loopCadence, loop.cadence)}</span>
                </div>
                <strong>{loop.name}</strong>
                <p>{loop.objective}</p>
              </div>
              <div className="startup-loop-controls">
                <span>{labelFromRecord(copy.loopStatus, loop.status)}</span>
                <button
                  type="button"
                  className="startup-office-action"
                  aria-label={`Run ${loop.name} loop`}
                  disabled={isRunning}
                  onClick={() => onRunLoop(loop)}
                >
                  <Play aria-hidden={true} height={13} width={13} />
                  {isCurrentLoop ? copy.runningLoop : copy.runLoop}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
