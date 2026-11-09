import { Hourglass } from 'lucide-react';
import { EmptyState } from '../../components/ui/States.jsx';

export default function ComingSoonTab({ title, description }) {
  return <EmptyState icon={Hourglass} title={`${title} — coming in Phase 2`} description={description} />;
}
