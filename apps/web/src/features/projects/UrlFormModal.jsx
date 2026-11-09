import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { isHttpUrl } from '../../lib/url.js';
import { useAddUrl, useUpdateUrl } from './hooks.js';

export function UrlFormModal({ projectId, urlRecord, onClose, onSaved }) {
  const isEdit = Boolean(urlRecord);
  const [values, setValues] = useState({ url: urlRecord?.url ?? '', label: urlRecord?.label ?? '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const add = useAddUrl(projectId);
  const update = useUpdateUrl(projectId);
  const pending = add.isPending || update.isPending;

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    const next = {};
    const url = values.url.trim();
    if (!url) next.url = 'URL is required';
    else if (!isHttpUrl(url)) next.url = 'Enter a valid http(s) URL, e.g. https://example.com';
    if (values.label.trim().length > 100) next.label = 'Label must be 100 characters or fewer';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = { url, label: values.label.trim() || null };
    try {
      const saved = isEdit
        ? await update.mutateAsync({ id: urlRecord.id, ...payload })
        : await add.mutateAsync(payload);
      onSaved(saved);
    } catch (err) {
      const { _: general, ...fieldErrors } = err.fields ?? {};
      setErrors(fieldErrors);
      if (general || Object.keys(fieldErrors).length === 0) setFormError(general ?? err.message);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit URL' : 'Add application URL'} onClose={pending ? () => {} : onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <TextField label="URL" value={values.url} onChange={set('url')} error={errors.url} placeholder="https://example.com" />
        <TextField label="Label (optional)" value={values.label} onChange={set('label')} error={errors.label} placeholder="e.g. Staging" />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" loading={pending}>{isEdit ? 'Save changes' : 'Add URL'}</Button>
        </div>
      </form>
    </Modal>
  );
}
