import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout.jsx";
import ComingSoonTab from "../features/projects/ComingSoonTab.jsx";
import OverviewTab from "../features/projects/OverviewTab.jsx";
import ProjectsPage from "../features/projects/ProjectsPage.jsx";
import ProjectWorkspace from "../features/projects/ProjectWorkspace.jsx";
import UrlsTab from "../features/projects/UrlsTab.jsx";
import NotFoundPage from "./NotFoundPage.jsx";
import EvidenceTab from "../features/evidence/EvidenceTab.jsx";
import TestCasesTab from "../features/projects/TestCasesTab.jsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectWorkspace />}>
          <Route index element={<OverviewTab />} />
          <Route path="urls" element={<UrlsTab />} />
          <Route path="evidence" element={<EvidenceTab />} />{" "}
          <Route path="test-cases" element={<TestCasesTab />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
