import React from 'react';
import type { Span } from '../bokaTypes';
import RegisterChip from './RegisterChip';

export default function RightDrawer(props: {
  open: boolean;
  onClose: () => void;
  contentFilterEnabled: boolean;
  span: Span | null;
  onSetActiveVariant: (variantIndex: number) => void;
}) {
  const { open, onClose, span, contentFilterEnabled, onSetActiveVariant } = props;
  if (!open) return null;

  const items =
    span?.variants
      .map((v, idx) => ({ v, idx }))
      .filter(({ v }) => (contentFilterEnabled ? v.register !== 'vulgar' : true)) ?? [];

  return (
    <div className="drawer">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="drawer-title">VARIANTS</div>
        <button onClick={onClose}>CLOSE</button>
      </div>

      {!span ? (
        <div className="mono muted">Select a span.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <div className="mono">
            <div className="muted" style={{ fontSize: 12 }}>
              SPAN
            </div>
            <div>{span.sourceText}</div>
          </div>

          <div className="mono muted" style={{ fontSize: 12 }}>
            {contentFilterEnabled ? 'Filtered.' : 'Full spectrum.'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
            {items.map(({ v, idx }) => {
              const active = idx === span.activeVariantIndex;
              return (
                <button
                  key={v.id}
                  className={active ? 'nav-item active' : 'nav-item'}
                  onClick={() => onSetActiveVariant(idx)}
                  type="button"
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <RegisterChip register={v.register} />
                    <span className="muted" style={{ fontSize: 12 }}>
                      {v.note ?? ''}
                    </span>
                  </div>
                  <div style={{ textAlign: 'left' }}>{v.text}</div>
                </button>
              );
            })}
            {items.length === 0 ? <div className="mono muted">No visible variants.</div> : null}
          </div>
        </div>
      )}
    </div>
  );
}
