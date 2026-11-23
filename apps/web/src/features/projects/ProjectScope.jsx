import { FolderX } from "lucide-react";
import { Link, Outlet, useParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { PROJECTS_PATH } from "../tools/paths.js";
import { useProject } from "./hooks.js";

// Everything under /projects/:projectId: the project's pages and its tools.
// Pages read the project from useOutletContext() and only ever show its data.
export default function ProjectScope() {
  const { projectId } = useParams();
  const { data: project, isPending, isError, error, refetch } = useProject(projectId);

  if (isPending) return <LoadingState label="Loading project..." />;
  if (isError) {
    return error.status === 404 ? (
      <EmptyState
        icon={FolderX}
        title="Project not found"
        description="It may have been deleted, or the link is incorrect."
        action={
          <Link to={PROJECTS_PATH} className="text-sm font-medium text-indigo-600 hover:underline">
            Choose a project
          </Link>
        }
      />
    ) : (
      <ErrorState error={error} onRetry={() => refetch()} />
    );
  }

  return <Outlet context={{ project }} />;
}
