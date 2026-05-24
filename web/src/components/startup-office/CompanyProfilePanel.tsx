import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { CheckCircle, EditPencil, Xmark } from "iconoir-react";

import type {
  StartupOfficeCompanyProfile,
  StartupOfficeMemoryPage,
} from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";
import {
  type StartupOfficeProfileForm,
  startupOfficeProfileForm,
} from "./startupOfficeViewModel";

interface CompanyProfilePanelProps {
  copy: StartupOfficeAppCopy;
  isOpen: boolean;
  memoryPages?: StartupOfficeMemoryPage[];
  onClose: () => void;
  onEdit: () => void;
  onSave: (profile: StartupOfficeProfileForm) => void;
  profile: StartupOfficeCompanyProfile;
  saving: boolean;
}

export function CompanyProfilePanel({
  copy,
  isOpen,
  memoryPages = [],
  onClose,
  onEdit,
  onSave,
  profile,
  saving,
}: CompanyProfilePanelProps) {
  const [form, setForm] = useState(() =>
    startupOfficeProfileForm(profile, copy),
  );

  useEffect(() => {
    if (!isOpen) return;
    setForm(startupOfficeProfileForm(profile, copy));
  }, [copy, isOpen, profile]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const memoryRows = [
    [copy.profileFields.icp, profile.icp || "-"],
    [copy.profileFields.offer, profile.offer || "-"],
    [copy.profileFields.positioning, profile.positioning || "-"],
    [
      copy.profileFields.priority,
      profile.priority || profile.goals || copy.goalFallback,
    ],
  ];
  const canonicalMemoryRows = memoryPages.length
    ? memoryPages.slice(0, 5).map((page) => [page.title, page.summary || "-"])
    : memoryRows;

  const updateField =
    (field: keyof StartupOfficeProfileForm) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(form);
  };

  return (
    <>
      <section className="skills-panel startup-office-memory">
        <div className="skills-section-head startup-office-section-head">
          <div>
            <h3>{copy.companyMemoryTitle}</h3>
            <p>{copy.companyMemoryDescription}</p>
          </div>
          <button
            type="button"
            className="startup-office-action is-secondary"
            onClick={onEdit}
          >
            <EditPencil aria-hidden={true} height={13} width={13} />
            {copy.editProfile}
          </button>
        </div>
        <dl className="startup-memory-list">
          {canonicalMemoryRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {isOpen ? (
        <div className="startup-office-drawer-backdrop">
          <form
            className="startup-office-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="startup-office-profile-title"
            onSubmit={handleSubmit}
          >
            <div className="startup-office-drawer-header">
              <div>
                <p className="skills-kicker">{copy.companyMemoryTitle}</p>
                <h2 id="startup-office-profile-title">{copy.profileTitle}</h2>
                <p>{copy.profileDescription}</p>
              </div>
              <button
                type="button"
                className="creation-modal-close"
                aria-label={copy.closePanel}
                disabled={saving}
                onClick={onClose}
              >
                <Xmark aria-hidden={true} height={16} width={16} />
              </button>
            </div>
            <div className="startup-profile-form">
              <label>
                <span>{copy.profileFields.name}</span>
                <input value={form.name} onChange={updateField("name")} />
              </label>
              <label>
                <span>{copy.profileFields.stage}</span>
                <input value={form.stage} onChange={updateField("stage")} />
              </label>
              <label className="is-wide">
                <span>{copy.profileFields.priority}</span>
                <textarea
                  value={form.priority}
                  onChange={updateField("priority")}
                  rows={3}
                />
              </label>
              <label className="is-wide">
                <span>{copy.profileFields.icp}</span>
                <textarea
                  value={form.icp}
                  onChange={updateField("icp")}
                  rows={3}
                />
              </label>
              <label className="is-wide">
                <span>{copy.profileFields.offer}</span>
                <textarea
                  value={form.offer}
                  onChange={updateField("offer")}
                  rows={3}
                />
              </label>
              <label className="is-wide">
                <span>{copy.profileFields.positioning}</span>
                <textarea
                  value={form.positioning}
                  onChange={updateField("positioning")}
                  rows={3}
                />
              </label>
            </div>
            <div className="startup-office-drawer-footer">
              <button
                type="button"
                className="startup-office-action is-secondary"
                disabled={saving}
                onClick={onClose}
              >
                <Xmark aria-hidden={true} height={13} width={13} />
                {copy.closePanel}
              </button>
              <button
                type="submit"
                className="startup-office-action"
                disabled={saving}
              >
                <CheckCircle aria-hidden={true} height={13} width={13} />
                {saving ? copy.savingProfile : copy.saveProfile}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
