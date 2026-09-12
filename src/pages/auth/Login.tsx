import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingRows } from '../../components/common/Feedback';
import { LoginCard } from '../../components/auth/LoginCard';

export function Login() {
  const { user, loading, isRecoverySession } = useAuth();

  // Same boot gate as Welcome: never flash the form at a logged-in visitor
  // while the session is still being restored.
  if (loading) {
    return (
      <div className="auth-wrap">
        <LoadingRows rows={3} />
      </div>
    );
  }
  if (!loading && user && !isRecoverySession) return <Navigate to="/today" replace />;

  return (
    <div className="auth-wrap">
      <Link className="backlink" to="/">
        <ArrowLeft size={16} /> BACK
      </Link>
      <div style={{ height: 6 }} />
      <LoginCard idPrefix="login" />
    </div>
  );
}
