import { useId, type InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  multiline?: boolean;
}

/** A labelled input whose error is shown next to it and announced to screen readers. */
export function FormField({ label, error, multiline, id, ...rest }: Props) {
  const generated = useId();
  const fieldId = id ?? generated;
  const errorId = `${fieldId}-error`;
  const common = {
    id: fieldId,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
  };
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={fieldId}>{label}</label>
      {multiline ? (
        <textarea
          {...common}
          name={rest.name}
          value={rest.value as string}
          onChange={rest.onChange as unknown as React.ChangeEventHandler<HTMLTextAreaElement>}
          rows={4}
        />
      ) : (
        <input {...common} {...rest} />
      )}
      {error && (
        <span className="error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
