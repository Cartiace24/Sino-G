import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AppShell } from './components/common/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { ToastProvider } from './components/common/Toast';
import { ConfirmProvider } from './components/common/ConfirmSheet';
import { LoadingRows } from './components/common/Feedback';

// Route-level code splitting: every page is its own chunk, loaded on visit.
// Providers, router, shell, and auth stay in the eagerly loaded entry bundle.
const Welcome = lazy(() => import('./pages/Welcome').then((m) => ({ default: m.Welcome })));
const Login = lazy(() => import('./pages/auth/Login').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/auth/Register').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() =>
  import('./pages/auth/ForgotPassword').then((m) => ({ default: m.ForgotPassword })),
);
const ResetPassword = lazy(() =>
  import('./pages/auth/ResetPassword').then((m) => ({ default: m.ResetPassword })),
);
const OnboardingProfile = lazy(() =>
  import('./pages/onboarding/OnboardingProfile').then((m) => ({ default: m.OnboardingProfile })),
);
const OnboardingGroup = lazy(() =>
  import('./pages/onboarding/OnboardingGroup').then((m) => ({ default: m.OnboardingGroup })),
);
const Today = lazy(() => import('./pages/today/Today').then((m) => ({ default: m.Today })));
const Plan = lazy(() => import('./pages/plan/Plan').then((m) => ({ default: m.Plan })));
const Groups = lazy(() => import('./pages/groups/Groups').then((m) => ({ default: m.Groups })));
const GroupDetail = lazy(() =>
  import('./pages/groups/GroupDetail').then((m) => ({ default: m.GroupDetail })),
);
const GroupSettings = lazy(() =>
  import('./pages/groups/GroupSettings').then((m) => ({ default: m.GroupSettings })),
);
const GroupChat = lazy(() =>
  import('./pages/groups/GroupChat').then((m) => ({ default: m.GroupChat })),
);
const Availability = lazy(() =>
  import('./pages/availability/Availability').then((m) => ({ default: m.Availability })),
);
const Hangouts = lazy(() => import('./pages/hangouts/Hangouts').then((m) => ({ default: m.Hangouts })));
const HangoutDetail = lazy(() =>
  import('./pages/hangouts/HangoutDetail').then((m) => ({ default: m.HangoutDetail })),
);
const Me = lazy(() => import('./pages/profile/Me').then((m) => ({ default: m.Me })));
const Settings = lazy(() => import('./pages/profile/Settings').then((m) => ({ default: m.Settings })));
const NotificationsPage = lazy(() =>
  import('./pages/notifications/Notifications').then((m) => ({ default: m.NotificationsPage })),
);

/** Per-route tab titles (tabs/history show every screen distinctly). */
function useRouteTitle(pathname: string): void {
  useEffect(() => {
    let title = "Who's Free?";
    if (pathname === '/login') title = 'Log in';
    else if (pathname === '/register') title = 'Create account';
    else if (pathname.startsWith('/forgot') || pathname === '/forgot-password') title = 'Reset password';
    else if (pathname === '/reset-password') title = 'New password';
    else if (pathname === '/onboarding/profile') title = 'Your profile';
    else if (pathname === '/onboarding/group') title = 'Find your group';
    else if (pathname === '/today') title = 'Today';
    else if (pathname === '/plan' || pathname.endsWith('/availability')) title = 'Plan';
    else if (pathname === '/groups') title = 'Groups';
    else if (pathname.endsWith('/settings')) title = 'Group settings';
    else if (pathname.endsWith('/chat')) title = 'Group chat';
    else if (pathname.startsWith('/groups/')) title = 'Group';
    else if (pathname === '/availability') title = 'My availability';
    else if (pathname === '/g') title = "Who's down?";
    else if (pathname.startsWith('/g/')) title = 'Hangout';
    else if (pathname === '/me') title = 'Me';
    else if (pathname === '/settings') title = 'Settings';
    else if (pathname === '/notifications') title = 'Notifications';
    document.title = `${title} · Sino G`;
  }, [pathname]);
}

function AppRoutes() {
  // resetKey: navigating away from a crashed route clears the error so the
  // boundary can never trap the app permanently.
  const { pathname } = useLocation();
  useRouteTitle(pathname);
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<LoadingRows rows={5} />}>
        <Routes>
          <Route element={<AppShell />}>
            {/* Public */}
            <Route path="/" element={<Welcome />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/forgot" element={<Navigate to="/forgot-password" replace />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Onboarding (authed, profile may be incomplete) */}
            <Route element={<ProtectedRoute allowIncomplete />}>
              <Route path="/onboarding/profile" element={<OnboardingProfile />} />
              <Route path="/onboarding/group" element={<OnboardingGroup />} />
            </Route>

            {/* Main app (authed + profile complete) */}
            <Route element={<ProtectedRoute />}>
              <Route path="/today" element={<Today />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/groups/:groupId" element={<GroupDetail />} />
              <Route path="/groups/:groupId/settings" element={<GroupSettings />} />
            <Route path="/groups/:groupId/chat" element={<GroupChat />} />
              <Route path="/groups/:groupId/availability" element={<Plan />} />
              <Route path="/availability" element={<Availability />} />
              <Route path="/g" element={<Hangouts />} />
              <Route path="/g/:hangoutId" element={<HangoutDetail />} />
              <Route path="/me" element={<Me />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="*" element={<Welcome />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppRoutes />
      </ConfirmProvider>
    </ToastProvider>
  );
}
