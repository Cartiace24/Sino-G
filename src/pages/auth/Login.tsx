import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LoginCard } from '../../components/auth/LoginCard';

export function Login() {
  const { user, loading, isRecoverySession } = useAuth();

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
