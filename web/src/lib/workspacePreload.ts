export function loadArtifactsApp() {
  return import("../components/apps/ArtifactsApp").then((module) => ({
    default: module.ArtifactsApp,
  }));
}

export function loadReceiptsApp() {
  return import("../components/apps/ReceiptsApp").then((module) => ({
    default: module.ReceiptsApp,
  }));
}

export function loadRequestsApp() {
  return import("../components/apps/RequestsApp").then((module) => ({
    default: module.RequestsApp,
  }));
}

export function loadHomeApp() {
  return import("../components/apps/HomeApp").then((module) => ({
    default: module.HomeApp,
  }));
}

export function loadSettingsApp() {
  return import("../components/apps/SettingsApp").then((module) => ({
    default: module.SettingsApp,
  }));
}

export function loadSkillsApp() {
  return import("../components/apps/SkillsApp").then((module) => ({
    default: module.SkillsApp,
  }));
}

export function loadTasksApp() {
  return import("../components/apps/TasksApp").then((module) => ({
    default: module.TasksApp,
  }));
}

export function loadThreadsApp() {
  return import("../components/apps/ThreadsApp").then((module) => ({
    default: module.ThreadsApp,
  }));
}

export function loadCitedAnswer() {
  return import("../components/wiki/CitedAnswer");
}

export function loadNotebook() {
  return import("../components/notebook/Notebook");
}

export function loadReviewQueueKanban() {
  return import("../components/review/ReviewQueueKanban");
}

export function loadWiki() {
  return import("../components/wiki/Wiki");
}

export function preloadWorkspaceSurface(surface: string | null | undefined) {
  switch (surface) {
    case "activity":
      void loadArtifactsApp();
      break;
    case "home":
      void loadHomeApp();
      break;
    case "notebooks":
      void loadNotebook();
      break;
    case "receipts":
      void loadReceiptsApp();
      break;
    case "requests":
      void loadRequestsApp();
      break;
    case "reviews":
      void loadReviewQueueKanban();
      break;
    case "settings":
      void loadSettingsApp();
      break;
    case "skills":
      void loadSkillsApp();
      break;
    case "tasks":
      void loadTasksApp();
      break;
    case "threads":
      void loadThreadsApp();
      break;
    case "wiki":
    case "wiki-lookup":
      void loadWiki();
      void loadCitedAnswer();
      break;
  }
}
