import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { Badge, Switch } from '../../components/ui/Switch.jsx';
import { useEmailToast } from '../emails/emailOutcome.js';
import { Avatar } from '../auth/AccountMenu.jsx';
import { useProjectMembers, useSetProjectMembers, useUsers } from '../auth/auth.hooks.js';

// Admin: choose which testers can open one project.
export function AssignUsersModal({ project, onClose }) {
  const users = useUsers();
  const members = useProjectMembers(project.id);
  const save = useSetProjectMembers(project.id);
  const emailToast = useEmailToast();
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (members.data && selected === null) setSelected(new Set(members.data.userIds));
  }, [members.data, selected]);

  const testers = (users.data?.items ?? []).filter((user) => user.role === 'MEMBER');
  const toggle = (id, on) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function handleSave() {
    try {
      const { emails } = await save.mutateAsync([...selected]);
      emailToast(`Saved who can open ${project.name}.`, emails);
      onClose();
    } catch {
      /* Shown below. */
    }
  }

  let body;
  if (users.isPending || members.isPending || selected === null) {
    body = <LoadingState label="Loading users..." />;
  } else if (users.isError || members.isError) {
    body = <ErrorState error={users.error ?? members.error} onRetry={() => { users.refetch(); members.refetch(); }} />;
  } else if (testers.length === 0) {
    body = (
      <p className="text-sm text-slate-600">
        There are no testers yet. Add people on the <Link to="/users" className="font-medium text-indigo-600 hover:underline">Users</Link> page.
      </p>
    );
  } else {
    body = (
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {testers.map((user) => {
          const on = selected.has(user.id);
          return (
            <li key={user.id} className="flex items-center gap-3 px-3 py-2.5">
              <Switch checked={on} onChange={(value) => toggle(user.id, value)} label={`${user.name} can open ${project.name}`} />
              <Avatar name={user.name} muted={!user.active} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{user.name}</span>
                <span className="block truncate text-xs text-slate-500">{user.email}</span>
              </span>
              {!user.active ? <Badge>Disabled</Badge> : on ? <Badge tone="success">Assigned</Badge> : <Badge>No access</Badge>}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Modal title={`Assign users to ${project.name}`} onClose={save.isPending ? () => {} : onClose}>
      <p className="mb-3 text-sm text-slate-500">
        Testers switched on can open this project and its tools. Admins open every project.
      </p>
      {body}
      {save.error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{save.error.message}</p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button onClick={handleSave} loading={save.isPending} disabled={selected === null || testers.length === 0}>
          Save access
        </Button>
      </div>
    </Modal>
  );
}
