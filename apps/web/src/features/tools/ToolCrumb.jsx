import { Link } from "react-router-dom";
import { projectHref } from "./paths.js";

// "PNCC / Tools / Bug report": shows which project a tool is working in.
export function ToolCrumb({ project, tool }) {
  return (
    <p className="mb-2 text-sm text-slate-500">
      <Link to={projectHref(project.id)} className="font-medium text-indigo-600 hover:underline">
        {project.name}
      </Link>{" "}
      / Tools / {tool}
    </p>
  );
}
