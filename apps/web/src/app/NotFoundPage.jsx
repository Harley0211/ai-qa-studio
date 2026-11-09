import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/States.jsx';

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The page you are looking for does not exist."
      action={<Link to="/projects" className="text-sm font-medium text-indigo-600 hover:underline">Go to projects</Link>}
    />
  );
}
