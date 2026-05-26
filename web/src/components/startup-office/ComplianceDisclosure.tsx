import type { StartupOfficeAppCopy } from "./startupOfficeCopy";

interface ComplianceDisclosureProps {
  copy: StartupOfficeAppCopy;
}

export function ComplianceDisclosure({ copy }: ComplianceDisclosureProps) {
  return (
    <aside className="startup-compliance-disclosure">
      <strong>{copy.complianceDisclosureTitle}</strong>
      <span>{copy.complianceDisclosureBody}</span>
    </aside>
  );
}
