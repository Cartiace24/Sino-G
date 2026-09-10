import { Link } from 'react-router-dom';

const STEPS = ['PROFILE', 'GROUP', 'TODAY'] as const;

/**
 * 3-dot onboarding progress (Profile → Group → Today).
 * Purely visual; pages own their Back/continue navigation.
 */
export function OnboardingProgress({ step, backTo }: { step: 1 | 2; backTo?: string }) {
  return (
    <div>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <p className="kicker">STEP {step} OF 2</p>
        {backTo && (
          <Link className="small link-u muted" to={backTo}>
            ← Back
          </Link>
        )}
      </div>
      <div
        aria-hidden
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}
      >
        {STEPS.map((label, i) => {
          const n = i + 1;
          const current = n === step;
          return (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: n <= step ? 'var(--green)' : 'transparent',
                  border: '1.5px solid var(--ink)',
                  outline: current ? '2px solid var(--ink)' : 'none',
                  outlineOffset: 2,
                }}
              />
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '.12em',
                  color: n <= step ? 'var(--ink)' : 'var(--muted)',
                }}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <span style={{ width: 18, height: 1.5, background: 'var(--line)' }} />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
