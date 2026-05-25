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
  const metricSummary = objects?.metrics_summary ?? [];
  const rows = [
    [copy.objectLabels.assets, counts.assets ?? objects?.assets?.length ?? 0],
    [
      copy.objectLabels.customers,
      counts.customers ?? objects?.customers?.length ?? 0,
    ],
    [
      copy.objectLabels.signals,
      counts.signals ?? objects?.signals?.length ?? 0,
    ],
    [
      copy.objectLabels.metrics,
      counts.metrics ?? objects?.metrics?.length ?? 0,
    ],
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
      {metricSummary.length ? (
        <dl className="startup-memory-list startup-metric-summary">
          {metricSummary.slice(0, 4).map((metric) => (
            <div key={metric.metric_key}>
              <dt>{metric.metric_key}</dt>
              <dd>{metricValueLabel(metric)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function metricValueLabel(metric: {
  change?: number | null;
  latest_value?: number | null;
  unit?: string;
}) {
  const latest =
    metric.latest_value === null || metric.latest_value === undefined
      ? "-"
      : formatMetricNumber(metric.latest_value);
  const unit = metric.unit ? ` ${metric.unit}` : "";
  if (metric.change === null || metric.change === undefined)
    return `${latest}${unit}`;
  const change =
    metric.change > 0
      ? `+${formatMetricNumber(metric.change)}`
      : formatMetricNumber(metric.change);
  return `${latest}${unit} (${change})`;
}

function formatMetricNumber(value: number) {
  if (!Number.isFinite(value)) return "-";
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
