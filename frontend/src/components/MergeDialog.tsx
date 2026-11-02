import { useEffect, useMemo, useRef, useState } from 'react';
import { PREDEFINED_FIELDS, type Contact, type PredefinedField } from '../lib/api';
import { useApi } from '../lib/context';
import { errorText } from '../lib/messages';
import { FIELD_LABEL } from '../lib/contactForm';
import { contactName } from '../pages/ContactPage';
import { Alert } from './Alert';

interface Props {
  wid: string;
  contacts: Contact[];
  onClose: () => void;
  onMerged: (survivorName: string) => void;
}

function closeDialog(d: HTMLDialogElement | null) {
  if (d && typeof d.close === 'function') d.close();
  else d?.removeAttribute('open');
}

/** The value the API keeps by default: the Survivor's, or the first non-empty one in list order. */
function defaultSource(f: PredefinedField, survivor: Contact, contacts: Contact[]): string | undefined {
  if (survivor[f]) return survivor.id;
  return contacts.find((c) => c[f])?.id;
}

export function MergeDialog({ wid, contacts, onClose, onMerged }: Props) {
  const api = useApi();
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(contacts.slice(0, 10).map((c) => c.id)));
  const [survivorId, setSurvivorId] = useState(contacts[0].id);
  const [fieldChoice, setFieldChoice] = useState<Partial<Record<PredefinedField, string>>>({});
  const [attrChoice, setAttrChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
  }, []);

  const chosen = contacts.filter((c) => selected.has(c.id));
  const survivor = chosen.find((c) => c.id === survivorId) ?? chosen[0];

  const differing = useMemo(
    () => PREDEFINED_FIELDS.filter((f) => new Set(chosen.map((c) => c[f] ?? '')).size > 1),
    [chosen],
  );
  const conflictingAttrs = useMemo(() => {
    const values = new Map<string, Map<string, string>>();
    chosen.forEach((c) =>
      c.attributes.forEach((a) => {
        const k = a.key.toLowerCase();
        if (!values.has(k)) values.set(k, new Map());
        values.get(k)!.set(c.id, a.value);
      }),
    );
    return [...values.entries()].filter(([, m]) => new Set(m.values()).size > 1);
  }, [chosen]);

  function toggle(id: string) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setError(null);
    if (chosen.length < 2 || chosen.length > 10) return setError('Izberite od 2 do 10 kontaktov.');
    if (!survivor) return;
    const fieldSources: Partial<Record<PredefinedField, string>> = {};
    // Send exactly what the dialog shows for every differing value.
    differing.forEach((f) => {
      const explicit = fieldChoice[f];
      const id = explicit && selected.has(explicit) ? explicit : defaultSource(f, survivor, chosen);
      if (id) fieldSources[f] = id;
    });
    const attributeSources: Record<string, string> = {};
    conflictingAttrs.forEach(([k, m]) => {
      const explicit = attrChoice[k];
      const id = explicit && m.has(explicit) ? explicit : m.has(survivor.id) ? survivor.id : [...m.keys()][0];
      attributeSources[k] = id;
    });
    setBusy(true);
    try {
      await api.merge(wid, {
        survivorId: survivor.id,
        contacts: chosen.map((c) => ({ id: c.id, version: c.version })),
        fieldSources,
        attributeSources,
      });
      closeDialog(ref.current);
      onMerged(contactName(survivor));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} aria-labelledby="merge-title" onClose={onClose}>
      <h2 id="merge-title">Združi kontakte</h2>
      {error && <Alert>{error}</Alert>}
      <fieldset>
        <legend>Kontakti za združitev</legend>
        {contacts.map((c) => (
          <div key={c.id}>
            <input id={`m-sel-${c.id}`} type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />{' '}
            <label htmlFor={`m-sel-${c.id}`}>Združi {contactName(c)}</label>
          </div>
        ))}
      </fieldset>
      <fieldset>
        <legend>Ohranjeni kontakt</legend>
        {chosen.map((c) => (
          <div key={c.id}>
            <input id={`m-surv-${c.id}`} type="radio" name="survivor" checked={survivor?.id === c.id} onChange={() => setSurvivorId(c.id)} />{' '}
            <label htmlFor={`m-surv-${c.id}`}>
              Ohrani {contactName(c)}
              {c.email ? ` (${c.email})` : ''}
            </label>
          </div>
        ))}
      </fieldset>
      {survivor &&
        differing.map((f) => {
          const current = fieldChoice[f] ?? defaultSource(f, survivor, chosen);
          return (
            <fieldset key={f}>
              <legend>{FIELD_LABEL[f]}</legend>
              {chosen.map((c) => (
                <div key={c.id}>
                  <input
                    id={`m-${f}-${c.id}`}
                    type="radio"
                    name={`field-${f}`}
                    checked={current === c.id}
                    onChange={() => setFieldChoice((old) => ({ ...old, [f]: c.id }))}
                  />{' '}
                  <label htmlFor={`m-${f}-${c.id}`}>
                    {FIELD_LABEL[f]}: {c[f] ?? '(prazno)'}
                  </label>
                </div>
              ))}
            </fieldset>
          );
        })}
      {survivor &&
        conflictingAttrs.map(([k, m]) => {
          const current = attrChoice[k] ?? (m.has(survivor.id) ? survivor.id : [...m.keys()][0]);
          return (
            <fieldset key={k}>
              <legend>Atribut {k}</legend>
              {[...m.entries()].map(([id, value]) => (
                <div key={id}>
                  <input id={`m-a-${k}-${id}`} type="radio" name={`attr-${k}`} checked={current === id} onChange={() => setAttrChoice((old) => ({ ...old, [k]: id }))} />{' '}
                  <label htmlFor={`m-a-${k}-${id}`}>
                    {k}: {value}
                  </label>
                </div>
              ))}
            </fieldset>
          );
        })}
      <p>Oznake in atributi vseh kontaktov se združijo. Ostali kontakti postanejo izbrisani in kažejo na ohranjenega.</p>
      <div className="actions">
        <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
          Potrdi združitev
        </button>
        <button
          type="button"
          onClick={() => {
            closeDialog(ref.current);
            onClose();
          }}
        >
          Prekliči
        </button>
      </div>
    </dialog>
  );
}
