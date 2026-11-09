import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { isHttpUrl } from '../../lib/url.js';
import { useCreateProject, useUpdateProject } from './hooks.js';

// Used for both creating (project === undefined) and editing a project.
export function ProjectFormModal({ project, onClose, onSaved }) {
  const isEdit = Boolean(project);
  const [values, setValues] = useState({
    name: project?.name ?? '',
    description: project?.description ?? '',
    url: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const create = useCreateProject();
  const update = useUpdateProject();
  const pending = create.isPending || update.isPending;

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  function validate() {
    const next = {};
    const name = values.name.trim();
    if (!name) next.name = 'Name is required';
    else if (name.length > 120) next.name = 'Name must be 120 characters or fewer';
    if (values.description.trim().length > 2000) next.description = 'Description must be 2000 characters or fewer';
    if (!isEdit && values.url.trim() && !isHttpUrl(values.url.trim())) {
      next.url = 'Enter a valid http(s) URL, e.g. https://example.com';
    }
    return next;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = { name: values.name.trim(), description: values.description.trim() || null };
    try {
      let saved;
      if (isEdit) {
        saved = await update.mutateAsync({ id: project.id, ...payload });
      } else {
        if (values.url.trim()) payload.url = values.url.trim();
        saved = await create.mutateAsync(payload);
      }
      onSaved(saved);
    } catch (err) {
      const { _: general, ...fieldErrors } = err.fields ?? {};
      setErrors(fieldErrors);
      if (general || Object.keys(fieldErrors).length === 0) setFormError(general ?? err.message);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit project' : 'New project'} onClose={pending ? () => {} : onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <TextField label="Project name" value={values.name} onChange={set('name')} error={errors.name} maxLength={200} />
        <TextField label="Description" multiline value={values.description} onChange={set('description')} error={errors.description} />
        {!isEdit && (
          <TextField
            label="Application URL (optional)"
            value={values.url}
            onChange={set('url')}
            error={errors.url}
            placeholder="https://example.com"
            hint="You can add more URLs later from the project workspace."
          />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" loading={pending}>{isEdit ? 'Save changes' : 'Create project'}</Button>
        </div>
      </form>
    </Modal>
  );
}
