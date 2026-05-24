import type { StartupOfficeOperatingObjects } from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";

interface OperatingObjectsPanelProps {
  copy: StartupOfficeAppCopy;
  objects?: StartupOfficeOperatingObjects;
}

export function OperatingObjectsPanel({
  copy,
  objects,
}: OperatingObjectsPanelProps) {
  const counts = objects?.counts ?? {};
  const rows = [
    [copy.objectLabels.assets, counts.assets ?? objects?.assets?.length ?? 0],
    [copy.objectLabels.customers, counts.customers ?? objects?.customers?.length ?? 0],
    [copy.objectLabels.signals, counts.signals ?? objects?.signals?.length ?? 0],
    [copy.objectLabels.metrics, counts.metrics ?? objects?.metrics?.length ?? 0],
  ];
  return (
    <section className="skills-panel startup-office-objects">
      <div className="skills-section-head">
        <h3>{copy.objectsTitle}</h3>
        <p>{copy.objectsDescription}</p>
      </div>
      <dl className="startup-memory-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
