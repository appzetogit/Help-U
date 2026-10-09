import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Worker App Error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen" style={{ background: 'linear-gradient(135deg, #FCD34D 0%, #FDE68A 50%, #FFFFFF 100%)' }}>
          <div className="flex flex-col items-center gap-4 p-6 max-w-md mx-auto">
            <div className="text-6xl">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-800 text-center">Something went wrong</h2>
            <p className="text-gray-600 text-center">
              The worker app encountered an error. Please try refreshing the page.
            </p>
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="px-6 py-3 rounded-xl font-semibold text-white transition-all duration-300"
              style={{
                background: '#00a6a6',
                boxShadow: '0 4px 12px rgba(0, 166, 166, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 166, 166, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 166, 166, 0.3)';
              }}
            >
              Refresh Page
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 p-4 bg-red-50 rounded-lg max-w-full overflow-auto">
                <summary className="cursor-pointer font-semibold text-red-800 mb-2">Error Details (Dev Only)</summary>
                <pre className="text-xs text-red-700 whitespace-pre-wrap">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
