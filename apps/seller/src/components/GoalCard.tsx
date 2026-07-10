import type { ReactNode } from 'react';

interface GoalCardProps {
  variant: 'green' | 'purple';
  icon: ReactNode;
  label: string;
  valueLabel: string;
  metaLabel: string;
  pct: number;
  faltanLabel: string;
  logradoLabel: string;
}

const THEME = {
  green: {
    header: 'var(--aviva-green-700)', iconColor: 'var(--aviva-green-200)', pctColor: 'var(--aviva-green-300)',
    metaColor: '#7fae93', fillBg: '#dbeee4', fillColor: 'var(--aviva-green-500)', faltanColor: '#3f8a63',
    faltanValue: '#1b3a2a', logradoColor: '#d4f3e2',
  },
  purple: {
    header: 'var(--aviva-purple-700)', iconColor: 'var(--aviva-purple-300)', pctColor: '#a99cff',
    metaColor: '#9087c9', fillBg: '#e6e3f7', fillColor: 'var(--aviva-purple-500)', faltanColor: '#6a5fd0',
    faltanValue: '#2b2350', logradoColor: '#ddd8f7',
  },
} as const;

export function GoalCard({ variant, icon, label, valueLabel, metaLabel, pct, faltanLabel, logradoLabel }: GoalCardProps) {
  const t = THEME[variant];
  const clampedPct = Math.max(0, Math.min(100, pct));

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden',
      boxShadow: variant === 'green' ? '0 6px 18px rgba(20,60,40,.08)' : '0 6px 18px rgba(40,30,90,.1)',
      minHeight: 250,
    }}>
      <div style={{ background: t.header, padding: '13px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.iconColor, fontSize: 10.5, fontWeight: 700, letterSpacing: '.6px' }}>
          {icon}
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 7 }}>
          <span style={{ fontSize: variant === 'green' ? 28 : 21, fontWeight: 800, color: '#fff', lineHeight: variant === 'green' ? 1 : 1.05 }}>{valueLabel}</span>
          {variant === 'green' && <span style={{ fontSize: 14, fontWeight: 600, color: t.metaColor }}>{metaLabel}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 800, color: t.pctColor }}>{clampedPct}%</span>
        </div>
        {variant === 'purple' && (
          <div style={{ fontSize: 11.5, fontWeight: 600, color: t.metaColor, marginTop: 2 }}>{metaLabel}</div>
        )}
      </div>
      <div style={{ flex: 1, position: 'relative', margin: 7, borderRadius: 14, overflow: 'hidden', background: t.fillBg }}>
        <div style={{ position: 'absolute', top: 12, left: 0, right: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.8px', color: t.faltanColor }}>FALTAN</div>
          <div style={{ fontSize: variant === 'green' ? 24 : 18, fontWeight: 800, color: t.faltanValue, marginTop: 1 }}>{faltanLabel}</div>
        </div>
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: `${clampedPct}%`, background: t.fillColor,
          borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          transition: 'height .4s cubic-bezier(.22,1,.36,1)',
        }}>
          <span style={{ fontSize: variant === 'green' ? 22 : 18, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{logradoLabel}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: t.logradoColor, marginTop: 2 }}>has logrado</span>
        </div>
      </div>
    </div>
  );
}
