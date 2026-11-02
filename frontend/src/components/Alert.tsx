export function Alert({ children, kind = 'error' }: { children: React.ReactNode; kind?: 'error' | 'info' | 'warning' }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
