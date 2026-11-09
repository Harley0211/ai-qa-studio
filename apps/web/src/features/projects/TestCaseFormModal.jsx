import { useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import { useCreateTestCase, useUpdateTestCase } from "./test-cases.hooks.js";

export function TestCaseFormModal({ projectId, testCase, onClose, onSaved }) {
  const isEdit = Boolean(testCase);

  const [values, setValues] = useState({
    title: testCase?.title ?? "",
    description: testCase?.description ?? "",
    precondition: testCase?.precondition ?? "",
    steps: testCase?.steps ? testCase.steps.replace(/^\d+\.\s/gm, "") : "",
    data: testCase?.data ?? "",
    expectedResult: testCase?.expectedResult ?? "",
  });

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const create = useCreateTestCase(projectId);
  const update = useUpdateTestCase(projectId);
  const pending = create.isPending || update.isPending;

  const set = (field) => (e) =>
    setValues((current) => ({
      ...current,
      [field]: e.target.value,
    }));

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const next = {};

    if (!values.title.trim()) {
      next.title = "Title is required";
    }

    if (!values.steps.trim()) {
      next.steps = "At least one test step is required";
    }

    if (!values.expectedResult.trim()) {
      next.expectedResult = "Expected result is required";
    }

    setErrors(next);

    if (Object.keys(next).length > 0) return;

    const payload = {
      title: values.title.trim(),
      description: values.description.trim() || null,
      precondition: values.precondition.trim() || null,
      steps: values.steps
        .split("\n")
        .map((step) => step.trim())
        .filter(Boolean),
      data: values.data.trim() || null,
      expectedResult: values.expectedResult.trim(),
    };

    try {
      const saved = isEdit
        ? await update.mutateAsync({
            id: testCase.id,
            ...payload,
          })
        : await create.mutateAsync(payload);

      onSaved(saved);
    } catch (err) {
      const { _: general, ...fieldErrors } = err.fields ?? {};
      setErrors(fieldErrors);

      if (general || Object.keys(fieldErrors).length === 0) {
        setFormError(general ?? err.message);
      }
    }
  }

  return (
    <Modal
      title={isEdit ? "Edit test case" : "Create test case"}
      onClose={pending ? () => {} : onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {formError}
          </p>
        )}

        <TextField
          label="Test case title"
          value={values.title}
          onChange={set("title")}
          error={errors.title}
          placeholder="e.g. Verify successful login"
        />

        <TextField
          label="Description"
          value={values.description}
          onChange={set("description")}
          error={errors.description}
          placeholder="Describe what this test validates"
        />

        <TextField
          label="Precondition"
          value={values.precondition}
          onChange={set("precondition")}
          error={errors.precondition}
          placeholder="e.g. User has an existing account"
        />

        <TextField
          label="Test steps"
          multiline
          value={values.steps}
          onChange={set("steps")}
          error={errors.steps}
          hint="Enter one test step per line."
          placeholder={"Open login page\nEnter credentials\nClick Login"}
        />

        <TextField
          label="Test data"
          value={values.data}
          onChange={set("data")}
          error={errors.data}
          placeholder="Enter test data"
        />

        <TextField
          label="Expected result"
          value={values.expectedResult}
          onChange={set("expectedResult")}
          error={errors.expectedResult}
          placeholder="Describe the expected outcome"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" loading={pending}>
            {isEdit ? "Save changes" : "Create test case"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
