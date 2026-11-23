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
import ImageToTestCasesPage from "../features/tools/ImageToTestCasesPage.jsx";
import PrdToTestCasesPage from "../features/tools/PrdToTestCasesPage.jsx";
import { BUG_REPORT_PATH, HAR_READER_PATH, IMAGE_TOOL_PATH, PRD_TOOL_PATH } from "../features/tools/paths.js";
import BugReportPage from "../features/bug-report/BugReportPage.jsx";
import HarReaderPage from "../features/har/HarReaderPage.jsx";
import BugReportDetailPage from "../features/bug-report/BugReportDetailPage.jsx";
import HarFilePage from "../features/har/HarFilePage.jsx";
import DocumentsTab from "../features/documents/DocumentsTab.jsx";
import { AuthGate } from "../features/auth/AuthGate.jsx";
import UsersPage from "../features/auth/UsersPage.jsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route
        element={
          <AuthGate>
            <AppLayout />
          </AuthGate>
        }
      >
        <Route path="/users" element={<UsersPage />} />
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectWorkspace />}>
          <Route index element={<OverviewTab />} />
          <Route path="urls" element={<UrlsTab />} />
          <Route path="evidence" element={<EvidenceTab />} />
          <Route path="documents" element={<DocumentsTab />} />
          <Route path="test-cases" element={<TestCasesTab />} />
        </Route>
        <Route path={IMAGE_TOOL_PATH} element={<ImageToTestCasesPage />} />
        <Route path={PRD_TOOL_PATH} element={<PrdToTestCasesPage />} />
        <Route path={BUG_REPORT_PATH} element={<BugReportPage />} />
        <Route path={`${BUG_REPORT_PATH}/:reportId`} element={<BugReportDetailPage />} />
        <Route path={HAR_READER_PATH} element={<HarReaderPage />} />
        <Route path={`${HAR_READER_PATH}/:harId`} element={<HarFilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
