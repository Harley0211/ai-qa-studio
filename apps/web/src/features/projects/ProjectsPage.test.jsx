import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, mockApi, project, renderRoute, signedInUser } from '../../test/utils.jsx';

describe('Projects dashboard', () => {
  it('shows a loading state and then the project cards', async () => {
    mockApi({ 'GET /api/projects': { items: [project({ urlCount: 2 })], total: 1 } });
    renderRoute('/projects');

    // The page appears once the sign-in check has finished.
    expect(await screen.findByText('Loading projects…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText('First project')).toBeInTheDocument();
    expect(screen.getAllByText('2 URLs').length).toBeGreaterThan(0);
  });

  it('shows totals, per-project counts and how many testers are assigned', async () => {
    mockApi({
      'GET /api/projects': {
        items: [
          project({ id: 'p1', name: 'Alpha', urlCount: 1, testCaseCount: 11, memberCount: 3, access: 'ADMIN' }),
          project({ id: 'p2', name: 'Beta', urlCount: 0, testCaseCount: 4, memberCount: 0, access: 'ADMIN' }),
        ],
        total: 2,
      },
      'GET /api/users': { items: [], total: 4, projectTotal: 2 },
    });
    renderRoute('/projects');

    const alpha = (await screen.findByRole('heading', { name: 'Alpha' })).closest('li');
    expect(screen.getByText('Test cases').nextElementSibling).toHaveTextContent('15');
    await waitFor(() => expect(screen.getByText('Users', { selector: 'dt' }).nextElementSibling).toHaveTextContent('4'));

    expect(within(alpha).getByText('1 URL')).toBeInTheDocument();
    expect(within(alpha).getByText('11 test cases')).toBeInTheDocument();
    expect(within(alpha).getByText('3 users')).toBeInTheDocument();
    expect(within(alpha).getByRole('link', { name: /Open project/ })).toHaveAttribute('href', '/projects/p1');
    const beta = screen.getByRole('heading', { name: 'Beta' }).closest('li');
    expect(within(beta).getByText('No users')).toBeInTheDocument();
  });

  it('shows an empty state with a call to action when there are no projects', async () => {
    mockApi({ 'GET /api/projects': { items: [], total: 0 } });
    renderRoute('/projects');
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first project/i })).toBeInTheDocument();
  });

  it('shows an error state and recovers when retried', async () => {
    let fail = true;
    mockApi({
      'GET /api/projects': () => (fail ? apiError(500, 'INTERNAL_ERROR', 'Boom') : { items: [project()], total: 1 }),
    });
    renderRoute('/projects');

    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('validates the form client-side and does not call the API for a blank name', async () => {
    const mock = mockApi({ 'GET /api/projects': { items: [], total: 0 } });
    renderRoute('/projects');
    await screen.findByText('No projects yet');

    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(within(dialog).getByText('Name is required')).toBeInTheDocument();
    expect(mock.find('POST', '/api/projects')).toHaveLength(0);
  });

  it('creates a project, shows a success toast and opens the workspace', async () => {
    const created = project({ id: 'new1', name: 'Beta', urls: [], urlCount: 0 });
    const mock = mockApi({
      'GET /api/projects': { items: [], total: 0 },
      'POST /api/projects': () => json201(created),
      'GET /api/projects/new1': created,
    });
    renderRoute('/projects');
    await screen.findByText('No projects yet');

    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    await userEvent.type(within(dialog).getByLabelText('Project name'), '  Beta ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(await screen.findByText('Project created')).toBeInTheDocument();
    expect(mock.find('POST', '/api/projects')[0].body).toEqual({ name: 'Beta', description: null });
    expect(await screen.findByRole('heading', { name: 'Beta' })).toBeInTheDocument(); // workspace header
  });

  it('asks for confirmation before deleting, then removes the project', async () => {
    let items = [project()];
    const mock = mockApi({
      'GET /api/projects': () => ({ items, total: items.length }),
      'DELETE /api/projects/p1': () => { items = []; return new Response(null, { status: 204 }); },
    });
    renderRoute('/projects');

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }));
    expect(mock.find('DELETE', '/api/projects/p1')).toHaveLength(0); // nothing yet

    const dialog = screen.getByRole('dialog', { name: 'Delete project?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    expect(await screen.findByText(/Deleted/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No projects yet')).toBeInTheDocument());
  });

  it('keeps the dialog open and shows the server error when deletion fails', async () => {
    mockApi({
      'GET /api/projects': { items: [project()], total: 1 },
      'DELETE /api/projects/p1': apiError(500, 'INTERNAL_ERROR', 'Could not delete'),
    });
    renderRoute('/projects');

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete project?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not delete');
  });
});

