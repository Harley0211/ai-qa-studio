import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout.jsx";
import OverviewTab from "../features/projects/OverviewTab.jsx";
import ProjectsPage from "../features/projects/ProjectsPage.jsx";
import ProjectScope from "../features/projects/ProjectScope.jsx";
import ProjectWorkspace from "../features/projects/ProjectWorkspace.jsx";
import UrlsTab from "../features/projects/UrlsTab.jsx";
import NotFoundPage from "./NotFoundPage.jsx";
import EvidenceTab from "../features/evidence/EvidenceTab.jsx";
import TestCasesTab from "../features/projects/TestCasesTab.jsx";
import ImageToTestCasesPage from "../features/tools/ImageToTestCasesPage.jsx";
import PrdToTestCasesPage from "../features/tools/PrdToTestCasesPage.jsx";
import { PROJECTS_PATH, TOOL_ROUTES } from "../features/tools/paths.js";
import BugReportPage from "../features/bug-report/BugReportPage.jsx";
import BugReportDetailPage from "../features/bug-report/BugReportDetailPage.jsx";
import HarReaderPage from "../features/har/HarReaderPage.jsx";
import HarFilePage from "../features/har/HarFilePage.jsx";
import DocumentsTab from "../features/documents/DocumentsTab.jsx";
import { AuthGate } from "../features/auth/AuthGate.jsx";
import UsersPage from "../features/auth/UsersPage.jsx";
import UserAccessPage from "../features/auth/UserAccessPage.jsx";
import AcceptInvitePage from "../features/auth/AcceptInvitePage.jsx";
import EmailsPage from "../features/emails/EmailsPage.jsx";

export function AppRoutes() {
  return (
    <Routes>
      {/* From an invitation email: works without signing in. */}
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route
        element={
          <AuthGate>
            <AppLayout />
          </AuthGate>
        }
      >
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:userId" element={<UserAccessPage />} />
        <Route path="/emails" element={<EmailsPage />} />
        <Route path="/" element={<Navigate to={PROJECTS_PATH} replace />} />
        {/* Choose a project: the start page after signing in. */}
        <Route path={PROJECTS_PATH} element={<ProjectsPage />} />
        {/* Everything inside one project, including all tools. */}
        <Route path={`${PROJECTS_PATH}/:projectId`} element={<ProjectScope />}>
          <Route element={<ProjectWorkspace />}>
            <Route index element={<OverviewTab />} />
            <Route path="urls" element={<UrlsTab />} />
            <Route path="evidence" element={<EvidenceTab />} />
            <Route path="documents" element={<DocumentsTab />} />
            <Route path="test-cases" element={<TestCasesTab />} />
          </Route>
          <Route path={TOOL_ROUTES.image} element={<ImageToTestCasesPage />} />
          <Route path={TOOL_ROUTES.prd} element={<PrdToTestCasesPage />} />
          <Route path={TOOL_ROUTES.bugReport} element={<BugReportPage />} />
          <Route path={`${TOOL_ROUTES.bugReport}/:reportId`} element={<BugReportDetailPage />} />
          <Route path={TOOL_ROUTES.harReader} element={<HarReaderPage />} />
          <Route path={`${TOOL_ROUTES.harReader}/:harId`} element={<HarFilePage />} />
        </Route>
        {/* Old tool links (before tools moved into projects). */}
        <Route path="/tools/*" element={<Navigate to={PROJECTS_PATH} replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
