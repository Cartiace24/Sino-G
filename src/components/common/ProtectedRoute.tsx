import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingRows } from '../common/Feedback';

/**
 * Requires a session. Finished profiles with no setup go to onboarding;
 * onboarding pages themselves opt out via `allowIncomplete`.
 */
export function ProtectedRoute({ allowIncomplete = false }: { allowIncomplete?: boolean }) {
  const { user, profile, loading, needsProfileSetup } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="main-col">
        <main className="view">
          <LoadingRows />
        </main>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: pathname }} />;
  // Profile row is created by DB trigger; if it hasn't appeared yet, wait for it.
  if (!profile) {
    return (
      <div className="main-col">
        <main className="view">
          <LoadingRows />
        </main>
      </div>
    );
  }
  if (needsProfileSetup && !allowIncomplete) return <Navigate to="/onboarding/profile" replace />;
  return <Outlet />;
}
