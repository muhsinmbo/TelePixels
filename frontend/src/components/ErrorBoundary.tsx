import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-[var(--background)]">
          <div className="glass-panel p-12 max-w-2xl w-full text-center space-y-6">
            <div className="text-danger text-5xl font-bold">Oops!</div>
            <h2 className="text-2xl font-bold">Something went wrong</h2>
            <p className="text-muted">
              The application encountered an unexpected error. Please try refreshing the page.
            </p>
            {error && (
              <pre className="bg-black/30 p-4 rounded-xl text-left text-xs text-danger overflow-auto max-h-48">
                {error.message}
              </pre>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="glass-btn bg-primary text-black font-bold px-8"
            >
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
