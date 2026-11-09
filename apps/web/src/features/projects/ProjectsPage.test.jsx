import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, mockApi, project, renderRoute } from '../../test/utils.jsx';

describe('Projects dashboard', () => {
  it('shows a loading state and then the project cards', async () => {
    mockApi({ 'GET /api/projects': { items: [project({ urlCount: 2 })], total: 1 } });
    renderRoute('/projects');

    expect(screen.getByText('Loading projects…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText('First project')).toBeInTheDocument();
    expect(screen.getAllByText('2 URLs').length).toBeGreaterThan(0);
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
