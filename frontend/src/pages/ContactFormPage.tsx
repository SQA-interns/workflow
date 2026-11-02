import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, PREDEFINED_FIELDS, type PossibleDuplicate } from '../lib/api';
import { useApi } from '../lib/context';
import { errorText, fieldErrors } from '../lib/messages';
import { useLoad } from '../lib/useLoad';
import { FIELD_LABEL, emptyForm, formFrom, tagsError, toInput, validate, type FormValues } from '../lib/contactForm';
import { can } from '../lib/roles';
import { FormField } from '../components/FormField';
import { Alert } from '../components/Alert';
import { DuplicateWarning } from '../components/DuplicateWarning';
import { useWorkspace } from './WorkspaceLayout';

export function ContactFormPage() {
  const { cid } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const loaded = useLoad(() => (cid ? api.getContact(workspace.id, cid) : Promise.resolve(null)), [api, workspace.id, cid]);
  const [values, setValues] = useState<FormValues>(emptyForm());
  // The Contact being edited (or just created) and the version the next save is based on.
  const [current, setCurrent] = useState<{ id: string; version: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded.data) return;
    setValues(formFrom(loaded.data));
    setCurrent({ id: loaded.data.id, version: loaded.data.version });
  }, [loaded.data]);

  if (!can(workspace.role, 'EDITOR')) return <Alert>Za urejanje kontaktov nimate pravic.</Alert>;
  if (loaded.error) return <Alert>{errorText(loaded.error)}</Alert>;
  if (loaded.loading || (cid && !current)) return <p role="status">Nalaganje …</p>;

  const setField = (f: string, v: string) => setValues((old) => ({ ...old, fields: { ...old.fields, [f]: v } }));
  const setAttr = (i: number, part: 'key' | 'value', v: string) =>
    setValues((old) => ({ ...old, attributes: old.attributes.map((a, j) => (j === i ? { ...a, [part]: v } : a)) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFailure(null);
    setDuplicates([]);
    const local = validate(values);
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    setBusy(true);
    try {
      const input = toInput(values);
      const saved = current
        ? await api.updateContact(workspace.id, current.id, current.version, input)
        : await api.createContact(workspace.id, input);
      if (saved.possibleDuplicates.length > 0) {
        setCurrent({ id: saved.id, version: saved.version });
        setValues(formFrom(saved));
        setDuplicates(saved.possibleDuplicates);
      } else {
        navigate(`/w/${workspace.id}/kontakti/${saved.id}`);
      }
    } catch (err) {
      const f = fieldErrors(err);
      setErrors(f);
      if (Object.keys(f).length === 0 || (err instanceof ApiError && err.status === 409)) setFailure(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>{current ? 'Uredi kontakt' : 'Nov kontakt'}</h1>
      <DuplicateWarning wid={workspace.id} duplicates={duplicates} />
      {current && duplicates.length > 0 && (
        <p>
          <Link to={`/w/${workspace.id}/kontakti/${current.id}`}>Odpri shranjeni kontakt</Link>
        </p>
      )}
      {failure && <Alert>{failure}</Alert>}
      <form onSubmit={submit} noValidate aria-label="Kontakt">
        <div className="grid2">
          {PREDEFINED_FIELDS.filter((f) => f !== 'note').map((f) => (
            <FormField
              key={f}
              label={FIELD_LABEL[f] + (f === 'country' ? ' (koda, npr. SI)' : '')}
              name={f}
              type={f === 'email' ? 'email' : 'text'}
              value={values.fields[f]}
              error={errors[f]}
              onChange={(e) => setField(f, e.target.value)}
            />
          ))}
        </div>
        <FormField label={FIELD_LABEL.note} name="note" multiline value={values.fields.note} error={errors.note} onChange={(e) => setField('note', e.target.value)} />

        <fieldset>
          <legend>Atributi</legend>
          {errors.attributes && <span className="error">{errors.attributes}</span>}
          {values.attributes.map((a, i) => (
            <div className="toolbar" key={i}>
              <FormField label={`Ključ ${i + 1}`} value={a.key} error={errors[`attributes[${i}].key`]} onChange={(e) => setAttr(i, 'key', e.target.value)} />
              <FormField label={`Vrednost ${i + 1}`} value={a.value} error={errors[`attributes[${i}].value`]} onChange={(e) => setAttr(i, 'value', e.target.value)} />
              <button
                type="button"
                onClick={() => setValues((old) => ({ ...old, attributes: old.attributes.filter((_, j) => j !== i) }))}
              >
                Odstrani atribut {i + 1}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setValues((old) => ({ ...old, attributes: [...old.attributes, { key: '', value: '' }] }))}>
            Dodaj atribut
          </button>
        </fieldset>

        <FormField
          label="Oznake (ločene s presledkom)"
          name="tags"
          value={values.tags}
          error={tagsError(errors)}
          onChange={(e) => setValues((old) => ({ ...old, tags: e.target.value }))}
        />

        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            Shrani
          </button>
          <Link to={current ? `/w/${workspace.id}/kontakti/${current.id}` : `/w/${workspace.id}`}>Prekliči</Link>
        </div>
      </form>
    </section>
  );
}
