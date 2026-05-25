import type { StartupOfficeNotification } from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";

interface ActivityNotificationsPanelProps {
  copy: StartupOfficeAppCopy;
  notifications?: StartupOfficeNotification[];
}

export function ActivityNotificationsPanel({
  copy,
  notifications = [],
}: ActivityNotificationsPanelProps) {
  const visible = notifications.slice(0, 4);
  return (
    <section className="skills-panel startup-office-activity">
      <div className="skills-section-head">
        <h3>{copy.activityTitle}</h3>
        <p>{copy.activityDescription}</p>
      </div>
      {visible.length ? (
        <dl className="startup-memory-list">
          {visible.map((notification) => (
            <div key={notification.id}>
              <dt>{activityLabel(notification.event_type)}</dt>
              <dd>{notification.status}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>{copy.noActivity}</p>
      )}
    </section>
  );
}

function activityLabel(value: string) {
  return String(value || "startup_office.activity")
    .replace(/^notification\./, "")
    .replace(/[_-]+/g, " ");
}
