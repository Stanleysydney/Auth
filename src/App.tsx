import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClerkLoaded,
  ClerkLoading,
  Show,
  UserButton,
  useClerk,
  useSignIn,
  useSignUp,
  useUser
} from "@clerk/react";

type AppProps = {
  isClerkConfigured?: boolean;
};

type AuthMessage = {
  title: string;
  detail: string;
};

type ClerkNavigationParams = {
  session?: {
    currentTask?: unknown;
  } | null;
  decorateUrl: (url: string) => string;
};

const HOME_PATH = "/";
const SIGN_IN_PATH = "/sign-in";
const SSO_CALLBACK_PATH = "/sso-callback";
const CONTINUE_PATH = "/sign-in/continue";

const clerkSafeAuthMessage: AuthMessage = {
  title: "We could not complete sign-in.",
  detail: "Please try Google sign-in again. If the issue continues, contact support."
};

function navigateTo(path: string, replace = false) {
  if (path.startsWith("http")) {
    window.location.assign(path);
    return;
  }

  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function useCurrentPath() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePathChange = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePathChange);
    return () => window.removeEventListener("popstate", handlePathChange);
  }, []);

  return path;
}

export default function App({ isClerkConfigured = true }: AppProps) {
  if (!isClerkConfigured) {
    return <MissingClerkConfig />;
  }

  return (
    <>
      <ClerkLoading>
        <LoadingScreen label="Preparing secure sign-in" />
      </ClerkLoading>
      <ClerkLoaded>
        <AuthenticatedRoutes />
      </ClerkLoaded>
    </>
  );
}

function AuthenticatedRoutes() {
  const path = useCurrentPath();

  if (path === SSO_CALLBACK_PATH) {
    return <SsoCallbackPage />;
  }

  if (path === CONTINUE_PATH) {
    return <ContinuePage />;
  }

  return (
    <AuthShell>
      <Show when="signed-out">
        <SignInPage />
      </Show>
      <Show when="signed-in">
        <DashboardPage />
      </Show>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-stage" aria-label="Authentication">
        <div className="brand-strip" aria-hidden="true">
          <div className="brand-mark">A</div>
          <span>Auth</span>
        </div>
        {children}
      </section>
    </main>
  );
}

