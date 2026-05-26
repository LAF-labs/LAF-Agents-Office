import type {
  StartupOfficeApproval,
  StartupOfficeReceipt,
} from "../../api/startupOffice";
import { ComplianceDisclosure } from "./ComplianceDisclosure";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";

interface ReceiptsTimelinePanelProps {
  copy: StartupOfficeAppCopy;
  nextApproval?: StartupOfficeApproval | null;
  receipts: StartupOfficeReceipt[];
}

export function ReceiptsTimelinePanel({
  copy,
  nextApproval,
  receipts,
}: ReceiptsTimelinePanelProps) {
  return (
    <section className="skills-panel startup-office-receipts">
      <div className="skills-section-head">
        <h3>{copy.receiptsTitle}</h3>
        <p>{copy.receiptsDescription}</p>
      </div>
      <ul className="startup-receipt-list">
        {receipts.length
          ? receipts.map((receipt) => (
              <StartupOfficeReceiptItem key={receipt.id} receipt={receipt} />
            ))
          : copy.defaultReceipts.map((receipt) => (
              <li key={receipt}>
                <strong>{receipt}</strong>
                <span>{copy.noRecentReceipts}</span>
              </li>
            ))}
      </ul>
      <div className="startup-next-action">
        <strong>{copy.nextActionTitle}</strong>
        <span>{nextApproval?.title || copy.nextActionDescription}</span>
      </div>
      <ComplianceDisclosure copy={copy} />
    </section>
  );
}

function StartupOfficeReceiptItem({
  receipt,
}: {
  receipt: StartupOfficeReceipt;
}) {
  return (
    <li>
      <strong>{receipt.event_type}</strong>
      <span>{receipt.summary}</span>
    </li>
  );
}