function json201(body) {
  return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

describe('Choosing a project', () => {
  const member = { setupRequired: false, user: signedInUser({ id: 'u2', role: 'MEMBER', name: 'Mia Member' }) };
  const list = { items: [project({ id: 'p1', name: 'PNCC' }), project({ id: 'p2', name: 'Fiber' })], total: 2 };
  const testerList = {
    items: [
      project({ id: 'p1', name: 'PNCC', access: 'ASSIGNED', testCaseCount: 11, urlCount: 1 }),
      { id: 'p2', name: 'Fiber', access: 'NONE' },
    ],
    total: 2,
  };

  it('is the start page: testers open assigned projects and see the others locked', async () => {
    mockApi({ 'GET /api/auth/status': member, 'GET /api/projects': testerList });
    renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByText('You can open the projects an admin has assigned to you.')).toBeInTheDocument();
    const pncc = (await screen.findByRole('heading', { name: 'PNCC' })).closest('li');
    expect(within(pncc).getByText('Assigned')).toBeInTheDocument();
    expect(within(pncc).getByRole('link', { name: /Open project/ })).toHaveAttribute('href', '/projects/p1');

    const fiber = screen.getByRole('heading', { name: 'Fiber' }).closest('li');
    expect(within(fiber).getByText('No access')).toBeInTheDocument();
    expect(within(fiber).getByText('Project details are hidden')).toBeInTheDocument();
    expect(within(fiber).getByText('Not assigned to you. Ask an admin for access.')).toBeInTheDocument();
    expect(within(fiber).queryByRole('link')).not.toBeInTheDocument();

    expect(screen.getByText('Assigned to you').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('No access', { selector: 'dt' }).nextElementSibling).toHaveTextContent('1');

    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit PNCC' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete PNCC' })).not.toBeInTheDocument();
  });

  it('filters a tester\'s projects by access', async () => {
    mockApi({ 'GET /api/auth/status': member, 'GET /api/projects': testerList });
    renderRoute('/projects');
    await screen.findByRole('heading', { name: 'PNCC' });

    await userEvent.click(screen.getByRole('button', { name: 'No access (1)' }));
    expect(screen.queryByRole('heading', { name: 'PNCC' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fiber' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Assigned (1)' }));
    expect(screen.getByRole('heading', { name: 'PNCC' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fiber' })).not.toBeInTheDocument();
  });

  it('tells a tester when a project link is not assigned to them', async () => {
    mockApi({
      'GET /api/auth/status': member,
      'GET /api/projects/p2': apiError(403, 'NO_PROJECT_ACCESS', 'No access'),
    });
    renderRoute('/projects/p2/tools/bug-report');

    expect(await screen.findByText("You don't have access to this project")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your projects' })).toHaveAttribute('href', '/projects');
  });

  it('lets admins choose which testers can open a project', async () => {
    const mock = mockApi({
      'GET /api/projects': { items: [project({ id: 'p1', name: 'PNCC', access: 'ADMIN', memberCount: 1 })], total: 1 },
      'GET /api/users': {
        items: [
          signedInUser(),
          signedInUser({ id: 'u2', name: 'Maria Santos', email: 'maria@example.com', role: 'MEMBER', active: true }),
          signedInUser({ id: 'u3', name: 'Jun Reyes', email: 'jun@example.com', role: 'MEMBER', active: true }),
        ],
        total: 3,
        projectTotal: 1,
      },
      'GET /api/projects/p1/members': { userIds: ['u2'] },
      'PUT /api/projects/p1/members': (call) => ({ userIds: call.body.userIds }),
    });
    renderRoute('/projects');

    await userEvent.click(await screen.findByRole('button', { name: 'Assign users to PNCC' }));
    const dialog = screen.getByRole('dialog', { name: 'Assign users to PNCC' });
    const maria = await within(dialog).findByRole('switch', { name: 'Maria Santos can open PNCC' });
    expect(maria).toHaveAttribute('aria-checked', 'true');
    // Admins aren't listed: they open every project.
    expect(within(dialog).queryByText('Ada Admin')).not.toBeInTheDocument();

    await userEvent.click(maria);
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Jun Reyes can open PNCC' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save access' }));

    expect(await screen.findByText('Saved who can open PNCC.')).toBeInTheDocument();
    expect(mock.find('PUT', '/api/projects/p1/members')[0].body).toEqual({ userIds: ['u3'] });
  });

  it('tells members to ask an admin when there are no projects', async () => {
    mockApi({ 'GET /api/auth/status': member, 'GET /api/projects': { items: [], total: 0 } });
    renderRoute('/projects');

    expect(await screen.findByText('Ask an admin to create a project for your team.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create your first project/i })).not.toBeInTheDocument();
  });

  it('lets admins add, edit and delete projects', async () => {
    mockApi({ 'GET /api/projects': list });
    renderRoute('/projects');

    expect(await screen.findByRole('button', { name: 'New project' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Edit PNCC' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Fiber' })).toBeInTheDocument();
  });
});