function SignInPage() {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<AuthMessage | null>(null);

  const startGoogleSignIn = async () => {
    if (!clerk.loaded || !signIn || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const result = await signIn.sso({
        strategy: "oauth_google",
        redirectCallbackUrl: SSO_CALLBACK_PATH,
        redirectUrl: HOME_PATH
      });

      if (result.error) {
        setMessage(clerkSafeAuthMessage);
      }
    } catch (error) {
      console.error("Google sign-in failed", error);
      setMessage(clerkSafeAuthMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-grid">
      <div className="auth-copy">
        <p className="eyebrow">Secure account access</p>
        <h1>Sign in to continue</h1>
        <p className="auth-summary">
          Use your Google account to enter a protected workspace.
        </p>
      </div>

      <div className="auth-card" role="region" aria-labelledby="sign-in-title">
        <div className="card-header">
          <p className="eyebrow">Authentication</p>
          <h2 id="sign-in-title">Welcome back</h2>
        </div>

        <button
          className="google-button"
          type="button"
          onClick={startGoogleSignIn}
          disabled={!clerk.loaded || isSubmitting}
          aria-busy={isSubmitting}
        >
          <GoogleMark />
          <span>{isSubmitting ? "Opening Google" : "Continue with Google"}</span>
        </button>

        {message ? (
          <div className="auth-alert" role="alert">
            <strong>{message.title}</strong>
            <span>{message.detail}</span>
          </div>
        ) : null}

        <div className="security-list" aria-label="Security details">
          <span>OAuth handled by Clerk</span>
          <span>No password stored here</span>
          <span>Session managed by Clerk</span>
        </div>
      </div>
    </div>
  );
}

function SsoCallbackPage() {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const hasRun = useRef(false);
  const [message, setMessage] = useState<AuthMessage>({
    title: "Finishing sign-in",
    detail: "This usually takes a moment."
  });

  const handleClerkNavigation = useCallback(
    async ({ session, decorateUrl }: ClerkNavigationParams) => {
      if (session?.currentTask) {
        navigateTo(CONTINUE_PATH, true);
        return;
      }

      const url = decorateUrl(HOME_PATH);
      navigateTo(url, true);
    },
    []
  );

  useEffect(() => {
    if (!clerk.loaded || !signIn || !signUp || hasRun.current) {
      return;
    }

    hasRun.current = true;

    const finishOAuth = async () => {
      try {
        if (signIn?.status === "complete") {
          await signIn.finalize({ navigate: handleClerkNavigation });
          return;
        }

        if (signUp?.isTransferable && signIn) {
          await signIn.create({ transfer: true });
          if ((signIn.status as string) === "complete") {
            await signIn.finalize({ navigate: handleClerkNavigation });
            return;
          }
          navigateTo(SIGN_IN_PATH, true);
          return;
        }

        if (
          signIn?.status === "needs_first_factor" &&
          !signIn.supportedFirstFactors?.every(
            (factor) => factor.strategy === "enterprise_sso"
          )
        ) {
          navigateTo(SIGN_IN_PATH, true);
          return;
        }

        if (signIn?.isTransferable && signUp) {
          await signUp.create({ transfer: true });
          if (signUp.status === "complete") {
            await signUp.finalize({ navigate: handleClerkNavigation });
            return;
          }
          navigateTo(CONTINUE_PATH, true);
          return;
        }

        if (signUp?.status === "complete") {
          await signUp.finalize({ navigate: handleClerkNavigation });
          return;
        }

        if (
          signIn?.status === "needs_second_factor" ||
          signIn?.status === "needs_new_password"
        ) {
          navigateTo(SIGN_IN_PATH, true);
          return;
        }

        const sessionId =
          signIn?.existingSession?.sessionId || signUp?.existingSession?.sessionId;

        if (sessionId) {
          await clerk.setActive({
            session: sessionId,
            navigate: handleClerkNavigation
          });
          return;
        }

        setMessage(clerkSafeAuthMessage);
      } catch (error) {
        console.error("OAuth callback failed", error);
        setMessage(clerkSafeAuthMessage);
      }
    };

    void finishOAuth();
  }, [
    clerk,
    handleClerkNavigation,
    signIn,
    signUp
  ]);

  return (
    <StatusShell title={message.title} detail={message.detail}>
      <div id="clerk-captcha" />
    </StatusShell>
  );
}

function ContinuePage() {
  return (
    <StatusShell
      title="More information is required"
      detail="Return to sign-in and complete any additional requirements configured for this Clerk application."
    >
      <button className="secondary-button" type="button" onClick={() => navigateTo(SIGN_IN_PATH)}>
        Back to sign-in
      </button>
      <div id="clerk-captcha" />
    </StatusShell>
  );
}

function DashboardPage() {
  const { user } = useUser();
  const displayName =
    user?.firstName || user?.primaryEmailAddress?.emailAddress || "your account";

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Signed in</p>
          <h1>Welcome, {displayName}</h1>
        </div>
        <UserButton />
      </header>
      <section className="session-panel" aria-label="Active session">
        <span>Protected session active</span>
        <p>Your authentication is managed by Clerk.</p>
      </section>
    </div>
  );
}

function MissingClerkConfig() {
  return (
    <StatusShell
      title="Clerk is not configured"
      detail="Add VITE_CLERK_PUBLISHABLE_KEY to a local .env file, then restart the dev server."
    >
      <code className="env-code">VITE_CLERK_PUBLISHABLE_KEY=pk_test_...</code>
    </StatusShell>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <StatusShell title={label} detail="Loading authentication services.">
      <div className="loader" aria-hidden="true" />
    </StatusShell>
  );
}

function StatusShell({
  title,
  detail,
  children
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="status-shell">
      <section className="status-card" aria-live="polite">
        <div className="status-icon" aria-hidden="true" />
        <h1>{title}</h1>
        <p>{detail}</p>
        {children}
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg
      className="google-mark"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Google"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.4-1.1 2.7-2.3 3.5v2.9h3.7c2.2-2 3.6-5 3.6-8.5Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.1-4.2 1.1-3.1 0-5.7-2.1-6.7-4.9H1.5v3C3.4 21.3 7.4 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4v-3H1.5C.6 8.2 0 10.1 0 12s.6 3.8 1.5 5.4l3.8-3Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.3-3.3C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.5 6.6l3.8 3C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}
