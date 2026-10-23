import { ToastNotification } from '@carbon/react';
import { dismissToast, useEditor } from '../store/editor';

export function Toasts() {
  const toasts = useEditor(s => s.toasts);
  return (
    <div className="sc-toasts" aria-live="polite">
      {toasts.map(t => (
        <ToastNotification
          key={t.id}
          kind={t.kind}
          title={t.title}
          subtitle={t.subtitle}
          lowContrast
          timeout={0}
          onClose={() => { dismissToast(t.id); return false; }}
        />
      ))}
    </div>
  );
}
