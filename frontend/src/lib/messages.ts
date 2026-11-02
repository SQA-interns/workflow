import { ApiError, type FieldError } from './api';

// The API answers in English; the UI is Slovenian only.
const MESSAGES: Record<string, string> = {
  required: 'Polje je obvezno.',
  'must be text': 'Vrednost mora biti besedilo.',
  'must be a valid email': 'Vnesite veljaven e-poštni naslov.',
  'must be an ISO 3166-1 alpha-2 country code': 'Vnesite veljavno dvočrkovno kodo države (npr. SI).',
  'first name, last name or email is required': 'Vnesite vsaj ime, priimek ali e-pošto.',
  'must equal the Workspace name exactly': 'Ime se ne ujema natančno z imenom delovnega prostora.',
  'invalid key': 'Ključ mora se začeti s črko in vsebovati le črke, števke, _, . ali -.',
  'duplicate key': 'Ključ se ponavlja.',
  'reserved key': 'Ključ je enak imenu vnaprej določenega polja.',
  'too many attributes': 'Največ 100 atributov.',
  'invalid tag': 'Oznaka ne sme vsebovati presledkov in je dolga največ 50 znakov.',
  'duplicate tag': 'Oznaka se ponavlja.',
  'too many tags': 'Največ 50 oznak.',
  'outdated version': 'Kontakt je medtem spremenil nekdo drug. Osvežite stran.',
  'already a member or invited': 'Ta oseba je že član ali je že povabljena.',
  'a workspace needs an owner': 'Delovni prostor mora imeti vsaj enega lastnika.',
  'tag name taken': 'Oznaka s tem imenom že obstaja.',
  'contact is not deleted': 'Kontakt ni izbrisan.',
  'contact is deleted': 'Kontakt je izbrisan.',
  'not found': 'Ni najdeno.',
  forbidden: 'Za to dejanje nimate pravic.',
  'too many requests': 'Preveč zahtev. Poskusite znova čez minuto.',
  'request body too large': 'Zahteva je prevelika.',
  'invalid role': 'Neveljavna vloga.',
  'invalid selection': 'Neveljaven izbor kontaktov.',
  'too many contacts': 'Izvoz je omejen na 10.000 kontaktov.',
  'exactly one of contactIds and filter': 'Izberite kontakte ali uporabite filter.',
};

export function slMessage(message: string): string {
  if (MESSAGES[message]) return MESSAGES[message];
  const max = /^at most (\d+) characters$/.exec(message);
  if (max) return `Največ ${max[1]} znakov.`;
  const range = /^between (\d+) and (\d+)/.exec(message);
  if (range) return `Dovoljeno je od ${range[1]} do ${range[2]}.`;
  return 'Neveljavna vrednost.';
}

/** Field errors of a failed call, keyed by field, in Slovenian. */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  e.errors.forEach((err: FieldError) => {
    if (err.field && !out[err.field]) out[err.field] = slMessage(err.message);
  });
  return out;
}

/** One sentence for a failed call, in Slovenian. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return 'Ni najdeno.';
    if (e.status === 403) return MESSAGES.forbidden;
    if (e.status === 429) return MESSAGES['too many requests'];
    const first = e.errors[0];
    if (first) return slMessage(first.message);
    return 'Prišlo je do napake.';
  }
  return 'Povezava s strežnikom ni uspela.';
}
